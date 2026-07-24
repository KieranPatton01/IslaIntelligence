/**
 * main.js — Application entry point
 *
 * Responsibilities:
 *  • Import global CSS (processed by Tailwind via PostCSS)
 *  • Wire the auth form (sign-in / sign-up tab toggle + submit)
 *  • Observe Firebase Auth state and route to the correct view
 *  • Handle sign-out
 *  • Register the PWA service worker
 *  • Show the PWA install prompt banner
 */

import './styles/main.css';

import { watchAuthState, signIn, signOutUser, parseAuthError, sendPasswordReset } from './auth.js';
import { initChat, teardownChat, switchSession, getCurrentSessionId, openMemoryModal, updateMemoryBadge } from './chat.js';
import { listSessions, renameSession, deleteSession } from './sessions.js';
import { setCurrentTone } from './ui.js';
import { initDiagramViewer } from './diagramViewer.js';
import { initVisualizer } from './visualizer.js';
import { initUvView } from './uv.js';
import { initEbayView } from './ebay.js';
import { initIslaTour, checkAutoStartTour } from './tour.js';

// ── View switcher ──────────────────────────────────────────
function showView(viewId) {
  const auth = document.getElementById('view-auth');
  const chat = document.getElementById('view-chat');
  if (!auth || !chat) return;

  auth.style.display = viewId === 'auth' ? 'flex'   : 'none';
  chat.style.display = viewId === 'chat' ? 'flex'   : 'none';
  chat.style.flexDirection = 'column';
}

// ── Sidebar State ──────────────────────────────────────────
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const btnOpenSidebar = document.getElementById('btn-open-sidebar');
const btnCloseSidebar = document.getElementById('btn-close-sidebar');
const btnNewChat = document.getElementById('btn-new-chat');
const sessionList = document.getElementById('session-list');

// Welcome screen recent chat
const welcomeRecentContainer = document.getElementById('welcome-recent-chat');
const welcomeRecentBtn = document.getElementById('btn-welcome-recent');
const welcomeRecentTitle = document.getElementById('welcome-recent-title');

let unsubSessions = null;
let currentUser = null;
let currentSessions = [];
let sessionsLoaded = false;
let sessionSearchQuery = '';

function showSessionsLoading() {
  if (!sessionList || sessionsLoaded) return;
  sessionList.innerHTML = `
    <div class="flex flex-col items-center gap-2 py-6 px-4" style="opacity:0.5;">
      <div style="width:20px;height:20px;border:2px solid rgba(172,36,113,0.25);border-top-color:#ac2471;border-radius:50%;animation:spin 0.9s linear infinite;"></div>
      <p class="text-xs text-center" style="color:rgba(0,0,0,0.4);">Gathering your old chats…</p>
    </div>`;
}

function openSidebar() {
  sidebar?.classList.remove('-translate-x-full');
  sidebarOverlay?.classList.remove('hidden', 'opacity-0');
  sidebarOverlay?.classList.add('opacity-100');
  renderSessions(currentSessions); // re-render to ensure active styling is correct
}

function closeSidebar() {
  sidebar?.classList.add('-translate-x-full');
  sidebarOverlay?.classList.remove('opacity-100');
  sidebarOverlay?.classList.add('opacity-0');
  setTimeout(() => {
    sidebarOverlay?.classList.add('hidden');
  }, 300);
}

btnOpenSidebar?.addEventListener('click', openSidebar);
btnCloseSidebar?.addEventListener('click', closeSidebar);
sidebarOverlay?.addEventListener('click', closeSidebar);

btnNewChat?.addEventListener('click', () => {
  if (currentUser) {
    switchSession(currentUser, null);
    closeSidebar();
  }
});

const searchOverlay = document.getElementById('sidebar-search-overlay');
const inputSearch = document.getElementById('input-session-search');

document.getElementById('btn-search-expand')?.addEventListener('click', () => {
  if (searchOverlay && inputSearch) {
    searchOverlay.classList.remove('translate-x-full', 'opacity-0', 'pointer-events-none');
    searchOverlay.classList.add('translate-x-0', 'opacity-100', 'pointer-events-auto');
    inputSearch.focus();
  }
});

