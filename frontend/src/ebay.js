// ebay.js - Dedicated eBay Antique Tracker Logic for Isla Intelligence
import { auth, db } from './firebase.js';
import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  setDoc,
  doc,
  query,
  where,
  onSnapshot,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';

function getWorkerUrl() {
  const url = import.meta.env.VITE_WORKER_URL;
  if (!url || typeof url !== 'string' || !url.startsWith('http') || url.includes('VITE_WORKER_URL')) {
    return 'https://isla-intelligence-proxy.isingingbanana.workers.dev';
  }
  return url;
}

const WORKER_URL = getWorkerUrl();
const WORKER_BASE = WORKER_URL.replace(/\/$/, '');
const ISLA_SECRET = import.meta.env.VITE_ISLA_SECRET || '';

/**
 * Build the security headers required by the Cloudflare Worker.
 * Matches the same pattern as api.js — always send X-Isla-Token and
 * Authorization: Bearer <firebase-id-token> on every Worker request.
 */
async function getWorkerHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (ISLA_SECRET) headers['X-Isla-Token'] = ISLA_SECRET;
  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const idToken = await currentUser.getIdToken();
      if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
    }
  } catch (err) {

  }
  return headers;
}

let ebayLoaded = false;
let trackerUnsubscribe = null;
let activeTrackersList = [];
let isFeedLoading = false;
let favoritesUnsubscribe = null;
let savedItemIds = new Set();
let savedItemsList = [];
let lastFetchedFeedItems = [];
let lastFeedFetchTime = 0;

window._handleLikeClick = function (btn, itemId, encodedItem) {
  const icon = btn.querySelector('span');
  if (icon) {
    const isCurrentlyLiked = icon.textContent === 'favorite';
    if (isCurrentlyLiked) {
      icon.textContent = 'favorite_border';
      icon.style.color = '#ac2471';
      icon.style.fontVariationSettings = '"FILL" 0';
    } else {
      icon.textContent = 'favorite';
      icon.style.color = '#ff2b6d';
      icon.style.fontVariationSettings = '"FILL" 1';
    }
  }
  if (window._toggleSaveEbayItem) {
    window._toggleSaveEbayItem(itemId, encodedItem);
  }
};

let currentReelsIndex = 0;
let currentPhotoIndex = 0;
let currentItemPhotos = [];
let reelsScrollCooldown = false;
let reelsTouchStartX = 0;
let reelsTouchEndX = 0;
let reelsTouchStartY = 0;
let reelsTouchEndY = 0;
let watchedItemIds = new Set(JSON.parse(localStorage.getItem('watchedItemIds') || '[]'));

function getItemPhotos(item) {
  if (!item) return [];
  const photos = [];
  const mainPhoto = extractImageUrl(item);
  if (mainPhoto) photos.push(getHighResEbayImgUrl(mainPhoto));

  let addImgs = item.additionalImages || item.additional_images || item.additionalImageUrls || item.images || item.thumbnailImages || item.pictureURL || item.pictureURLSuperSize || item.pictureURLExternal || [];
  if (typeof addImgs === 'string') addImgs = [addImgs];

  if (Array.isArray(addImgs)) {
    addImgs.forEach(imgObj => {
      let url = '';
      if (typeof imgObj === 'string') {
        url = imgObj;
      } else if (typeof imgObj === 'object' && imgObj !== null) {
        url = imgObj.imageUrl || imgObj.imageURL || imgObj.url || extractImageUrl({ image: imgObj });
      }

      if (url) {
        const highRes = getHighResEbayImgUrl(url);
        if (!photos.includes(highRes)) {
          photos.push(highRes);
        }
      }
    });
  }
  return photos.length > 0 ? photos : ['https://images.unsplash.com/photo-1509048191080-d2984bad6ae5?auto=format&fit=crop&q=80&w=800'];
}

const preloadedImageUrls = new Set();

function preloadImageUrl(url) {
  if (!url || preloadedImageUrls.has(url)) return;
  preloadedImageUrls.add(url);
  const img = new Image();
  img.src = url;
}

function preloadUpcomingReelImages(currentIndex) {
  if (!lastFetchedFeedItems || lastFetchedFeedItems.length === 0) return;

  // Preload upcoming items (next 3 and previous 1)
  const indices = [currentIndex, currentIndex + 1, currentIndex + 2, currentIndex + 3, currentIndex - 1];
  indices.forEach(idx => {
    if (idx >= 0 && idx < lastFetchedFeedItems.length) {
      const item = lastFetchedFeedItems[idx];
      const photos = getItemPhotos(item);
      photos.forEach(photoUrl => preloadImageUrl(photoUrl));
    }
  });
}

function updateReelsPhotoDisplay() {
  if (!currentItemPhotos || currentItemPhotos.length === 0) return;
  if (currentPhotoIndex < 0) currentPhotoIndex = 0;
  if (currentPhotoIndex >= currentItemPhotos.length) currentPhotoIndex = currentItemPhotos.length - 1;

  const imgEl = document.getElementById('reels-card-img');
  const counterEl = document.getElementById('reels-photo-counter');
  const btnPrevPhoto = document.getElementById('btn-reels-photo-prev');
  const btnNextPhoto = document.getElementById('btn-reels-photo-next');

  const newPhotoUrl = currentItemPhotos[currentPhotoIndex];
  if (imgEl && imgEl.src !== newPhotoUrl) {
    // Dim briefly during photo swap if not yet in memory cache so old photo never flickers
    imgEl.style.transition = 'opacity 0.15s ease-in-out';
    if (!imgEl.complete) imgEl.style.opacity = '0.3';
    imgEl.src = newPhotoUrl;
    if (imgEl.complete) {
      imgEl.style.opacity = '1';
    } else {
      imgEl.onload = () => { imgEl.style.opacity = '1'; };
      imgEl.onerror = () => { imgEl.style.opacity = '1'; };
    }
  }

  // Preload adjacent photos of current item
  if (currentItemPhotos[currentPhotoIndex + 1]) preloadImageUrl(currentItemPhotos[currentPhotoIndex + 1]);
  if (currentItemPhotos[currentPhotoIndex - 1]) preloadImageUrl(currentItemPhotos[currentPhotoIndex - 1]);

  if (counterEl) {
    if (currentItemPhotos.length > 1) {
      counterEl.textContent = `📷 ${currentPhotoIndex + 1} / ${currentItemPhotos.length}`;
      counterEl.classList.remove('hidden');
    } else {
      counterEl.classList.add('hidden');
    }
  }

  if (btnPrevPhoto) {
    if (currentItemPhotos.length > 1 && currentPhotoIndex > 0) {
      btnPrevPhoto.classList.remove('hidden');
    } else {
      btnPrevPhoto.classList.add('hidden');
    }
  }

  if (btnNextPhoto) {
    if (currentItemPhotos.length > 1 && currentPhotoIndex < currentItemPhotos.length - 1) {
      btnNextPhoto.classList.remove('hidden');
    } else {
      btnNextPhoto.classList.add('hidden');
    }
  }
}

