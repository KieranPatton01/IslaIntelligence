/**
 * tour.js — Custom Isla Glass Onboarding Tour Engine (Option A)
 *
 * Responsibilities:
 *  • Maintain interactive step sequence & active step index
 *  • Programmatically trigger UI state actions before displaying steps
 *  • Position spotlight rectangle & popover card using target getBoundingClientRect()
 *  • Handle smooth scrolling, step navigation, keyboard events, and tour completion persistence
 */

const TOUR_STEPS = [
  {
    targetId: 'input-bar-container',
    title: '✨ Meet Isla Intellgence ',
    desc: 'Ask anything, upload anything for answers faster and better than poopy GPT. You can also type "help" in the chat or tap the compass 🧭 button at the top if you are a retard',
    action: () => {
      closeAllDrawers();
    }
  },
  {
    targetId: 'tone-slider',
    title: 'AI Personality Mode Slider',
    desc: 'Adjust Isla\'s personality in real time. Move left for raw Ragebait critiques, right for flattering Princess treatment, or keep it Balanced',
    action: () => {
      closeAllDrawers();
    }
  },
  {
    targetId: 'btn-attach',
    title: '📎 Multimedia Attachments',
    desc: 'Upload screenshots, photos, maker mark certificates, voice clips, or videos straight into your chat.',
    action: () => {
      closeAllDrawers();
    }
  },
  {
    targetId: 'btn-trinkify',
    title: 'Trinkify Room Scan',
    desc: 'Uses your device camera to scan your physical room/shelf and recommend matching antique trinket coordinates.',
    action: () => {
      closeAllDrawers();
    }
  },
  {
    targetId: 'btn-ocr',
    title: ' Document Scanner (OCR)',
    desc: 'Scans printed labels, certificates, or registry catalogs to extract text and signatures instantly.',
    action: () => {
      closeAllDrawers();
    }
  },
  {
    targetId: 'btn-gemini-model-selector',
    title: 'Select AI Engine',
    desc: 'Switch between differnt AI engines depending on your needs.',
    action: () => {
      closeAllDrawers();
    }
  },
  {
    targetId: 'btn-open-sidebar',
    title: 'Chat History & Sidebar',
    desc: 'Open the sidebar menu to view your past chats, start fresh conversations, or check Isla\'s memory bank.',
    action: () => {
      closeAllDrawers();
    }
  },
  {
    targetId: 'isla-tour-full-screen',
    title: 'Isla Memories & Shelf',
    desc: 'View collected twinkets and check the profile of facts Isla learns about your tastes, preferences, and habits over time.',
    action: () => {
      // 1. Close UV drawer & eBay drawer if open
      const uvDrawer = document.getElementById('uv-drawer');
      if (uvDrawer && uvDrawer.classList.contains('open')) {
        const btnClose = document.getElementById('btn-close-uv-drawer');
        if (btnClose) btnClose.click();
      }
      const ebayDrawer = document.getElementById('ebay-drawer');
      if (ebayDrawer && ebayDrawer.classList.contains('open')) {
        const btnClose = document.getElementById('btn-close-ebay-drawer');
        if (btnClose) btnClose.click();
      }

      // 2. Open Memory drawer
      const memoryDrawer = document.getElementById('memory-drawer');
      if (memoryDrawer && !memoryDrawer.classList.contains('open')) {
        const memoryBtn = document.getElementById('btn-memory');
        if (memoryBtn) memoryBtn.click();
      }
    }
  },
  {
    targetId: 'btn-header-uv',
    title: 'UV Sunshine Index Tracker',
    desc: 'Track sunshine levels so kieran can look at your tan lines',
    action: () => {
      // 1. Close Memory drawer & eBay drawer if open
      const memoryDrawer = document.getElementById('memory-drawer');
      if (memoryDrawer && memoryDrawer.classList.contains('open')) {
        const btnClose = document.getElementById('btn-close-drawer');
        if (btnClose) btnClose.click();
      }
      const ebayDrawer = document.getElementById('ebay-drawer');
      if (ebayDrawer && ebayDrawer.classList.contains('open')) {
        const btnClose = document.getElementById('btn-close-ebay-drawer');
        if (btnClose) btnClose.click();
      }

      // 2. Open UV drawer
      const uvDrawer = document.getElementById('uv-drawer');
      if (uvDrawer && !uvDrawer.classList.contains('open')) {
        const headerUvBtn = document.getElementById('btn-header-uv') || document.getElementById('widget-uv');
        if (headerUvBtn) headerUvBtn.click();
      }
    }
  },
  {
    targetId: 'btn-toggle-create-alert',
    title: 'Alert Trackers & Sourcing',
    desc: 'Configure automated real-time eBay search alerts with custom target prices babe.',
    action: () => {
      // 1. Close UV drawer & Memory drawer
      const uvDrawer = document.getElementById('uv-drawer');
      if (uvDrawer && uvDrawer.classList.contains('open')) {
        const btnClose = document.getElementById('btn-close-uv-drawer');
        if (btnClose) btnClose.click();
      }
      const memoryDrawer = document.getElementById('memory-drawer');
      if (memoryDrawer && memoryDrawer.classList.contains('open')) {
        const btnClose = document.getElementById('btn-close-drawer');
        if (btnClose) btnClose.click();
      }

      // 2. Open eBay drawer
      const ebayDrawer = document.getElementById('ebay-drawer');
      if (ebayDrawer && !ebayDrawer.classList.contains('open')) {
        const headerEbayBtn = document.getElementById('btn-header-ebay') || document.getElementById('widget-ebay');
        if (headerEbayBtn) headerEbayBtn.click();
      }

      // 3. Expand "Filter your Feed" section if collapsed
      setTimeout(() => {
        const section = document.getElementById('section-create-alert') || document.getElementById('ebay-alert-form');
        const chevron = document.getElementById('chevron-create-alert');
        if (section && section.classList.contains('hidden')) {
          section.classList.remove('hidden');
          if (chevron) chevron.style.transform = 'rotate(180deg)';
        }
      }, 120);
    }
  },
  {
    targetId: 'btn-open-reels',
    title: 'Antique Reels Feed',
    desc: 'Watch sourced antique listings like TikTok or Instagram weels! Double-tap screen to like, and tap sides to view photos.',
    action: () => {
      // Close Memory drawer & UV drawer
      const memoryDrawer = document.getElementById('memory-drawer');
      if (memoryDrawer && memoryDrawer.classList.contains('open')) {
        const btnClose = document.getElementById('btn-close-drawer');
        if (btnClose) btnClose.click();
      }
      const uvDrawer = document.getElementById('uv-drawer');
      if (uvDrawer && uvDrawer.classList.contains('open')) {
        const btnClose = document.getElementById('btn-close-uv-drawer');
        if (btnClose) btnClose.click();
      }

      // Ensure eBay drawer is open so watch button is visible
      const ebayDrawer = document.getElementById('ebay-drawer');
      if (ebayDrawer && !ebayDrawer.classList.contains('open')) {
        const headerEbayBtn = document.getElementById('btn-header-ebay') || document.getElementById('widget-ebay');
        if (headerEbayBtn) headerEbayBtn.click();
      }
    }
  },
  {
    targetId: 'btn-show-saved',
    title: 'Saved Trinkets & Search',
    desc: 'View all your liked items in your saved trinkets shelf and filter them instantly using the sticky search bar.',
    action: () => {
      // 1. Close Reels modal if open
      const reelsModal = document.getElementById('antique-reels-modal');
      if (reelsModal && !reelsModal.classList.contains('hidden')) {
        const btnClose = document.getElementById('btn-close-reels');
        if (btnClose) btnClose.click();
      }

      // 2. Ensure eBay drawer is open
      const ebayDrawer = document.getElementById('ebay-drawer');
      if (ebayDrawer && !ebayDrawer.classList.contains('open')) {
        const headerEbayBtn = document.getElementById('btn-header-ebay') || document.getElementById('widget-ebay');
        if (headerEbayBtn) headerEbayBtn.click();
      }

      // 3. Switch to Likes/Saved Tab
      setTimeout(() => {
        const savedTab = document.getElementById('btn-show-saved');
        if (savedTab) savedTab.click();
      }, 100);
    }
  }
];