document.getElementById('btn-search-collapse')?.addEventListener('click', () => {
  if (searchOverlay && inputSearch) {
    searchOverlay.classList.remove('translate-x-0', 'opacity-100', 'pointer-events-auto');
    searchOverlay.classList.add('translate-x-full', 'opacity-0', 'pointer-events-none');
    inputSearch.value = '';
    sessionSearchQuery = '';
    renderSessions(currentSessions);
  }
});

inputSearch?.addEventListener('input', (e) => {
  sessionSearchQuery = e.target.value;
  renderSessions(currentSessions);
});

document.getElementById('btn-title-new-chat')?.addEventListener('click', () => {
  if (currentUser) {
    switchSession(currentUser, null);
  }
});

welcomeRecentBtn?.addEventListener('click', () => {
  if (currentUser && currentSessions.length > 0) {
    switchSession(currentUser, currentSessions[0].id);
  }
});

// ── Swipe-to-delete toast ───────────────────────────────────
let activeDeleteTimer = null;

function showDeleteToast(title, onUndo) {
  // Remove any existing toast
  document.getElementById('session-delete-toast')?.remove();
  if (activeDeleteTimer) clearTimeout(activeDeleteTimer);

  const toast = document.createElement('div');
  toast.id = 'session-delete-toast';
  toast.style.cssText = `
    position:absolute; bottom:56px; left:8px; right:8px; z-index:100;
    background:#323232; color:#fff; border-radius:12px;
    padding:12px 14px; display:flex; align-items:center; justify-content:space-between;
    gap:8px; font-size:13px; box-shadow:0 4px 16px rgba(0,0,0,0.25);
    animation: toastIn 0.25s ease;
  `;

  const msg = document.createElement('span');
  msg.style.cssText = 'flex:1; line-height:1.4;';
  msg.textContent = `"${title || 'Chat'}" deleted`;

  const undoBtn = document.createElement('button');
  undoBtn.textContent = 'Undo';
  undoBtn.style.cssText = `
    background:none; border:none; cursor:pointer; font-weight:700;
    font-size:13px; padding:4px 6px; border-radius:6px;
    color:#ac2471; white-space:nowrap; flex-shrink:0;
  `;
  undoBtn.addEventListener('click', () => {
    onUndo();
    toast.remove();
    if (activeDeleteTimer) { clearTimeout(activeDeleteTimer); activeDeleteTimer = null; }
  });

  toast.appendChild(msg);
  toast.appendChild(undoBtn);

  // Inject into sidebar so it stays within the panel
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.appendChild(toast);

  // Auto-dismiss after 4s
  activeDeleteTimer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
    activeDeleteTimer = null;
  }, 4000);
}

function addSwipeToDelete(el, session) {
  let startX = 0, startY = 0, currentX = 0, isDragging = false, isHorizontal = null;
  const THRESHOLD = 80;

  function onStart(x, y) {
    startX = x; startY = y; currentX = 0;
    isDragging = true; isHorizontal = null;
    el.style.transition = 'none';
  }
  function onMove(x, y, e = null) {
    if (!isDragging) return;
    const dx = x - startX;
    const dy = y - startY;
    if (isHorizontal === null) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      isHorizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!isHorizontal) { isDragging = false; return; }
    
    // Horizontal swipe confirmed — lock viewport scroll
    if (e && e.cancelable) e.preventDefault();
    
    currentX = Math.min(0, dx); // only allow left swipe
    const progress = Math.min(1, Math.abs(currentX) / THRESHOLD);
    el.style.transform = `translateX(${currentX}px)`;
    el.parentElement.querySelector('.swipe-bg').style.opacity = progress;
  }
  function onEnd() {
    if (!isDragging) return;
    isDragging = false;
    el.style.transition = 'transform 0.25s ease';
    if (Math.abs(currentX) >= THRESHOLD) {
      // Swipe confirmed — slide fully out
      el.style.transform = `translateX(-100%)`;
      el.parentElement.querySelector('.swipe-bg').style.opacity = '1';
      triggerDeleteWithUndo(session, el.parentElement);
    } else {
      // Snap back
      el.style.transform = 'translateX(0)';
      el.parentElement.querySelector('.swipe-bg').style.opacity = '0';
    }
    currentX = 0;
  }
 
  // Touch
  el.addEventListener('touchstart', e => onStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  el.addEventListener('touchmove',  e => { onMove(e.touches[0].clientX, e.touches[0].clientY, e); }, { passive: false });
  el.addEventListener('touchend',   () => onEnd());
 
  // Mouse (desktop)
  el.addEventListener('mousedown', e => { if (e.button !== 0) return; onStart(e.clientX, e.clientY); });
  window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  window.addEventListener('mouseup',   () => onEnd());
}