function getHighResEbayImgUrl(url) {
  if (!url) return '';
  // Force HTTPS to prevent browser Mixed Content image blocking
  let secureUrl = url.replace(/^http:\/\//i, 'https://');
  if (secureUrl.includes('unsplash.com')) {
    return secureUrl.replace(/w=\d+/, 'w=800');
  }
  if (secureUrl.includes('ebayimg.com')) {
    // Remove /thumbs/ from path and request eBay's s-l1600 high-res master image
    return secureUrl.replace(/\/thumbs\//i, '/').replace(/\/s-l\d+/i, '/s-l1600');
  }
  return secureUrl;
}

function extractImageUrl(item) {
  if (!item) return 'https://images.unsplash.com/photo-1509048191080-d2984bad6ae5?auto=format&fit=crop&q=80&w=400';

  let found = '';

  if (typeof item.imageUrl === 'string' && item.imageUrl.startsWith('http')) found = item.imageUrl;
  else if (typeof item.image_url === 'string' && item.image_url.startsWith('http')) found = item.image_url;
  else if (typeof item.imageURL === 'string' && item.imageURL.startsWith('http')) found = item.imageURL;
  else if (typeof item.img === 'string' && item.img.startsWith('http')) found = item.img;
  else if (item.image) {
    if (typeof item.image === 'string' && item.image.startsWith('http')) found = item.image;
    else if (typeof item.image === 'object') {
      if (typeof item.image.imageUrl === 'string' && item.image.imageUrl.startsWith('http')) found = item.image.imageUrl;
      else if (typeof item.image.url === 'string' && item.image.url.startsWith('http')) found = item.image.url;
      else if (typeof item.image.imageURL === 'string' && item.image.imageURL.startsWith('http')) found = item.image.imageURL;
      else if (typeof item.image.img === 'string' && item.image.img.startsWith('http')) found = item.image.img;
    }
  }

  if (!found) {
    for (const key in item) {
      if (typeof item[key] === 'string' && item[key].startsWith('http') && !item[key].includes('ebay.co.uk/itm')) {
        found = item[key];
        break;
      }
    }
  }

  if (!found) {
    found = 'https://images.unsplash.com/photo-1509048191080-d2984bad6ae5?auto=format&fit=crop&q=80&w=400';
  }

  return found.replace(/^http:\/\//i, 'https://');
}

export function initEbayView() {
  const btnEbayTab = document.getElementById('btn-ebay-tab');
  const headerEbayBtn = document.getElementById('btn-header-ebay');
  const widgetEbayBtn = document.getElementById('widget-ebay');
  const ebayDrawer = document.getElementById('ebay-drawer');
  const btnCloseEbayDrawer = document.getElementById('btn-close-ebay-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');

  if (!ebayDrawer || !btnCloseEbayDrawer || !drawerBackdrop) return;

  const toggleEbayDrawer = () => {
    const isDrawerOpen = ebayDrawer.classList.contains('open');
    if (isDrawerOpen) {
      closeEbayDrawer();
    } else {
      openEbayDrawer();
    }
  };

  if (btnEbayTab) btnEbayTab.addEventListener('click', toggleEbayDrawer);
  if (headerEbayBtn) headerEbayBtn.addEventListener('click', toggleEbayDrawer);
  if (widgetEbayBtn) widgetEbayBtn.addEventListener('click', toggleEbayDrawer);

  btnCloseEbayDrawer.addEventListener('click', () => {
    closeEbayDrawer();
  });

  drawerBackdrop.addEventListener('click', () => {
    if (ebayDrawer.classList.contains('open')) {
      closeEbayDrawer();
    }
  });

  // Collapsible Price Alert Form
  const btnToggleCreateAlert = document.getElementById('btn-toggle-create-alert');
  const formEbayAlert = document.getElementById('ebay-alert-form');
  const chevronCreateAlert = document.getElementById('chevron-create-alert');

  if (btnToggleCreateAlert && formEbayAlert && chevronCreateAlert) {
    btnToggleCreateAlert.addEventListener('click', () => {
      const isHidden = formEbayAlert.classList.contains('hidden');
      if (isHidden) {
        formEbayAlert.classList.remove('hidden');
        chevronCreateAlert.style.transform = 'rotate(180deg)';
      } else {
        formEbayAlert.classList.add('hidden');
        chevronCreateAlert.style.transform = 'rotate(0deg)';
      }
    });
  }

  // Collapsible Advanced Filters
  const btnToggleAdvancedFilters = document.getElementById('btn-toggle-advanced-filters');
  const advancedFiltersContent = document.getElementById('advanced-filters-content');
  const chevronAdvancedFilters = document.getElementById('chevron-advanced-filters');

  if (btnToggleAdvancedFilters && advancedFiltersContent && chevronAdvancedFilters) {
    btnToggleAdvancedFilters.addEventListener('click', () => {
      const isHidden = advancedFiltersContent.classList.contains('hidden');
      if (isHidden) {
        advancedFiltersContent.classList.remove('hidden');
        chevronAdvancedFilters.style.transform = 'rotate(180deg)';
      } else {
        advancedFiltersContent.classList.add('hidden');
        chevronAdvancedFilters.style.transform = 'rotate(0deg)';
      }
    });
  }

  // Collapsible Filter from Image Section
  const btnToggleFilterImage = document.getElementById('btn-toggle-filter-image');
  const filterImageContent = document.getElementById('filter-image-content');
  const chevronFilterImage = document.getElementById('chevron-filter-image');

  if (btnToggleFilterImage && filterImageContent && chevronFilterImage) {
    btnToggleFilterImage.addEventListener('click', () => {
      const isHidden = filterImageContent.classList.contains('hidden');
      if (isHidden) {
        filterImageContent.classList.remove('hidden');
        chevronFilterImage.style.transform = 'rotate(180deg)';
      } else {
        filterImageContent.classList.add('hidden');
        chevronFilterImage.style.transform = 'rotate(0deg)';
      }
    });
  }

  // Set up Alert Creation Submission
  if (formEbayAlert) {
    formEbayAlert.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleCreateAlert();
    });
  }

  // Set up Refresh Feed button
  const btnRefreshFeed = document.getElementById('btn-refresh-ebay-feed');
  if (btnRefreshFeed) {
    btnRefreshFeed.addEventListener('click', () => {
      refreshMatchedListingsFeed();
    });
  }

  // Initialize screenshot upload & image filter listeners
  initScreenshotUpload();

  // Set up Feed vs Saved Tab Switching
  const btnShowFeed = document.getElementById('btn-show-feed');
  const btnShowSaved = document.getElementById('btn-show-saved');
  const feedTabContent = document.getElementById('ebay-feed-tab-content');
  const savedContainer = document.getElementById('ebay-saved-container');

  if (btnShowFeed && btnShowSaved && feedTabContent && savedContainer) {
    btnShowFeed.addEventListener('click', () => {
      feedTabContent.classList.remove('hidden');
      savedContainer.classList.add('hidden');
      btnShowFeed.classList.add('border-b-2', 'border-[#ac2471]', 'text-primary');
      btnShowFeed.classList.remove('text-on-surface-variant/75');
      btnShowSaved.classList.remove('border-b-2', 'border-[#ac2471]', 'text-primary');
      btnShowSaved.classList.add('text-on-surface-variant/75');
    });

    btnShowSaved.addEventListener('click', () => {
      feedTabContent.classList.add('hidden');
      savedContainer.classList.remove('hidden');
      btnShowSaved.classList.add('border-b-2', 'border-[#ac2471]', 'text-primary');
      btnShowSaved.classList.remove('text-on-surface-variant/75');
      btnShowFeed.classList.remove('border-b-2', 'border-[#ac2471]', 'text-primary');
      btnShowFeed.classList.add('text-on-surface-variant/75');
      renderSavedItemsList();
    });
  }

  // Launch Fullscreen Reels Button
  const btnOpenReels = document.getElementById('btn-open-reels');
  if (btnOpenReels) {
    btnOpenReels.addEventListener('click', () => {
      openAntiqueReelsFeed();
    });
  }

  // Fullscreen Reels close button
  const btnCloseReels = document.getElementById('btn-close-reels');
  const reelsModal = document.getElementById('antique-reels-modal');
  if (btnCloseReels && reelsModal) {
    btnCloseReels.addEventListener('click', () => {
      closeReelsModalAndCleanWatched();
    });
  }

  // Reels End Card actions
  const btnReelsEndClose = document.getElementById('btn-reels-end-close');
  if (btnReelsEndClose) {
    btnReelsEndClose.addEventListener('click', () => {
      closeReelsModalAndCleanWatched();
    });
  }

  const btnReelsEndRefresh = document.getElementById('btn-reels-end-refresh');
  if (btnReelsEndRefresh) {
    btnReelsEndRefresh.addEventListener('click', async () => {
      watchedItemIds.clear();
      localStorage.removeItem('watchedItemIds');

      const endContainer = document.getElementById('reels-end-container');
      if (endContainer) endContainer.classList.add('hidden');

      const emptyState = document.getElementById('reels-empty-state');
      const spinner = document.getElementById('reels-spinner');
      const emptyTitle = document.getElementById('reels-empty-title');
      const emptyDesc = document.getElementById('reels-empty-desc');

      if (emptyState) {
        emptyState.classList.remove('hidden');
        if (spinner) spinner.classList.remove('hidden');
        if (emptyTitle) emptyTitle.textContent = 'Refreshing Antiques';
        if (emptyDesc) emptyDesc.textContent = 'Bot searching eBay for updated listings...';
      }

      await refreshMatchedListingsFeed();

      if (lastFetchedFeedItems && lastFetchedFeedItems.length > 0) {
        if (emptyState) emptyState.classList.add('hidden');
        changeReelsCard(0, null);
      } else {
        if (emptyState) {
          if (spinner) spinner.classList.add('hidden');
          if (emptyTitle) emptyTitle.textContent = 'No Matches Sourced';
          if (emptyDesc) emptyDesc.textContent = 'No active matching items found on eBay. Go back and create some trackers with different keywords mate';
        }
      }
    });
  }

  // On-screen Next/Prev Chevron Buttons (Reels)
  const btnReelsNext = document.getElementById('btn-reels-next');
  if (btnReelsNext) {
    btnReelsNext.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentReelsIndex < lastFetchedFeedItems.length) {
        changeReelsCard(currentReelsIndex + 1, 'up');
      }
    });
  }

  const btnReelsPrev = document.getElementById('btn-reels-prev');
  if (btnReelsPrev) {
    btnReelsPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentReelsIndex > 0) {
        changeReelsCard(currentReelsIndex - 1, 'down');
      }
    });
  }

  // Multi-photo Navigation Buttons (Left/Right Chevrons)
  const btnPrevPhoto = document.getElementById('btn-reels-photo-prev');
  if (btnPrevPhoto) {
    btnPrevPhoto.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentPhotoIndex > 0) {
        currentPhotoIndex--;
        updateReelsPhotoDisplay();
      }
    });
  }

  const btnNextPhoto = document.getElementById('btn-reels-photo-next');
  if (btnNextPhoto) {
    btnNextPhoto.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentItemPhotos && currentPhotoIndex < currentItemPhotos.length - 1) {
        currentPhotoIndex++;
        updateReelsPhotoDisplay();
      }
    });
  }

  // Image Fit Toggle (Fit Screen vs Fill Screen)
  const btnReelsFit = document.getElementById('btn-reels-fit');
  if (btnReelsFit) {
    btnReelsFit.addEventListener('click', (e) => {
      e.stopPropagation();
      const imgEl = document.getElementById('reels-card-img');
      if (imgEl) {
        if (imgEl.classList.contains('object-contain')) {
          imgEl.classList.remove('object-contain');
          imgEl.classList.add('object-cover');
        } else {
          imgEl.classList.remove('object-cover');
          imgEl.classList.add('object-contain');
        }
      }
    });
  }

  // Unified Single-Tap (Switch Photo Left/Right) vs Double-Tap (TikTok Like/Unlike Animation)
  let lastTapTime = 0;
  let tapTimeout = null;

  const reelsMediaContainer = document.getElementById('reels-media-container');
  if (reelsMediaContainer) {
    reelsMediaContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTapTime;
      const rect = reelsMediaContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;

      if (tapLength < 280 && tapLength > 0) {
        // DOUBLE TAP -> Cancel single-tap and trigger TikTok Like animation
        if (tapTimeout) {
          clearTimeout(tapTimeout);
          tapTimeout = null;
        }
        lastTapTime = 0;
        handleDoubleTapLike();
      } else {
        // SINGLE TAP -> Wait 220ms to distinguish from double-tap
        lastTapTime = currentTime;
        tapTimeout = setTimeout(() => {
          tapTimeout = null;
          if (clickX > rect.width / 2) {
            // Tapped right half -> Next photo
            if (currentItemPhotos && currentPhotoIndex < currentItemPhotos.length - 1) {
              currentPhotoIndex++;
              updateReelsPhotoDisplay();
            }
          } else {
            // Tapped left half -> Previous photo
            if (currentItemPhotos && currentPhotoIndex > 0) {
              currentPhotoIndex--;
              updateReelsPhotoDisplay();
            }
          }
        }, 220);
      }
    });
  }

  // 2D Touch Swipe Gestures (Vertical = Switch Reel, Horizontal = Switch Photo)
  window.addEventListener('touchstart', e => {
    if (reelsModal && !reelsModal.classList.contains('hidden')) {
      reelsTouchStartX = e.changedTouches[0].screenX;
      reelsTouchStartY = e.changedTouches[0].screenY;
    }
  });

  window.addEventListener('touchend', e => {
    if (reelsModal && !reelsModal.classList.contains('hidden')) {
      reelsTouchEndX = e.changedTouches[0].screenX;
      reelsTouchEndY = e.changedTouches[0].screenY;
      handleReelsSwipe();
    }
  });

  // Mouse Drag Gestures (Desktop 2D: Vertical = Cards, Horizontal = Photos)
  let reelsMouseStartX = 0;
  let reelsMouseStartY = 0;
  let isReelsMouseDown = false;

  window.addEventListener('mousedown', e => {
    if (reelsModal && !reelsModal.classList.contains('hidden')) {
      isReelsMouseDown = true;
      reelsMouseStartX = e.clientX;
      reelsMouseStartY = e.clientY;
    }
  });

  window.addEventListener('mouseup', e => {
    if (reelsModal && !reelsModal.classList.contains('hidden') && isReelsMouseDown) {
      isReelsMouseDown = false;
      const diffY = reelsMouseStartY - e.clientY;
      const diffX = reelsMouseStartX - e.clientX;

      if (Math.abs(diffY) > Math.abs(diffX)) {
        // Vertical Drag -> Switch Reel Card
        if (Math.abs(diffY) > 15) {
          reelsScrollCooldown = true;
          if (diffY > 0) {
            if (currentReelsIndex < lastFetchedFeedItems.length) {
              changeReelsCard(currentReelsIndex + 1, 'up');
            }
          } else {
            if (currentReelsIndex > 0) {
              changeReelsCard(currentReelsIndex - 1, 'down');
            }
          }
          setTimeout(() => {
            reelsScrollCooldown = false;
          }, 200);
        }
      } else {
        // Horizontal Drag -> Switch Photo
        if (Math.abs(diffX) > 15) {
          if (diffX > 0) {
            // Dragged left -> Next photo
            if (currentItemPhotos && currentPhotoIndex < currentItemPhotos.length - 1) {
              currentPhotoIndex++;
              updateReelsPhotoDisplay();
            }
          } else {
            // Dragged right -> Previous photo
            if (currentPhotoIndex > 0) {
              currentPhotoIndex--;
              updateReelsPhotoDisplay();
            }
          }
        }
      }
    }
  });

  // Keyboard Navigation (Up/Down = Reel, Left/Right = Photos)
  window.addEventListener('keydown', e => {
    if (reelsModal && !reelsModal.classList.contains('hidden')) {
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (currentReelsIndex < lastFetchedFeedItems.length) {
          changeReelsCard(currentReelsIndex + 1, 'up');
        }
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        if (currentReelsIndex > 0) {
          changeReelsCard(currentReelsIndex - 1, 'down');
        }
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        if (currentItemPhotos && currentPhotoIndex < currentItemPhotos.length - 1) {
          currentPhotoIndex++;
          updateReelsPhotoDisplay();
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        if (currentPhotoIndex > 0) {
          currentPhotoIndex--;
          updateReelsPhotoDisplay();
        }
      } else if (e.key === 'Escape') {
        closeReelsModalAndCleanWatched();
      }
    }
  });

  // Smooth Wheel Navigation with cooldown to prevent rapid repeats
  let reelsWheelCooldown = false;
  window.addEventListener('wheel', e => {
    if (reelsModal && !reelsModal.classList.contains('hidden')) {
      if (reelsWheelCooldown) return;
      if (Math.abs(e.deltaY) > 5) {
        reelsWheelCooldown = true;
        if (e.deltaY > 0) {
          if (currentReelsIndex < lastFetchedFeedItems.length) {
            changeReelsCard(currentReelsIndex + 1, 'up');
          }
        } else {
          if (currentReelsIndex > 0) {
            changeReelsCard(currentReelsIndex - 1, 'down');
          }
        }
        setTimeout(() => { reelsWheelCooldown = false; }, 200);
        e.preventDefault();
      }
    }
  }, { passive: false });

  // Double tap to like on Reels card
  let lastTap = 0;
  const activeCard = document.getElementById('reels-active-card');
  if (activeCard) {
    activeCard.addEventListener('touchend', e => {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;
      if (tapLength < 300 && tapLength > 0) {
        e.preventDefault();
        handleDoubleTapLike();
      }
      lastTap = currentTime;
    });

    activeCard.addEventListener('dblclick', e => {
      handleDoubleTapLike();
    });
  }

  // Helper to calculate seconds until the next 15-minute wall-clock cron mark (:00, :15, :30, :45)
  function getSecondsUntilNext15MinCron() {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const remainderMinutes = 15 - (minutes % 15);
    return (remainderMinutes * 60) - seconds;
  }

  let lastCronTriggerMinute = -1;

  function updateRefreshTimerDisplay() {
    const secondsRemaining = getSecondsUntilNext15MinCron();
    const timerEl = document.getElementById('ebay-refresh-timer');
    if (timerEl) {
      const mins = Math.floor(secondsRemaining / 60);
      const secs = secondsRemaining % 60;
      timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  }

  // Immediately render real countdown on init
  updateRefreshTimerDisplay();

  // Set up real cron-aligned refresh timer
  setInterval(() => {
    if (ebayLoaded) {
      const now = new Date();
      const currentMinute = now.getMinutes();

      // Automatically refresh feed when clock hits a 15-minute mark (:00, :15, :30, :45)
      if (currentMinute % 15 === 0 && now.getSeconds() === 0 && lastCronTriggerMinute !== currentMinute) {
        lastCronTriggerMinute = currentMinute;
        refreshMatchedListingsFeed();
      }

      updateRefreshTimerDisplay();
    }
  }, 1000);
}