let currentStepIndex = 0;
let isTourActive = false;

function closeAllDrawers() {
  const uvDrawer = document.getElementById('uv-drawer');
  if (uvDrawer && uvDrawer.classList.contains('open')) {
    const btnClose = document.getElementById('btn-close-uv-drawer');
    if (btnClose) btnClose.click();
  }

  const ebayDrawer = document.getElementById('ebay-drawer');
  if (ebayDrawer && ebayDrawer.classList.contains('open')) {
    const btnClose = document.getElementById('btn-close-ebay-drawer');
    if (btnClose) btnClose.click();
  }

  const memoryDrawer = document.getElementById('memory-drawer');
  if (memoryDrawer && memoryDrawer.classList.contains('open')) {
    const btnClose = document.getElementById('btn-close-drawer');
    if (btnClose) btnClose.click();
  }
}

export function initIslaTour() {

  const btnStartTour = document.getElementById('btn-start-tour');
  const btnNext = document.getElementById('btn-tour-next');
  const btnPrev = document.getElementById('btn-tour-prev');
  const btnSkip = document.getElementById('btn-tour-skip');

  if (btnStartTour) {
    btnStartTour.addEventListener('click', (e) => {

      e.preventDefault();
      startTour(true);
    });
  } else {

  }

  if (btnNext) {
    btnNext.addEventListener('click', () => nextStep());
  }

  if (btnPrev) {
    btnPrev.addEventListener('click', () => prevStep());
  }

  if (btnSkip) {
    btnSkip.addEventListener('click', () => endTour());
  }

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (!isTourActive) return;
    if (e.key === 'Escape') endTour();
    if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
    if (e.key === 'ArrowLeft') prevStep();
  });

  // Reposition spotlight on window resize
  window.addEventListener('resize', () => {
    if (isTourActive) renderStep(currentStepIndex);
  });
}