function triggerDeleteWithUndo(session, wrapper) {
  let cancelled = false;

  // Delay the height collapse by 250ms so the horizontal slide-out completes first
  const collapseTimer = setTimeout(() => {
    if (cancelled) return;
    wrapper.style.maxHeight = wrapper.scrollHeight + 'px';
    wrapper.offsetHeight; // Force reflow
    wrapper.style.transition = 'max-height 0.25s ease, opacity 0.2s ease';
    wrapper.style.maxHeight = '0';
    wrapper.style.opacity = '0';
    wrapper.style.pointerEvents = 'none';
  }, 250);

  showDeleteToast(session.title, () => {
    // Undo: restore visibility and expand height
    cancelled = true;
    clearTimeout(collapseTimer);

    wrapper.style.transition = 'max-height 0.25s ease, opacity 0.2s ease';
    wrapper.style.maxHeight = '60px'; // Temporarily set to a safe height
    wrapper.style.opacity = '1';
    wrapper.style.pointerEvents = 'auto';

    // Clear height restriction after expansion completes
    setTimeout(() => {
      wrapper.style.maxHeight = '';
      wrapper.style.transition = '';
    }, 250);

    const el = wrapper.querySelector('.session-item');
    if (el) {
      el.style.transition = 'transform 0.25s ease';
      el.style.transform = 'translateX(0)';
      wrapper.querySelector('.swipe-bg').style.opacity = '0';
    }
  });

  // Delay actual delete by 4s — undo can cancel it
  activeDeleteTimer = setTimeout(async () => {
    if (cancelled || !currentUser) return;
    if (getCurrentSessionId() === session.id) {
      switchSession(currentUser, null);
    }
    await deleteSession(currentUser.uid, session.id);
  }, 4000);
}