function openEbayDrawer() {
  const ebayDrawer = document.getElementById('ebay-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');

  // Close any other open drawers
  const uvDrawer = document.getElementById('uv-drawer');
  const memoryDrawer = document.getElementById('memory-drawer');
  if (uvDrawer) uvDrawer.classList.remove('open');
  if (memoryDrawer) memoryDrawer.classList.remove('open');

  ebayDrawer.classList.add('open');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content = '#09090b';
  drawerBackdrop.classList.remove('hidden');
  drawerBackdrop.offsetWidth;
  drawerBackdrop.classList.add('show');

  // Setup favorites sync listener for active heart state updates
  if (!favoritesUnsubscribe && auth.currentUser) {
    const favQuery = query(collection(db, 'favorites'), where('userId', '==', auth.currentUser.uid));
    favoritesUnsubscribe = onSnapshot(favQuery, (snapshot) => {
      savedItemIds = new Set();
      savedItemsList = [];
      snapshot.forEach(doc => {
        const data = doc.data();

        savedItemIds.add(data.itemId);
        savedItemsList.push(data);
      });

      const reelsModal = document.getElementById('antique-reels-modal');
      const isReelsOpen = reelsModal && !reelsModal.classList.contains('hidden');
      if (!isReelsOpen) {
        lastFetchedFeedItems = lastFetchedFeedItems.filter(item => !watchedItemIds.has(item.itemId));
      }

      // Re-render components dynamically to toggle hearts
      reRenderFeedItems();
      renderSavedItemsList();
      updateWatchReelsButton();
    });
  }

  // Pre-populate email input field with current user's email if empty
  const emailInput = document.getElementById('ebay-alert-email');
  if (emailInput && !emailInput.value && auth.currentUser) {
    emailInput.value = auth.currentUser.email || '';
  }

  if (!ebayLoaded) {
    syncTrackersList();
    ebayLoaded = true;
  } else {
    refreshMatchedListingsFeed();
  }
}