export function checkAutoStartTour() {
  const hasCompleted = localStorage.getItem('hasCompletedIslaTour');
  if (!hasCompleted) {

    setTimeout(() => {
      startTour(false);
    }, 1200);
  }
}

export function startTour(forced = true) {

  isTourActive = true;
  currentStepIndex = 0;

  const overlay = document.getElementById('isla-tour-overlay');
  if (overlay) {
    overlay.style.position = 'fixed';
    overlay.style.inset = '0px';
    overlay.style.zIndex = '999999';
    overlay.style.background = 'transparent';
    overlay.style.pointerEvents = 'auto';
    overlay.style.opacity = '1';
    overlay.style.display = 'block';
  }

  const spotlight = document.getElementById('isla-tour-spotlight');
  if (spotlight) {
    spotlight.style.position = 'absolute';
    spotlight.style.borderRadius = '16px';
    spotlight.style.border = '2.5px solid #ac2471';
    spotlight.style.boxShadow = '0 0 0 9999px rgba(9, 9, 13, 0.78), 0 0 15px rgba(172, 36, 113, 0.6)';
    spotlight.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
    spotlight.style.zIndex = '1000000';
    spotlight.style.pointerEvents = 'none';
  }

  const card = document.getElementById('isla-tour-card');
  if (card) {
    card.style.position = 'absolute';
    card.style.width = '320px';
    card.style.background = 'rgba(253, 250, 249, 0.96)';
    card.style.backdropFilter = 'blur(20px)';
    card.style.webkitBackdropFilter = 'blur(20px)';
    card.style.border = '1.5px solid rgba(172, 36, 113, 0.25)';
    card.style.borderRadius = '24px';
    card.style.boxShadow = '0 16px 48px rgba(172, 36, 113, 0.15), 0 1px 4px rgba(0, 0, 0, 0.05)';
    card.style.padding = '18px 22px';
    card.style.boxSizing = 'border-box';
    card.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
    card.style.zIndex = '1000001';
    card.style.opacity = '1';
    card.style.transform = 'scale(1)';
  }

  renderStep(0);
}

function endTour() {

  isTourActive = false;
  localStorage.setItem('hasCompletedIslaTour', 'true');
  const overlay = document.getElementById('isla-tour-overlay');
  const card = document.getElementById('isla-tour-card');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.display = 'none';
  }
  if (card) {
    card.classList.remove('visible');
  }

  // Close other open components/modals
  closeAllDrawers();

  const reelsModal = document.getElementById('antique-reels-modal');
  if (reelsModal && !reelsModal.classList.contains('hidden')) {
    const btnClose = document.getElementById('btn-close-reels');
    if (btnClose) btnClose.click();
  }
}