function renderSessions(sessions) {
  sessionsLoaded = true;
  currentSessions = sessions;
  
  // Update welcome screen recent chat link
  if (welcomeRecentContainer && welcomeRecentTitle) {
    if (sessions.length > 0) {
      welcomeRecentTitle.textContent = sessions[0].title || 'New Chat';
      welcomeRecentContainer.classList.remove('hidden');
    } else {
      welcomeRecentContainer.classList.add('hidden');
    }
  }

  if (!sessionList) return;
  sessionList.innerHTML = '';

  // Filter sessions based on search query
  const query = sessionSearchQuery.trim().toLowerCase();
  const filteredSessions = query
    ? sessions.filter(s => (s.title || 'New Chat').toLowerCase().includes(query))
    : sessions;

  if (filteredSessions.length === 0 && query) {
    // VULN-11: Build the no-results message with textContent, not innerHTML,
    // to prevent DOM XSS from a crafted search query like <img onerror=alert(1)>.
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'py-6 px-4 text-center';
    emptyDiv.style.opacity = '0.5';
    const emptyP = document.createElement('p');
    emptyP.className = 'text-xs';
    emptyP.style.color = 'rgba(0,0,0,0.4)';
    emptyP.textContent = `No chats match “${query}”`;
    emptyDiv.appendChild(emptyP);
    sessionList.appendChild(emptyDiv);
    return;
  }

  filteredSessions.forEach(session => {
    const isActive = getCurrentSessionId() === session.id;

    // Outer wrapper — clipping container for swipe reveal
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative; overflow:hidden; border-radius:12px; flex-shrink:0;';

    // Red swipe-reveal background
    const swipeBg = document.createElement('div');
    swipeBg.className = 'swipe-bg';
    swipeBg.style.cssText = `
      position:absolute; inset:0; border-radius:12px;
      background:linear-gradient(135deg,#c62828,#b71c1c);
      display:flex; align-items:center; justify-content:flex-end;
      padding-right:18px; opacity:0; transition:opacity 0.1s;
      color:#fff; font-size:13px; font-weight:600; gap:6px;
    `;
    swipeBg.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">delete</span> Delete';

    // The actual session row
    const el = document.createElement('div');
    el.className = 'session-item flex items-center gap-1 p-3 cursor-pointer';
    el.style.cssText = `border-radius:12px; position:relative; z-index:1; will-change:transform;
      background:${isActive ? 'linear-gradient(135deg,#ac2471,#7212ff)' : 'var(--color-surface, #fcf9f8)'};
      color:${isActive ? '#ffffff' : ''};
    `;

    // Title
    const titleSpan = document.createElement('span');
    titleSpan.className = 'truncate text-sm font-medium flex-1 mr-1';
    titleSpan.style.color = isActive ? '#ffffff' : '';
    titleSpan.textContent = session.title || 'New Chat';

    // Edit button
    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-0.5 shrink-0';
    const editBtn = document.createElement('button');
    editBtn.className = 'icon-btn p-1';
    editBtn.style.color = isActive ? 'rgba(255,255,255,0.85)' : '';
    editBtn.title = 'Rename chat';
    editBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">edit</span>';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const newTitle = prompt('Rename this chat:', session.title);
      if (newTitle && newTitle.trim() && currentUser) {
        renameSession(currentUser.uid, session.id, newTitle.trim());
      }
    });

    el.addEventListener('click', () => {
      if (currentUser && getCurrentSessionId() !== session.id) {
        switchSession(currentUser, session.id);
        renderSessions(currentSessions);
      }
      closeSidebar();
    });

    addSwipeToDelete(el, session);

    actions.appendChild(editBtn);
    el.appendChild(titleSpan);
    el.appendChild(actions);
    wrapper.appendChild(swipeBg);
    wrapper.appendChild(el);
    sessionList.appendChild(wrapper);
  });
}


// ── Auth form setup ────────────────────────────────────────
const btnAuthText = document.getElementById('btn-auth-text');
const authError   = document.getElementById('auth-error');

// ── Auth form submit ───────────────────────────────────────
document.getElementById('form-auth')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAuthError();

  const email    = document.getElementById('input-email')?.value.trim()    ?? '';
  const password = document.getElementById('input-password')?.value          ?? '';

  if (!email || !password) {
    showAuthError('Please fill in all fields.');
    return;
  }

  setAuthLoading(true);

  try {
    await signIn(email, password);
    // onAuthStateChanged will handle the view switch
  } catch (err) {
    showAuthError(parseAuthError(err.code));
    setAuthLoading(false);
  }
});

function showAuthError(msg) {
  if (!authError) return;
  authError.textContent = msg;
  authError.classList.remove('hidden');
}
function hideAuthError() {
  authError?.classList.add('hidden');
}
function setAuthLoading(loading) {
  const btn     = document.getElementById('btn-auth-submit');
  const text    = document.getElementById('btn-auth-text');
  const spinner = document.getElementById('btn-auth-spinner');
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    if (text)    text.textContent = '';
    if (spinner) spinner.classList.remove('hidden');
  } else {
    if (text)    text.textContent = 'Sign In';
    if (spinner) spinner.classList.add('hidden');
  }
}

// ── Memory Bank button ─────────────────────────────────────
document.getElementById('btn-memory')?.addEventListener('click', () => openMemoryModal());