function closeEbayDrawer() {
  const ebayDrawer = document.getElementById('ebay-drawer');
  const drawerBackdrop = document.getElementById('drawer-backdrop');
  ebayDrawer.classList.remove('open');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content = '#fcf9f8';

  const isMemoryOpen = document.getElementById('memory-drawer')?.classList.contains('open');
  const isUvOpen = document.getElementById('uv-drawer')?.classList.contains('open');
  if (!isMemoryOpen && !isUvOpen) {
    drawerBackdrop.classList.remove('show');
    setTimeout(() => {
      const stillMemoryOpen = document.getElementById('memory-drawer')?.classList.contains('open');
      const stillUvOpen = document.getElementById('uv-drawer')?.classList.contains('open');
      const stillEbayOpen = document.getElementById('ebay-drawer')?.classList.contains('open');
      if (!stillMemoryOpen && !stillUvOpen && !stillEbayOpen) {
        drawerBackdrop.classList.add('hidden');
      }
    }, 300);
  }
}

// ── Screenshots & Identification ───────────────────────────

function initScreenshotUpload() {
  const uploadZone = document.getElementById('ebay-upload-zone');
  const screenshotInput = document.getElementById('ebay-screenshot-input');

  if (!uploadZone || !screenshotInput) return;

  uploadZone.addEventListener('click', () => {
    screenshotInput.click();
  });

  screenshotInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  // Drag over animations
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });
}