function nextStep() {
  if (currentStepIndex < TOUR_STEPS.length - 1) {
    currentStepIndex++;
    renderStep(currentStepIndex);
  } else {
    endTour();
  }
}

function prevStep() {
  if (currentStepIndex > 0) {
    currentStepIndex--;
    renderStep(currentStepIndex);
  }
}

function renderStep(index) {
  const step = TOUR_STEPS[index];
  if (!step) return;



  // Run optional step action before rendering
  if (typeof step.action === 'function') {
    try { step.action(); } catch { /* suppressed */ }
  }

  // Set timeout to allow UI drawer/modal open animation to complete
  setTimeout(() => {
    const spotlight = document.getElementById('isla-tour-spotlight');
    const card = document.getElementById('isla-tour-card');
    const badge = document.getElementById('tour-step-badge');
    const title = document.getElementById('tour-step-title');
    const desc = document.getElementById('tour-step-desc');
    const btnNextText = document.getElementById('btn-tour-next-text');
    const btnPrev = document.getElementById('btn-tour-prev');

    let spotTop, spotLeft, spotWidth, spotHeight;

    if (step.targetId === 'isla-tour-full-screen') {
      spotTop = 0;
      spotLeft = 0;
      spotWidth = window.innerWidth;
      spotHeight = window.innerHeight;

      if (spotlight) {
        spotlight.style.top = '0px';
        spotlight.style.left = '0px';
        spotlight.style.width = '100vw';
        spotlight.style.height = '100vh';
        spotlight.style.border = 'none';
        spotlight.style.boxShadow = '0 0 0 9999px rgba(9, 9, 13, 0.4)'; // Fullscreen dim
      }
    } else {
      let targetEl = document.getElementById(step.targetId);
      if (!targetEl) {

        targetEl = document.body;
      }

      // Scroll target into view
      try {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (e) { }

      const rect = targetEl.getBoundingClientRect();
      const padding = 8;
      spotTop = Math.max(0, rect.top - padding);
      spotLeft = Math.max(0, rect.left - padding);
      spotWidth = Math.min(window.innerWidth, rect.width + (padding * 2));
      spotHeight = Math.min(window.innerHeight, rect.height + (padding * 2));

      if (spotlight) {
        spotlight.style.border = '2.5px solid #ac2471';
        spotlight.style.boxShadow = '0 0 0 9999px rgba(9, 9, 13, 0.78), 0 0 15px rgba(172, 36, 113, 0.6)';
        spotlight.style.top = `${spotTop}px`;
        spotlight.style.left = `${spotLeft}px`;
        spotlight.style.width = `${spotWidth}px`;
        spotlight.style.height = `${spotHeight}px`;
      }
    }

    if (badge) badge.textContent = `STEP ${index + 1} OF ${TOUR_STEPS.length}`;
    if (title) title.textContent = step.title;
    if (desc) desc.textContent = step.desc;

    if (btnNextText) {
      btnNextText.textContent = index === TOUR_STEPS.length - 1 ? 'Finish' : 'Next';
    }

    if (btnPrev) {
      if (index > 0) btnPrev.classList.remove('hidden');
      else btnPrev.classList.add('hidden');
    }

    // Position popover card intelligently
    if (card) {
      const cardWidth = 320;
      const cardHeight = card.offsetHeight || 215; // Read actual dynamic height
      let cardTop, cardLeft;

      if (step.targetId === 'isla-tour-full-screen') {
        cardTop = (window.innerHeight / 2) - (cardHeight / 2);
        cardLeft = (window.innerWidth / 2) - (cardWidth / 2);
      } else {
        cardTop = spotTop + spotHeight + 12;
        cardLeft = spotLeft + (spotWidth / 2) - (cardWidth / 2);

        // Clamp horizontally within screen bounds
        if (cardLeft < 16) cardLeft = 16;
        if (cardLeft + cardWidth > window.innerWidth - 16) {
          cardLeft = window.innerWidth - cardWidth - 16;
        }

        // If bottom space is tight, position card above spotlight
        if (cardTop + cardHeight > window.innerHeight - 16) {
          cardTop = Math.max(16, spotTop - cardHeight - 12);
        }
      }

      card.style.top = `${cardTop}px`;
      card.style.left = `${cardLeft}px`;
      card.classList.add('visible');
    }
  }, 220); // 220ms cooldown to ensure clean drawer transitions
}