// ── Sign out ───────────────────────────────────────────────
const btnSignOut = document.getElementById('btn-signout');
let signoutTimeout = null;

btnSignOut?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (!signoutTimeout) {
    const iconSpan = btnSignOut.querySelector('.material-symbols-outlined');
    const originalHTML = btnSignOut.innerHTML;
    
    // Change style to warning text
    btnSignOut.innerHTML = '<span style="color:#ffb4ab; font-size:12px; font-weight:bold;">Confirm?</span>';
    
    signoutTimeout = setTimeout(() => {
      btnSignOut.innerHTML = originalHTML;
      signoutTimeout = null;
    }, 3000);
  } else {
    clearTimeout(signoutTimeout);
    signoutTimeout = null;
    await signOutUser();
    // onAuthStateChanged handles teardown + view switch
  }
});

// ── Forgot password ───────────────────────────────────────
document.getElementById('btn-forgot-password')?.addEventListener('click', async () => {
  const emailInput = document.getElementById('input-email');
  const email = emailInput?.value?.trim();
  if (!email) {
    showAuthError('Please enter your email address first, then click Forgot password.');
    emailInput?.focus();
    return;
  }
  try {
    // Firebase succeeds silently even if the email doesn't exist,
    // so we always show the same message — prevents user enumeration attacks.
    await sendPasswordReset(email);
  } catch (_) {
    // Swallow the error intentionally — do not reveal whether email exists
  }
  // Always show the same neutral confirmation
  const authError = document.getElementById('auth-error');
  if (authError) {
    authError.textContent = `If that email is registered, a reset link has been sent. Check your spam/junk folder if it doesn't arrive within a few minutes.`;
    authError.style.color = '#2e7d32';
    authError.classList.remove('hidden');
    setTimeout(() => {
      authError.classList.add('hidden');
      authError.style.color = '';
    }, 8000);
  }
});

// ── Splash screen dismissal ────────────────────────────────
function hideSplash() {
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  splash.style.opacity = '0';
  setTimeout(() => splash.remove(), 350);
}

watchAuthState((user) => {
  currentUser = user;
  if (user) {
    // Populate user UI
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) {
      const initial = (user.displayName ?? user.email ?? 'U')[0].toUpperCase();
      avatarEl.textContent = initial;
    }

    showView('chat');
    setAuthLoading(false);
    hideSplash();

    // Reset the auth form for next time
    document.getElementById('form-auth')?.reset();
    hideAuthError();

    // Setup sessions
    showSessionsLoading();
    unsubSessions = listSessions(user.uid, (sessions) => {
      renderSessions(sessions);
    });
    
    initChat(user).then(() => {
      updateMemoryBadge();
      checkAutoStartTour();
    });
  } else {
    showView('auth');
    hideSplash();
    teardownChat();
    sessionsLoaded = false;
    currentSessions = [];
    if (welcomeRecentContainer) {
      welcomeRecentContainer.classList.add('hidden');
    }
    if (unsubSessions) {
      unsubSessions();
      unsubSessions = null;
    }
    setAuthLoading(false);
  }
});

// ── Service Worker registration ────────────────────────────
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        '/IslaIntelligence/sw.js',
        { scope: '/IslaIntelligence/' },
      );

    } catch (err) {

    }
  });
}

// ── PWA Install prompt ─────────────────────────────────────
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('install-banner')?.classList.remove('hidden');
});

document.getElementById('btn-install')?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;

  deferredInstallPrompt = null;
  document.getElementById('install-banner')?.classList.add('hidden');
});

document.getElementById('btn-dismiss-install')?.addEventListener('click', () => {
  document.getElementById('install-banner')?.classList.add('hidden');
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  document.getElementById('install-banner')?.classList.add('hidden');

});

// Initialize fullscreen diagram viewer, voice waveform visualizer, UV index view, eBay Antique Tracker, and Interactive Tour Engine
initDiagramViewer();
initVisualizer();
initUvView();
initEbayView();
initIslaTour();