async function handleFileSelected(file) {
  const loader = document.getElementById('ebay-identifying-loader');
  const resultCard = document.getElementById('ebay-id-result-card');
  const resultsContainer = document.getElementById('ebay-results-container');

  if (loader) loader.classList.remove('hidden');
  if (resultCard) resultCard.classList.add('hidden');
  if (resultsContainer) resultsContainer.classList.add('hidden');

  try {
    const base64Data = await convertFileToBase64(file);
    const mimeType = file.type;

    // Call identify endpoint in Cloudflare Worker
    const identifyUrl = `${WORKER_BASE}/api/ebay/identify`;
    const res = await fetch(identifyUrl, {
      method: 'POST',
      headers: await getWorkerHeaders(),
      body: JSON.stringify({
        imageBase64: base64Data,
        imageMimeType: mimeType
      })
    });

    if (!res.ok) {
      throw new Error(`Identify failed with status ${res.status}`);
    }

    const idResult = await res.json();
    const itemName = idResult.itemName || 'Unknown Antique';
    const searchKeywords = idResult.searchKeywords || '';

    // Show result details card
    const nameEl = document.getElementById('ebay-identified-name');
    const keywordsEl = document.getElementById('ebay-identified-keywords');
    if (nameEl) nameEl.textContent = itemName;
    if (keywordsEl) keywordsEl.textContent = `Keywords used: ${searchKeywords}`;
    if (resultCard) resultCard.classList.remove('hidden');

    // Set keywords in price alert query field in case they want to track it
    const queryInput = document.getElementById('ebay-alert-query');
    if (queryInput) queryInput.value = itemName;

    // Automatically expand the "Filter Your Feed" alert form container & scroll into view
    const formEbayAlert = document.getElementById('ebay-alert-form');
    const chevronCreateAlert = document.getElementById('chevron-create-alert');
    if (formEbayAlert) {
      formEbayAlert.classList.remove('hidden');
      if (chevronCreateAlert) chevronCreateAlert.style.transform = 'rotate(180deg)';
      setTimeout(() => {
        formEbayAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }

    // Search similar items on eBay
    if (searchKeywords) {
      await searchSimilarOnEbay(searchKeywords);
    }
  } catch (err) {

    alert('Oops! We had trouble recognizing this image. Please try again!');
  } finally {
    if (loader) loader.classList.add('hidden');
  }
}

async function searchSimilarOnEbay(query) {
  const container = document.getElementById('ebay-results-container');
  const grid = document.getElementById('ebay-results-grid');
  if (!container || !grid) return;

  grid.innerHTML = `
    <div class="col-span-2 flex flex-col items-center justify-center py-8 gap-2">
      <div style="width:20px;height:20px;border:2px solid rgba(172,36,113,0.15);border-top-color:#ac2471;border-radius:50%;animation:spin 0.9s linear infinite;"></div>
      <span class="text-xs text-on-surface-variant">Finding listings on eBay...</span>
    </div>
  `;
  container.classList.remove('hidden');

  try {
    const searchUrl = `${WORKER_BASE}/api/ebay/search`;
    const res = await fetch(searchUrl, {
      method: 'POST',
      headers: await getWorkerHeaders(),
      body: JSON.stringify({ query })
    });

    if (!res.ok) {
      throw new Error('eBay search proxy failed');
    }

    const searchData = await res.json();
    const items = searchData.items || [];

    if (items.length === 0) {
      grid.innerHTML = `
        <p class="col-span-2 text-center text-xs text-on-surface-variant py-4 italic">No matching products found on Bob's Bay.</p>
      `;
      return;
    }

    grid.innerHTML = items.map(item => `
      <div class="ebay-item-card">
        ${item.image ? `<img src="${item.image.imageUrl}" class="ebay-item-image" alt="${item.title}" />` : '<div class="ebay-item-image flex items-center justify-center text-on-surface-variant opacity-45"><span class="material-symbols-outlined">image</span></div>'}
        <div class="ebay-item-details">
          <span class="ebay-item-title">${item.title}</span>
          <div class="ebay-item-price-row">
            <span class="ebay-item-price">£${Number(item.price.value).toFixed(2)}</span>
            <a href="${item.itemWebUrl}" target="_blank" rel="noopener noreferrer" class="ebay-item-link-btn" title="View Listing">
              <span class="material-symbols-outlined text-sm">open_in_new</span>
            </a>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {

    grid.innerHTML = `
      <p class="col-span-2 text-center text-xs text-red-500 py-4 font-semibold">Could not load eBay items. Check connectivity.</p>
    `;
  }
}

function convertFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
      resolve(base64);
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

// ── Price Alerts Firestore Sync ────────────────────────────

async function handleCreateAlert() {
  const queryVal = document.getElementById('ebay-alert-query').value.trim();
  const minPriceVal = document.getElementById('ebay-alert-min-price').value.trim();
  const maxPriceVal = document.getElementById('ebay-alert-max-price').value.trim();
  const emailVal = document.getElementById('ebay-alert-email').value.trim();
  const conditionVal = document.getElementById('ebay-alert-condition').value;
  const formatVal = document.getElementById('ebay-alert-format').value;
  const shippingVal = document.getElementById('ebay-alert-shipping').checked;
  const frequencyVal = document.getElementById('ebay-alert-frequency').value;

  if (!queryVal || (frequencyVal !== 'never' && !emailVal)) return;

  const user = auth.currentUser;
  if (!user) {
    alert('Please sign in to save search alerts!');
    return;
  }

  const formEbayAlert = document.getElementById('ebay-alert-form');
  const editId = formEbayAlert.dataset.editId;

  if (!editId && activeTrackersList.length >= 10) {
    alert('Maximum limit of 10 active trackers reached! Please delete an existing tracker before adding a new one.');
    return;
  }

  try {
    if (editId) {
      // Update existing tracker alert
      const alertRef = doc(db, 'trackers', editId);
      await updateDoc(alertRef, {
        query: queryVal,
        minPrice: minPriceVal ? Number(minPriceVal) : 0,
        maxPrice: maxPriceVal ? Number(maxPriceVal) : 999999,
        email: emailVal || '',
        condition: conditionVal,
        buyingFormat: formatVal,
        freeShipping: shippingVal,
        frequency: frequencyVal
      });

      delete formEbayAlert.dataset.editId;
      const submitBtn = formEbayAlert.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.textContent = 'Save Filter Alert';
    } else {
      // Create new tracker alert
      const newDoc = {
        userId: user.uid,
        query: queryVal,
        minPrice: minPriceVal ? Number(minPriceVal) : 0,
        maxPrice: maxPriceVal ? Number(maxPriceVal) : 999999,
        email: emailVal || '',
        condition: conditionVal,
        buyingFormat: formatVal,
        freeShipping: shippingVal,
        frequency: frequencyVal,
        lastEmailedTime: serverTimestamp(),
        lastCheckedTime: serverTimestamp(),
        lastSeenItemIds: []
      };
      await addDoc(collection(db, 'trackers'), newDoc);
    }

    // Reset alert inputs (keep email populated for ease of use)
    document.getElementById('ebay-alert-query').value = '';
    document.getElementById('ebay-alert-min-price').value = '';
    document.getElementById('ebay-alert-max-price').value = '';
    document.getElementById('ebay-alert-condition').value = '';
    document.getElementById('ebay-alert-format').value = '';
    document.getElementById('ebay-alert-shipping').checked = false;
    document.getElementById('ebay-alert-frequency').value = 'never';

    // Collapse advanced content if expanded
    const advancedFiltersContent = document.getElementById('advanced-filters-content');
    const chevronAdvancedFilters = document.getElementById('chevron-advanced-filters');
    if (advancedFiltersContent) advancedFiltersContent.classList.add('hidden');
    if (chevronAdvancedFilters) chevronAdvancedFilters.style.transform = 'rotate(0deg)';

    // Hide form
    const chevronCreateAlert = document.getElementById('chevron-create-alert');
    if (formEbayAlert && chevronCreateAlert) {
      formEbayAlert.classList.add('hidden');
      chevronCreateAlert.style.transform = 'rotate(0deg)';
    }
  } catch (err) {

    alert('Failed to save filter alert. Try again!');
  }
}

function syncTrackersList() {
  const container = document.getElementById('ebay-trackers-list');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center justify-center py-6">
      <div style="width:20px;height:20px;border:2px solid rgba(172,36,113,0.15);border-top-color:#ac2471;border-radius:50%;animation:spin 0.9s linear infinite;"></div>
    </div>
  `;

  const user = auth.currentUser;
  if (!user) {
    container.innerHTML = `
      <p class="text-xs text-on-surface-variant text-center py-4 italic">Sign in to view your trackers.</p>
    `;
    return;
  }

  const q = query(
    collection(db, 'trackers'),
    where('userId', '==', user.uid)
  );

  trackerUnsubscribe = onSnapshot(q, (snapshot) => {
    const docs = [];
    snapshot.forEach(doc => {
      docs.push({ id: doc.id, ...doc.data() });
    });

    activeTrackersList = docs;
    refreshMatchedListingsFeed();

    if (docs.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-8 text-center text-on-surface-variant gap-2 bg-white/20 rounded-xl p-4 border border-[#ac2471]/5">
          <span class="material-symbols-outlined text-2xl text-on-surface-variant opacity-60">notifications_off</span>
          <span class="text-xs font-medium">No active price alert trackers.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    docs.forEach(t => {
      // Formatted price range
      let priceLabel = '';
      if (t.minPrice > 0 && t.maxPrice < 999999) {
        priceLabel = `Price: £${t.minPrice} - £${t.maxPrice}`;
      } else if (t.maxPrice < 999999) {
        priceLabel = `Under £${t.maxPrice}`;
      } else if (t.minPrice > 0) {
        priceLabel = `Over £${t.minPrice}`;
      } else {
        priceLabel = `Any Price`;
      }

      // Collect clear, human-readable filter details
      const details = [priceLabel];

      if (t.condition) {
        details.push(`Condition: ${t.condition === 'NEW' ? 'New' : 'Used'}`);
      }
      if (t.buyingFormat) {
        details.push(`Format: ${t.buyingFormat === 'FIXED_PRICE' ? 'Buy It Now' : 'Auction'}`);
      }
      if (t.freeShipping) {
        details.push('Free Shipping');
      }

      // Hide email address if no email alert is set or frequency is 'never'
      if (t.email && t.frequency && t.frequency !== 'never') {
        const freqLabel = t.frequency === 'daily' ? 'Daily' : (t.frequency === 'weekly' ? 'Weekly' : '15 Mins');
        details.push(`Email: ${t.email} (${freqLabel})`);
      }

      const row = document.createElement('div');
      row.className = 'flex flex-row items-center justify-between p-3.5 bg-white/40 hover:bg-white/60 border border-[#ac2471]/15 rounded-xl transition-all shadow-sm gap-3';
      row.dataset.id = t.id;
      row.innerHTML = `
        <div class="flex flex-col flex-1 min-w-0">
          <span class="tracker-alert-query text-sm font-bold text-primary truncate tracking-tight"></span>
          <span class="tracker-alert-meta text-[11px] text-on-surface-variant opacity-80 mt-1 leading-snug"></span>
        </div>
        <div class="flex items-center gap-1 select-none shrink-0 bg-white/50 rounded-lg p-1 border border-[#ac2471]/10">
          <button class="tracker-edit-btn hover:bg-[#ac2471]/10 rounded-md transition-colors" title="Edit Alert" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:none;background:transparent;color:#ac2471;cursor:pointer;">
            <span class="material-symbols-outlined text-xl">edit</span>
          </button>
          <button class="tracker-delete-btn hover:bg-red-500/10 rounded-md transition-colors" title="Delete Alert" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:none;background:transparent;color:#ef4444;cursor:pointer;">
            <span class="material-symbols-outlined text-xl">delete</span>
          </button>
        </div>
      `;

      row.querySelector('.tracker-alert-query').textContent = t.query || '';
      row.querySelector('.tracker-alert-meta').textContent = details.join(' • ');

      const editBtn = row.querySelector('.tracker-edit-btn');
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        editTrackerAlert(t);
      });

      const deleteBtn = row.querySelector('.tracker-delete-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTrackerAlert(t.id);
      });

      container.appendChild(row);
    });
  });
}

async function deleteTrackerAlert(id) {
  if (confirm('Are you sure you want to delete this price alert tart?')) {
    try {
      await deleteDoc(doc(db, 'trackers', id));
    } catch (err) {

      alert('Failed to delete tracker. Try again!');
    }
  }
}

function editTrackerAlert(t) {
  const formEbayAlert = document.getElementById('ebay-alert-form');
  const chevronCreateAlert = document.getElementById('chevron-create-alert');

  if (!formEbayAlert) return;

  // Populate inputs
  document.getElementById('ebay-alert-query').value = t.query || '';
  document.getElementById('ebay-alert-min-price').value = t.minPrice > 0 ? t.minPrice : '';
  document.getElementById('ebay-alert-max-price').value = t.maxPrice < 999999 ? t.maxPrice : '';
  document.getElementById('ebay-alert-email').value = t.email || '';
  document.getElementById('ebay-alert-condition').value = t.condition || '';
  document.getElementById('ebay-alert-format').value = t.buyingFormat || '';
  document.getElementById('ebay-alert-shipping').checked = t.freeShipping === true;
  document.getElementById('ebay-alert-frequency').value = t.frequency || 'never';

  // Set edit mode ID
  formEbayAlert.dataset.editId = t.id;
  const submitBtn = formEbayAlert.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = 'Save Filter Alert';

  // Show form
  formEbayAlert.classList.remove('hidden');
  if (chevronCreateAlert) {
    chevronCreateAlert.style.transform = 'rotate(180deg)';
  }

  // Expand advanced filters content if active
  const advancedFiltersContent = document.getElementById('advanced-filters-content');
  const chevronAdvancedFilters = document.getElementById('chevron-advanced-filters');
  if (t.condition || t.buyingFormat || t.freeShipping) {
    advancedFiltersContent?.classList.remove('hidden');
    if (chevronAdvancedFilters) chevronAdvancedFilters.style.transform = 'rotate(180deg)';
  } else {
    advancedFiltersContent?.classList.add('hidden');
    if (chevronAdvancedFilters) chevronAdvancedFilters.style.transform = 'rotate(0deg)';
  }
}

async function refreshMatchedListingsFeed(force = false) {
  if (isFeedLoading) return;
  const now = Date.now();
  if (!force && lastFetchedFeedItems.length > 0 && (now - lastFeedFetchTime < 15000)) {
    reRenderFeedItems();
    return;
  }
  isFeedLoading = true;
  lastFeedFetchTime = now;
  updateWatchReelsButton();

  try {
    if (!activeTrackersList || activeTrackersList.length === 0) {
      lastFetchedFeedItems = [];
      return;
    }

    // Fetch matches for up to 10 active trackers in parallel
    const promises = activeTrackersList.slice(0, 10).map(async (tracker) => {
      try {
        const res = await fetch(`${WORKER_BASE}/api/ebay/search`, {
          method: 'POST',
          headers: await getWorkerHeaders(),
          body: JSON.stringify({
            query: tracker.query,
            minPrice: tracker.minPrice,
            maxPrice: tracker.maxPrice,
            condition: tracker.condition,
            buyingFormat: tracker.buyingFormat,
            freeShipping: tracker.freeShipping
          })
        });
        if (res.ok) {
          const data = await res.json();
          return (data.items || []).map(item => ({ ...item, matchedQuery: tracker.query }));
        }
      } catch (err) {

      }
      return [];
    });

    const resultsArray = await Promise.all(promises);
    const allItems = resultsArray.flat();

    // Deduplicate items by itemId
    const uniqueItems = [];
    const seenIds = new Set();
    for (const item of allItems) {
      if (!seenIds.has(item.itemId)) {
        seenIds.add(item.itemId);
        uniqueItems.push(item);
      }
    }

    // Filter out watched items
    lastFetchedFeedItems = uniqueItems.filter(item => !watchedItemIds.has(item.itemId));
    preloadUpcomingReelImages(0);

  } catch (err) {

  } finally {
    isFeedLoading = false;
    updateWatchReelsButton();
  }
}

function reRenderFeedItems() {
  const container = document.getElementById('ebay-feed-container');
  if (!container) return;

  if (lastFetchedFeedItems.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center w-full py-12 text-center text-on-surface-variant gap-2 bg-white/10 rounded-xl p-4 border border-[#ac2471]/5 select-none">
        <span class="material-symbols-outlined text-xl opacity-60">search_off</span>
        <span class="text-xs">No matching listings found on eBay right now.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = lastFetchedFeedItems.map(item => {
    const isLiked = savedItemIds.has(item.itemId);
    return makeInstagramCardHTML(item, isLiked);
  }).join('');
}

function renderSavedItemsList() {
  const container = document.getElementById('ebay-saved-container');
  if (!container) return;

  const itemsList = document.getElementById('likes-items-list') || container;

  if (!savedItemsList || savedItemsList.length === 0) {
    const searchWrapper = document.getElementById('likes-search-wrapper');
    if (searchWrapper) searchWrapper.classList.add('hidden');

    itemsList.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center text-on-surface-variant gap-2 bg-white/10 rounded-xl p-4 border border-[#ac2471]/5">
        <span class="material-symbols-outlined text-2xl text-on-surface-variant opacity-60">favorite_border</span>
        <span class="text-xs font-medium">No saved items yet. Like items in the feed to save them here!</span>
      </div>
    `;
    return;
  }

  // Show search bar if 3 or more liked items exist
  const searchWrapper = document.getElementById('likes-search-wrapper');
  const searchInput = document.getElementById('likes-search-input');
  const btnClearSearch = document.getElementById('btn-clear-likes-search');

  if (searchWrapper) {
    if (savedItemsList.length >= 3) {
      searchWrapper.classList.remove('hidden');
    } else {
      searchWrapper.classList.add('hidden');
    }
  }

  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "true";
    searchInput.addEventListener('input', () => {
      if (btnClearSearch) {
        if (searchInput.value.trim()) btnClearSearch.classList.remove('hidden');
        else btnClearSearch.classList.add('hidden');
      }
      renderSavedItemsList();
    });
  }

  if (btnClearSearch && !btnClearSearch.dataset.bound) {
    btnClearSearch.dataset.bound = "true";
    btnClearSearch.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      btnClearSearch.classList.add('hidden');
      renderSavedItemsList();
    });
  }

  const queryText = searchInput ? searchInput.value.trim().toLowerCase() : '';

  let filteredList = savedItemsList;
  if (queryText) {
    filteredList = savedItemsList.filter(item => {
      const title = (item.title || '').toLowerCase();
      const matchQ = (item.matchedQuery || '').toLowerCase();
      return title.includes(queryText) || matchQ.includes(queryText);
    });
  }

  if (filteredList.length === 0) {
    itemsList.innerHTML = `
      <div class="flex flex-col items-center justify-center py-8 text-center text-on-surface-variant gap-2 bg-white/10 rounded-xl p-4 border border-[#ac2471]/5">
        <span class="material-symbols-outlined text-xl opacity-60">search_off</span>
        <span class="text-xs font-medium">No liked trinkets match "${queryText}".</span>
      </div>
    `;
    return;
  }

  itemsList.innerHTML = filteredList.map(item => {
    // Cross-reference with lastFetchedFeedItems if saved document is missing images or metadata
    const feedMatch = lastFetchedFeedItems.find(f => f.itemId === item.itemId);
    const mergedItem = feedMatch ? { ...feedMatch, ...item, imageUrl: item.imageUrl || extractImageUrl(feedMatch) } : item;
    return makeInstagramCardHTML(mergedItem, true, true);
  }).join('');
}

function makeInstagramCardHTML(item, isLiked, showDetails = false) {
  const rawImgUrl = extractImageUrl(item);
  const imgUrl = getHighResEbayImgUrl(rawImgUrl);
  const title = item.title || 'Antique Item';

  let price = 'Price N/A';
  if (item.price) {
    if (typeof item.price === 'object' && item.price.value) {
      price = `£${Number(item.price.value).toFixed(2)}`;
    } else if (typeof item.price === 'string' || typeof item.price === 'number') {
      price = `£${Number(item.price).toFixed(2)}`;
    }
  }

  const url = item.itemWebUrl || '#';
  const matchQ = item.matchedQuery || 'Antique Sourcing';
  const itemId = item.itemId;

  // Escape title for HTML injection
  const escapedTitle = title.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Prepare item JSON to pass into window._toggleSaveEbayItem
  const encodedItem = encodeURIComponent(JSON.stringify(item));

  // Determine heart icon & solid red fill style on heart icon itself
  const heartIcon = isLiked ? 'favorite' : 'favorite_border';
  const heartColor = isLiked ? '#ff2b6d' : '#ac2471';
  const heartFill = isLiked ? 1 : 0;

  // Construct metadata details
  let metaDetailsHtml = '';
  if (showDetails) {
    if (item.seller) {
      metaDetailsHtml += `<div><span class="font-bold text-on-surface">Seller:</span> ${item.seller.username} (${item.seller.feedbackPercentage}% positive)</div>`;
    }
    if (item.itemLocation) {
      metaDetailsHtml += `<div><span class="font-bold text-on-surface">Location:</span> ${item.itemLocation.city ? item.itemLocation.city + ', ' : ''}${item.itemLocation.country || ''}</div>`;
    }
    if (item.condition) {
      metaDetailsHtml += `<div><span class="font-bold text-on-surface">Condition:</span> ${item.condition}</div>`;
    }
    if (item.shippingOptions && item.shippingOptions[0] && item.shippingOptions[0].shippingCost) {
      const val = Number(item.shippingOptions[0].shippingCost.value);
      metaDetailsHtml += `<div><span class="font-bold text-on-surface">Shipping:</span> ${val === 0 ? 'Free Shipping' : `+£${val.toFixed(2)}`}</div>`;
    }
  }

  return `
    <div class="flex flex-col w-full shrink-0 bg-white/40 border border-[#ac2471]/10 rounded-2xl overflow-hidden shadow-sm" style="box-shadow: 0 4px 18px rgba(172,36,113,0.02);">
      <!-- Card Image -->
      <a href="${url}" target="_blank" rel="noopener noreferrer" class="relative block w-full pb-[100%] bg-neutral-900/10 overflow-hidden border-b border-[#ac2471]/5">
        <img src="${imgUrl}" alt="${escapedTitle}" class="absolute inset-0 w-full h-full object-cover hover:scale-[1.02] transition-transform duration-300" />
      </a>

      <!-- Card Action Bar -->
      <div class="flex items-center ${showDetails ? 'justify-between' : 'justify-start gap-3'} px-3 py-2 ${showDetails ? 'border-b border-[#ac2471]/5' : ''}">
        <div class="flex items-center gap-2">
          <button type="button" class="icon-btn hover:scale-115 active:scale-90 transition-transform flex items-center justify-center" onclick="window._handleLikeClick(this, '${itemId}', '${encodedItem}');" title="Like / Save" style="border:none; background:none; cursor:pointer; padding:4px;">
            <span class="material-symbols-outlined text-2xl" style="color: ${heartColor}; font-variation-settings: 'FILL' ${heartFill}; transition: color 0.2s ease;">${heartIcon}</span>
          </button>
          
          <a href="${url}" target="_blank" rel="noopener noreferrer" class="icon-btn hover:scale-110 active:scale-95 transition-transform flex items-center justify-center text-[#1a1523] hover:text-[#ac2471]" title="Open on eBay" style="border:none; background:none; cursor:pointer; padding:4px; text-decoration:none; transition: color 0.2s ease;">
            <span class="material-symbols-outlined text-2xl">shopping_bag</span>
          </a>
        </div>
        ${showDetails ? `<span class="text-sm font-extrabold text-[#ac2471]">${price}</span>` : ''}
      </div>

      ${showDetails ? `
        <!-- Metadata Details -->
        <div class="px-3.5 py-2.5 bg-white/40 text-[11px] text-on-surface-variant/90 flex flex-col gap-1.5 border-t border-[#ac2471]/5">
          <a href="${url}" target="_blank" rel="noopener noreferrer" class="text-sm font-bold text-[#1a1523] hover:text-[#ac2471] transition-colors leading-snug break-words" title="${escapedTitle}">${escapedTitle}</a>
          <div class="text-[10px] opacity-75 font-mono">Matched: #${matchQ}</div>
          ${metaDetailsHtml}
        </div>
      ` : `
        <div class="px-3.5 py-2.5 flex flex-col gap-1.5 bg-white/20">
          <a href="${url}" target="_blank" rel="noopener noreferrer" class="text-sm font-bold text-[#1a1523] hover:text-[#ac2471] transition-colors leading-snug break-words" title="${escapedTitle}">${escapedTitle}</a>
          <div class="flex items-center justify-between pt-0.5">
            <span class="text-xs font-extrabold text-[#2e7d32] bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-lg shadow-2xs">${price}</span>
            <span class="text-[9px] font-bold text-[#ac2471] bg-[#ac2471]/10 px-2 py-0.5 rounded-full font-mono uppercase tracking-wider">#${matchQ}</span>
          </div>
        </div>
      `}
    </div>
  `;
}

// Global click handler to save/bookmark items
window._toggleSaveEbayItem = async (itemId, encodedItemJson) => {
  const user = auth.currentUser;
  if (!user) {
    alert('Please sign in to save items!');
    return;
  }

  const docId = `${user.uid}_${itemId}`;
  const docRef = doc(db, 'favorites', docId);

  try {
    if (savedItemIds.has(itemId)) {
      await deleteDoc(docRef);
    } else {
      const itemData = JSON.parse(decodeURIComponent(encodedItemJson));
      const extractedUrl = extractImageUrl(itemData);
      await setDoc(docRef, {
        userId: user.uid,
        itemId: itemData.itemId,
        title: itemData.title || 'Antique Item',
        price: itemData.price || null,
        image: itemData.image || null,
        imageUrl: extractedUrl,
        itemWebUrl: itemData.itemWebUrl || '',
        matchedQuery: itemData.matchedQuery || '',
        seller: itemData.seller || null,
        itemLocation: itemData.itemLocation || null,
        condition: itemData.condition || null,
        shippingOptions: itemData.shippingOptions || null,
        savedAt: serverTimestamp()
      });
    }
  } catch (err) {

  }
};

export function markItemAsWatched(itemId) {
  if (!itemId) return;
  watchedItemIds.add(itemId);

  // Auto-prune to 2,000 most recent items to guarantee instant performance forever
  if (watchedItemIds.size > 2000) {
    const idsArray = Array.from(watchedItemIds);
    watchedItemIds = new Set(idsArray.slice(idsArray.length - 2000));
  }

  localStorage.setItem('watchedItemIds', JSON.stringify(Array.from(watchedItemIds)));
}

export function updateWatchReelsButton() {
  const btnOpenReels = document.getElementById('btn-open-reels');
  if (!btnOpenReels) return;
  const textSpan = btnOpenReels.querySelector('span:not(.material-symbols-outlined)');

  const hasReels = !isFeedLoading && lastFetchedFeedItems && lastFetchedFeedItems.length > 0;

  if (isFeedLoading) {
    btnOpenReels.disabled = true;
    btnOpenReels.style.setProperty('background', 'rgba(40, 40, 45, 0.85)', 'important');
    btnOpenReels.style.setProperty('color', 'rgba(255, 255, 255, 0.4)', 'important');
    btnOpenReels.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.1)', 'important');
    btnOpenReels.style.boxShadow = 'none';
    btnOpenReels.classList.add('opacity-60', 'pointer-events-none', 'cursor-not-allowed');
    btnOpenReels.classList.remove('hover:scale-[1.02]', 'active:scale-[0.98]');
    if (textSpan) textSpan.textContent = 'Sourcing Antiques...';
    return;
  }

  if (hasReels) {
    btnOpenReels.disabled = false;
    btnOpenReels.style.setProperty('background', 'linear-gradient(135deg, #ac2471, #7212ff)', 'important');
    btnOpenReels.style.setProperty('color', '#ffffff', 'important');
    btnOpenReels.style.setProperty('border', 'none', 'important');
    btnOpenReels.style.boxShadow = '0 10px 25px -5px rgba(172, 36, 113, 0.4)';
    btnOpenReels.classList.remove('opacity-60', 'pointer-events-none', 'cursor-not-allowed');
    btnOpenReels.classList.add('hover:scale-[1.02]', 'active:scale-[0.98]');
    if (textSpan) textSpan.textContent = 'Watch Antique Reels 🎬';
  } else {
    btnOpenReels.disabled = true;
    btnOpenReels.style.setProperty('background', 'rgba(40, 40, 45, 0.85)', 'important');
    btnOpenReels.style.setProperty('color', 'rgba(255, 255, 255, 0.4)', 'important');
    btnOpenReels.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.1)', 'important');
    btnOpenReels.style.boxShadow = 'none';
    btnOpenReels.classList.add('opacity-60', 'pointer-events-none', 'cursor-not-allowed');
    btnOpenReels.classList.remove('hover:scale-[1.02]', 'active:scale-[0.98]');
    if (textSpan) textSpan.textContent = 'No Reels Available 🎬';
  }
}

export function closeReelsModalAndCleanWatched() {
  const reelsModal = document.getElementById('antique-reels-modal');
  if (reelsModal) reelsModal.classList.add('hidden');

  // Filter out watched items from the feed
  lastFetchedFeedItems = lastFetchedFeedItems.filter(item => !watchedItemIds.has(item.itemId));
  reRenderFeedItems();
  updateWatchReelsButton();

  openEbayDrawer();
}

export async function openAntiqueReelsFeed() {
  if (isFeedLoading) return;
  const reelsModal = document.getElementById('antique-reels-modal');
  const emptyState = document.getElementById('reels-empty-state');
  const spinner = document.getElementById('reels-spinner');
  const emptyTitle = document.getElementById('reels-empty-title');
  const emptyDesc = document.getElementById('reels-empty-desc');

  if (!reelsModal) return;

  // Close drawers
  document.getElementById('ebay-drawer')?.classList.remove('open');
  document.getElementById('drawer-backdrop')?.classList.remove('show');
  setTimeout(() => {
    const stillMemoryOpen = document.getElementById('memory-drawer')?.classList.contains('open');
    const stillUvOpen = document.getElementById('uv-drawer')?.classList.contains('open');
    const stillEbayOpen = document.getElementById('ebay-drawer')?.classList.contains('open');
    if (!stillMemoryOpen && !stillUvOpen && !stillEbayOpen) {
      document.getElementById('drawer-backdrop')?.classList.add('hidden');
    }
  }, 300);

  // Show modal
  reelsModal.classList.remove('hidden');
  currentReelsIndex = 0;

  // If feed is already loaded and has items, just play it immediately!
  if (lastFetchedFeedItems && lastFetchedFeedItems.length > 0) {
    if (emptyState) emptyState.classList.add('hidden');
    changeReelsCard(0, null);
    markItemAsWatched(lastFetchedFeedItems[0].itemId);
    return;
  }

  // Otherwise, show loading state and fetch
  if (emptyState) {
    emptyState.classList.remove('hidden');
    if (spinner) spinner.classList.remove('hidden');
    if (emptyTitle) emptyTitle.textContent = 'Sourcing Antiques';
    if (emptyDesc) emptyDesc.textContent = 'Connecting to eBay to find matches for your active alert trackers...';
  }

  // Refresh feed
  await refreshMatchedListingsFeed();

  // Check results
  if (lastFetchedFeedItems && lastFetchedFeedItems.length > 0) {
    if (emptyState) emptyState.classList.add('hidden');
    changeReelsCard(0, null);
    markItemAsWatched(lastFetchedFeedItems[0].itemId);
  } else {
    // Show empty message
    if (emptyState) {
      emptyState.classList.remove('hidden');
      if (spinner) spinner.classList.add('hidden');
      if (emptyTitle) emptyTitle.textContent = 'No Matches Sourced';
      if (emptyDesc) emptyDesc.textContent = 'No active matching items found on eBay. Go back and create some trackers with different keywords!';
    }
  }
}

function handleReelsSwipe() {
  if (reelsScrollCooldown) return;
  const diffX = reelsTouchStartX - reelsTouchEndX;
  const diffY = reelsTouchStartY - reelsTouchEndY;

  if (Math.abs(diffY) > Math.abs(diffX)) {
    // Vertical swipe: Switch Reel Item
    if (diffY > 50) {
      if (currentReelsIndex < lastFetchedFeedItems.length) {
        changeReelsCard(currentReelsIndex + 1, 'up');
      }
    } else if (diffY < -50) {
      if (currentReelsIndex > 0) {
        changeReelsCard(currentReelsIndex - 1, 'down');
      }
    }
  } else {
    // Horizontal swipe: Switch Photo of current Reel item
    if (diffX > 25) {
      // Swipe left -> Next photo
      if (currentItemPhotos && currentPhotoIndex < currentItemPhotos.length - 1) {
        currentPhotoIndex++;
        updateReelsPhotoDisplay();
      }
    } else if (diffX < -25) {
      // Swipe right -> Previous photo
      if (currentItemPhotos && currentPhotoIndex > 0) {
        currentPhotoIndex--;
        updateReelsPhotoDisplay();
      }
    }
  }
}

function changeReelsCard(newIndex, direction) {
  const activeCard = document.getElementById('reels-active-card');
  if (!activeCard || reelsScrollCooldown) return;
  reelsScrollCooldown = true;

  // Immediately kick off background preloading for current & upcoming cards on network
  preloadUpcomingReelImages(newIndex);

  const imgEl = document.getElementById('reels-card-img');
  if (imgEl && direction) {
    imgEl.style.transition = 'opacity 0.12s ease-in-out';
    imgEl.style.opacity = '0.4';
  }

  if (direction) {
    activeCard.classList.remove('active');
    activeCard.classList.add(direction === 'up' ? 'anim-slide-up-out' : 'anim-slide-down-out');
  } else {
    activeCard.classList.remove('active');
  }

  setTimeout(() => {
    currentReelsIndex = newIndex;

    const mediaContainer = document.getElementById('reels-media-container');
    const detailsContainer = document.getElementById('reels-details-container');
    const endContainer = document.getElementById('reels-end-container');
    const headerTitleEl = document.getElementById('reels-header-title');

    if (currentReelsIndex === lastFetchedFeedItems.length) {
      // Show End Card state
      if (mediaContainer) mediaContainer.classList.add('hidden');
      if (detailsContainer) detailsContainer.classList.add('hidden');
      if (endContainer) endContainer.classList.remove('hidden');
      if (headerTitleEl) headerTitleEl.textContent = 'All Reels Completed 🎬';

      // Update progress bar to fill all segments
      updateReelsProgressSegments();

      if (direction) {
        activeCard.classList.remove('anim-slide-up-out', 'anim-slide-down-out');
        activeCard.classList.add(direction === 'up' ? 'anim-slide-up-in' : 'anim-slide-down-in');
        void activeCard.offsetWidth; // reflow
        activeCard.classList.add('active');
        setTimeout(() => {
          activeCard.classList.remove('anim-slide-up-in', 'anim-slide-down-in');
          reelsScrollCooldown = false;
        }, 350);
      } else {
        activeCard.classList.add('active');
        reelsScrollCooldown = false;
      }
      return;
    }

    // Normal Card state
    if (mediaContainer) mediaContainer.classList.remove('hidden');
    if (detailsContainer) detailsContainer.classList.remove('hidden');
    if (endContainer) endContainer.classList.add('hidden');

    const item = lastFetchedFeedItems[currentReelsIndex];
    if (!item) {
      reelsScrollCooldown = false;
      return;
    }

    markItemAsWatched(item.itemId);

    // Populate photos for multi-photo navigation
    currentPhotoIndex = 0;
    currentItemPhotos = getItemPhotos(item);

    // Update Top Header Title Badge
    if (headerTitleEl) {
      const fullTitle = item.title || 'Antique Reels 🎬';
      headerTitleEl.textContent = fullTitle.length > 70 ? fullTitle.slice(0, 70).trim() + '…' : fullTitle;
      headerTitleEl.title = fullTitle;
    }

    // Populate elements
    const rawImgUrl = extractImageUrl(item);
    const imgUrl = getHighResEbayImgUrl(rawImgUrl);
    const title = item.title;
    const price = item.price?.value ? `£${Number(item.price.value).toFixed(2)}` : 'Price N/A';
    const url = item.itemWebUrl;
    const matchQ = item.matchedQuery || 'Antique Sourcing';
    const itemId = item.itemId;

    const sourceEl = document.getElementById('reels-card-source');
    const priceEl = document.getElementById('reels-card-price');
    const titleEl = document.getElementById('reels-card-title');
    const visitEl = document.getElementById('btn-reels-visit');

    // Rich details elements
    const sellerEl = document.getElementById('reels-card-seller');
    const locationEl = document.getElementById('reels-card-location');
    const shippingEl = document.getElementById('reels-card-shipping');

    const sellerRow = document.getElementById('reels-meta-seller-row');
    const locationRow = document.getElementById('reels-meta-location-row');
    const shippingRow = document.getElementById('reels-meta-shipping-row');

    if (imgEl) {
      if (imgEl.src !== imgUrl) {
        imgEl.src = imgUrl;
        if (imgEl.complete) {
          imgEl.style.opacity = '1';
        } else {
          imgEl.onload = () => { imgEl.style.opacity = '1'; };
          imgEl.onerror = () => { imgEl.style.opacity = '1'; };
        }
      } else {
        imgEl.style.opacity = '1';
      }
    }
    updateReelsPhotoDisplay();
    if (sourceEl) sourceEl.textContent = `#${matchQ}`;
    if (priceEl) priceEl.textContent = price;
    if (titleEl) titleEl.textContent = title;
    if (visitEl) visitEl.href = url;

    // Rich details population
    if (item.seller) {
      if (sellerEl) sellerEl.textContent = `${item.seller.username} (${item.seller.feedbackPercentage}% positive)`;
      if (sellerRow) sellerRow.classList.remove('hidden');
    } else {
      if (sellerRow) sellerRow.classList.add('hidden');
    }

    if (item.itemLocation) {
      if (locationEl) locationEl.textContent = `${item.itemLocation.city ? item.itemLocation.city + ', ' : ''}${item.itemLocation.country || ''}`;
      if (locationRow) locationRow.classList.remove('hidden');
    } else {
      if (locationRow) locationRow.classList.add('hidden');
    }

    if (item.shippingOptions && item.shippingOptions[0] && item.shippingOptions[0].shippingCost) {
      const val = Number(item.shippingOptions[0].shippingCost.value);
      if (shippingEl) shippingEl.textContent = val === 0 ? 'Free Shipping' : `+£${val.toFixed(2)} shipping`;
      if (shippingRow) shippingRow.classList.remove('hidden');
    } else {
      if (shippingRow) shippingRow.classList.add('hidden');
    }

    // Like button state
    updateReelsLikeButtonState(itemId, item);

    // Progress bar segment updates
    updateReelsProgressSegments();

    if (direction) {
      activeCard.classList.remove('anim-slide-up-out', 'anim-slide-down-out');
      activeCard.classList.add(direction === 'up' ? 'anim-slide-up-in' : 'anim-slide-down-in');
      void activeCard.offsetWidth; // reflow
      activeCard.classList.add('active');

      setTimeout(() => {
        activeCard.classList.remove('anim-slide-up-in', 'anim-slide-down-in');
        reelsScrollCooldown = false;
      }, 350);
    } else {
      activeCard.classList.add('active');
      reelsScrollCooldown = false;
    }
  }, direction ? 350 : 0);
}

function triggerCenterPopHeart() {
  const popHeart = document.getElementById('reels-doubletap-heart');
  if (popHeart) {
    popHeart.classList.remove('hidden', 'anim-doubletap-heart');
    void popHeart.offsetWidth; // force reflow
    popHeart.classList.add('anim-doubletap-heart');

    setTimeout(() => {
      popHeart.classList.remove('anim-doubletap-heart');
      popHeart.classList.add('hidden');
    }, 750);
  }
}

function updateReelsLikeButtonState(itemId, item) {
  const isLiked = savedItemIds.has(itemId);
  const heartIcon = document.getElementById('reels-like-icon');
  const btnLike = document.getElementById('btn-reels-like');

  if (heartIcon) {
    heartIcon.textContent = isLiked ? 'favorite' : 'favorite_border';
    heartIcon.style.color = isLiked ? '#ff2b6d' : '#ffffff';
    heartIcon.style.fontVariationSettings = `'FILL' ${isLiked ? 1 : 0}`;
  }

  if (btnLike) {
    btnLike.style.background = 'rgba(0, 0, 0, 0.4)';
    btnLike.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    btnLike.style.boxShadow = 'none';

    const encodedItem = encodeURIComponent(JSON.stringify(item));
    btnLike.onclick = (e) => {
      e.stopPropagation();

      const currentlyLiked = savedItemIds.has(itemId);
      const nextState = !currentlyLiked;

      // Instant optimistic heart fill toggle
      if (heartIcon) {
        heartIcon.textContent = nextState ? 'favorite' : 'favorite_border';
        heartIcon.style.color = nextState ? '#ff2b6d' : '#ffffff';
        heartIcon.style.fontVariationSettings = `'FILL' ${nextState ? 1 : 0}`;
        heartIcon.classList.add('anim-heart-pop');
        setTimeout(() => heartIcon.classList.remove('anim-heart-pop'), 450);
      }

      if (nextState) {
        triggerCenterPopHeart();
      }

      window._toggleSaveEbayItem(itemId, encodedItem);
    };
  }
}

function updateReelsProgressSegments() {
  const progressFill = document.getElementById('reels-progress-fill');
  const counterBadge = document.getElementById('reels-counter-badge');
  const total = lastFetchedFeedItems ? lastFetchedFeedItems.length : 0;

  if (total === 0) {
    if (progressFill) progressFill.style.width = '0%';
    if (counterBadge) counterBadge.textContent = '0 / 0';
    return;
  }

  const currentNum = Math.min(currentReelsIndex + 1, total);
  const percentage = Math.round((currentNum / total) * 100);

  if (progressFill) {
    progressFill.style.width = `${percentage}%`;
  }
  if (counterBadge) {
    counterBadge.textContent = `${currentNum} / ${total}`;
  }
}

function handleDoubleTapLike() {
  if (currentReelsIndex >= lastFetchedFeedItems.length) return; // End card

  const item = lastFetchedFeedItems[currentReelsIndex];
  if (!item) return;

  const itemId = item.itemId;
  const currentlyLiked = savedItemIds.has(itemId);
  const nextState = !currentlyLiked;
  const encodedItem = encodeURIComponent(JSON.stringify(item));

  window._toggleSaveEbayItem(itemId, encodedItem);

  // Update small heart button UI instantly
  const heartIcon = document.getElementById('reels-like-icon');
  if (heartIcon) {
    heartIcon.textContent = nextState ? 'favorite' : 'favorite_border';
    heartIcon.style.color = nextState ? '#ff2b6d' : '#ffffff';
    heartIcon.style.fontVariationSettings = `'FILL' ${nextState ? 1 : 0}`;
    heartIcon.classList.add('anim-heart-pop');
    setTimeout(() => heartIcon.classList.remove('anim-heart-pop'), 450);
  }

  if (nextState) {
    triggerCenterPopHeart();
  }
}
