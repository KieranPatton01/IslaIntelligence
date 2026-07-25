/**
 * chat.js — Chat controller
 *
 * Responsibilities:
 *  • Load historical messages from Firestore on init
 *  • Set up all UI event listeners (slider, textarea, send, image attach)
 *  • Handle the full send flow:
 *      1. Optimistic UI append
 *      2. Firebase Storage upload (if image)
 *      3. Stream from Cloudflare Worker → Gemini 2.0 Flash
 *      4. Persist user + AI messages to Firestore
 *  • Tear down listeners when the user signs out
 */

import { db, storage, auth } from './firebase.js';
import {
  collection, addDoc, query, orderBy, limit,
  onSnapshot, serverTimestamp, getDocs, deleteDoc,
  doc, updateDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

import { streamChat } from './api.js';
import { createSession, generateSessionTitle } from './sessions.js';
import {
  appendMessage,
  showTypingIndicator,
  hideTypingIndicator,
  createStreamingBubble,
  confirmBubble,
  markBubbleError,
  setSendLoading,
  clearMessages,
  scrollToBottom,
  updateStreamingBubble,
  updateThinkingThought,
  addDebugInfoToBubble,
  setupDynamicSpacer,
  setCurrentTone,
  truncateMessagesAfter,
  scrollElementToTop,
} from './ui.js';
import { loadFacts, saveFact, deleteFact, loadTrinkets, saveTrinket, deleteTrinket } from './memory.js';

// ── Module-level state ──────────────────────────────────────
let unsubMessages = null;       // Firestore onSnapshot unsubscribe fn
let messageHistory = [];        // Local context window sent to Gemini
let initialLoadDone = false;    // Flag: first Firestore batch loaded
let stagedMediaList = [];       // Array of staged files: { file: File, base64: string, dataUrl: string }
let isSending = false;    // Guard against double-sends
export let currentSessionId = null; // Exposed so main.js can read it
export function getCurrentSessionId() { return currentSessionId; }
let userFacts = [];             // Memory bank facts (loaded on login)
let userTrinkets = [];          // Collected trinkets (loaded on login)
let currentUid = null;          // UID of signed-in user

// ── Voice Recording State ──────────────────────────────────
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// ── Tone label map ─────────────────────────────────────────
const TONE_LABELS = [
  { max: 20, label: '😤 Full Wagebait', color: '#ba1a1a' },
  { max: 40, label: '😏 Slightly Teasing', color: '#d44000' },
  { max: 60, label: 'Formal AI', color: '#ac2471' },
  { max: 80, label: '🥰 Slightly Sooky', color: '#7212ff' },
  { max: 100, label: '👑 Princess Mode', color: '#5700c9' },
];

function getToneLabel(value) {
  return TONE_LABELS.find(t => value <= t.max) ?? TONE_LABELS.at(-1);
}

// ── Public API ─────────────────────────────────────────────

/**
 * Initialise the chat for a signed-in user.
 * @param {import('firebase/auth').User} user
 * @param {string|null} sessionId
 */
export async function initChat(user) {
  initialLoadDone = false;
  messageHistory = [];
  stagedMediaList = [];
  isSending = false;
  currentUid = user.uid;

  clearMessages();
  setupDynamicSpacer();
  setupToneSlider();
  setupThinkingToggle();
  setupEventListeners(user);

  // Load memory bank facts and trinkets for this user
  userFacts = await loadFacts(user.uid);
  userTrinkets = await loadTrinkets(user.uid);

  // Cleanup legacy messages
  deleteLegacyMessages(user.uid);
}

/**
 * Switch to a different session without tearing down global listeners.
 */
export function switchSession(user, sessionId) {
  currentSessionId = sessionId;
  if (sessionId) {
    loadHistory(user.uid, sessionId);
  } else {
    if (unsubMessages) {
      unsubMessages();
      unsubMessages = null;
    }
    initialLoadDone = false;
    clearMessages();
    messageHistory = [];
    stagedMediaList = [];
    showWelcomeScreen();
  }
}

/** Tear down Firestore listener (called on sign-out). */
export function teardownChat() {
  if (unsubMessages) {
    unsubMessages();
    unsubMessages = null;
  }
  messageHistory = [];
  initialLoadDone = false;
  currentSessionId = null;
  currentUid = null;
  userFacts = [];
  userTrinkets = [];
  clearMessages();
}

// ── Private helpers ────────────────────────────────────────

function setupToneSlider() {
  const slider = document.getElementById('tone-slider');
  const label = document.getElementById('tone-label');
  const welcome = document.getElementById('welcome-message');

  if (!slider || !label) return;

  const update = () => {
    const v = parseInt(slider.value, 10);
    const info = getToneLabel(v);
    label.textContent = `${info.label}`;
    label.style.color = info.color;

    if (welcome) {
      if (v <= 20) welcome.textContent = 'WHAT DO YOU WANT?';
      else if (v <= 40) welcome.textContent = 'Oh, you again?';
      else if (v <= 60) welcome.textContent = 'Welcome.';
      else if (v <= 80) welcome.textContent = 'Hello my crush';
      else welcome.textContent = 'Miss Isla, my queen';
    }
    setCurrentTone(v);
  };

  // Only attach listener if we haven't already (prevents dupes on re-init)
  if (!slider.dataset.listenerAttached) {
    slider.addEventListener('input', update);
    slider.dataset.listenerAttached = 'true';
  }
  update(); // set initial state
}

let currentModelChoice = '3.5-standard';

function setupThinkingToggle() {
  const selectorBtn = document.getElementById('btn-gemini-model-selector');
  const menu = document.getElementById('gemini-model-menu');
  const icon = document.getElementById('gemini-model-icon');
  const label = document.getElementById('gemini-model-name');
  if (!selectorBtn || !menu || selectorBtn.dataset.listenerAttached) return;

  selectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !selectorBtn.contains(e.target)) {
      menu.classList.add('hidden');
    }
  });

  const options = menu.querySelectorAll('.gemini-model-option');
  options.forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const choice = opt.getAttribute('data-model');
      currentModelChoice = choice;

      options.forEach(o => o.classList.remove('bg-[#ac2471]/10'));
      opt.classList.add('bg-[#ac2471]/10');

      if (choice === '3.1-lite') {
        if (icon) icon.textContent = 'speed';
        if (label) label.textContent = '⚡ Stupid (3.1 Lite)';
      } else if (choice === '3.6-extended') {
        if (icon) icon.textContent = 'psychology';
        if (label) label.textContent = '🧠 Stinky-Pro (3.6 High Thinking)';
      } else {
        if (icon) icon.textContent = 'bolt';
        if (label) label.textContent = '🚀 Silly (3.6 Low Thinking)';
      }

      menu.classList.add('hidden');
    });
  });

  selectorBtn.dataset.listenerAttached = 'true';
}

/** Load the last 100 messages from Firestore and render them once. */
function loadHistory(uid, sessionId) {
  if (unsubMessages) unsubMessages();
  initialLoadDone = false;
  clearMessages();
  messageHistory = [];
  hideWelcomeScreen();

  const messagesRef = collection(db, 'users', uid, 'sessions', sessionId, 'messages');
  const handleSnapshot = (snapshot) => {
    if (initialLoadDone) return;
    initialLoadDone = true;

    clearMessages();
    messageHistory = [];

    const docs = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    docs.sort((a, b) => {
      let ta = 0, tb = 0;
      if (a.createdAt) ta = typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : new Date(a.createdAt).getTime();
      if (b.createdAt) tb = typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : new Date(b.createdAt).getTime();
      return (ta || 0) - (tb || 0);
    });

    docs.forEach((data) => {
      if (data.text && data.text.startsWith('[System intercept:')) {
        messageHistory.push({ role: data.role, text: data.text });
        return;
      }

      appendMessage({
        role: data.role,
        text: data.text ?? null,
        imageUrl: data.imageUrl ?? null,
        mediaList: data.mediaList ?? null,
        thought: data.thought ?? null,
        id: data.id,
        toneValue: data.toneValue,
        aiModel: data.aiModel ?? null,
        createdAt: data.createdAt
      });
      messageHistory.push({ role: data.role, text: data.text ?? '' });
    });

    scrollToBottom();
  };

  const q = query(messagesRef, orderBy('createdAt', 'asc'), limit(100));
  unsubMessages = onSnapshot(q, handleSnapshot, () => {
    // Fallback: if index or orderBy fails, query without orderBy & sort in JS
    unsubMessages = onSnapshot(messagesRef, handleSnapshot, () => {
      showWelcomeScreen();
    });
  });
}

function showWelcomeScreen() {
  document.getElementById('view-welcome').style.display = 'flex';
  document.getElementById('messages-container').style.display = 'none';
}

function hideWelcomeScreen() {
  document.getElementById('view-welcome').style.display = 'none';
  document.getElementById('messages-container').style.display = 'flex';
}

function setupEventListeners(user) {
  const textarea = document.getElementById('input-message');

  if (!textarea.dataset.listenerAttached) {
    const inputBarContainer = document.getElementById('input-bar-container');
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 128) + 'px';

      const hasText = textarea.value.trim().length > 0;
      if (hasText) {
        inputBarContainer?.classList.add('input-bar-typing');
      } else {
        inputBarContainer?.classList.remove('input-bar-typing');
      }
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend(user);
      }
    });

    document.getElementById('btn-send')?.addEventListener('click', () => handleSend(user));

    // Close Drawer handlers
    document.getElementById('btn-close-drawer')?.addEventListener('click', () => closeMemoryDrawer());
    document.getElementById('drawer-backdrop')?.addEventListener('click', () => closeMemoryDrawer());

    // Add facts handler inside drawer
    const drawerAddInput = document.getElementById('drawer-add-input');
    const drawerAddBtn = document.getElementById('drawer-add-btn');

    const handleDrawerAdd = async () => {
      const val = drawerAddInput?.value?.trim();
      if (!val) return;
      const saved = await saveFact(user.uid, val, userFacts);
      if (saved) {
        userFacts = [...userFacts, val];
        renderDrawerFacts();
        updateMemoryBadge();
      }
      if (drawerAddInput) drawerAddInput.value = '';
    };

    drawerAddBtn?.addEventListener('click', handleDrawerAdd);
    drawerAddInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleDrawerAdd();
      }
    });

    const btnAttach = document.getElementById('btn-attach');
    const inputFile = document.getElementById('input-file');
    const btnRemove = document.getElementById('btn-remove-image');

    btnAttach?.addEventListener('click', () => inputFile?.click());

    inputFile?.addEventListener('change', (e) => {
      const selectedFiles = Array.from(e.target.files || []);
      if (selectedFiles.length === 0) return;

      selectedFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target.result;
          const base64 = dataUrl.split(',')[1];
          stagedMediaList.push({
            file: file,
            base64: base64,
            dataUrl: dataUrl
          });
          renderStagedPreviews();
        };
        reader.readAsDataURL(file);
      });
      e.target.value = '';
    });

    const btnTrinkify = document.getElementById('btn-trinkify');
    const inputTrinkify = document.getElementById('input-trinkify');

    btnTrinkify?.addEventListener('click', () => inputTrinkify?.click());

    inputTrinkify?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        const base64 = dataUrl.split(',')[1];
        stagedMediaList.push({
          file: file,
          base64: base64,
          dataUrl: dataUrl
        });
        renderStagedPreviews();

        // Auto-fill and submit
        const textarea = document.getElementById('input-message');
        if (textarea) {
          textarea.value = "Trinkify this space perhaps";
        }
        handleSend(user);
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    // Scan Text (OCR)
    const btnOcr = document.getElementById('btn-ocr');
    const inputOcr = document.getElementById('input-ocr');
    const ocrContainer = document.getElementById('ocr-status-container');
    const ocrText = document.getElementById('ocr-status-text');
    const btnCancelOcr = document.getElementById('btn-cancel-ocr');

    let ocrCancelled = false;

    btnOcr?.addEventListener('click', () => {
      ocrCancelled = false;
      inputOcr?.click();
    });

    btnCancelOcr?.addEventListener('click', () => {
      ocrCancelled = true;
      ocrContainer?.classList.add('hidden');
    });

    inputOcr?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      e.target.value = ''; // Reset file input

      if (ocrContainer && ocrText) {
        ocrContainer.classList.remove('hidden');
        ocrText.textContent = "Analyzing text with Isla Vision... 45%";
      }

      try {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          if (ocrCancelled) return;
          const dataUrl = ev.target.result;
          const base64 = dataUrl.split(',')[1];

          if (ocrText) ocrText.textContent = "Extracting text... 90%";

          const { stream } = await streamChat({
            messages: [{ role: 'user', text: 'Extract and transcribe all text visible in this document/image accurately. Output only the extracted text with clean line breaks.' }],
            toneValue: 50,
            userFacts: [],
            mediaList: [{ mimeType: file.type, data: base64 }],
            modelChoice: '3.1-lite'
          });

          let extractedText = '';
          for await (const chunk of stream) {
            if (chunk.type === 'text' && chunk.text) {
              extractedText += chunk.text;
            }
          }

          if (ocrCancelled) return;
          if (extractedText.trim()) {
            openOcrDrawer(extractedText.trim());
          }
        };
        reader.readAsDataURL(file);
      } catch (err) {
        // OCR failed silently
      } finally {
        ocrContainer?.classList.add('hidden');
      }
    });

    // OCR Drawer Elements & Handlers
    const ocrDrawer = document.getElementById('ocr-drawer');
    const ocrDrawerContent = document.getElementById('ocr-drawer-content');
    const ocrDrawerText = document.getElementById('ocr-drawer-text');
    const btnCloseOcrDrawer = document.getElementById('btn-close-ocr-drawer');
    const btnOcrCopy = document.getElementById('btn-ocr-copy');
    const ocrCopyText = document.getElementById('ocr-copy-text');
    const btnOcrInsert = document.getElementById('btn-ocr-insert');
    const btnOcrSummarize = document.getElementById('btn-ocr-summarize');
    const btnOcrReword = document.getElementById('btn-ocr-reword');
    const ocrDefaultActions = document.getElementById('ocr-default-actions');
    const ocrRewordActions = document.getElementById('ocr-reword-actions');
    const btnOcrRewordBack = document.getElementById('btn-ocr-reword-back');

    function openOcrDrawer(text) {
      if (!ocrDrawer || !ocrDrawerContent || !ocrDrawerText) return;
      ocrDrawerText.value = text;

      // Reset copy button status
      if (ocrCopyText) ocrCopyText.textContent = "Copy Text";
      const copyIcon = btnOcrCopy?.querySelector('.material-symbols-outlined');
      if (copyIcon) copyIcon.textContent = "content_copy";

      // Reset panel view
      ocrDefaultActions?.classList.remove('hidden');
      ocrRewordActions?.classList.add('hidden');

      ocrDrawer.style.display = 'flex';
      // Trigger animations
      setTimeout(() => {
        ocrDrawer.classList.remove('opacity-0');
        ocrDrawer.classList.add('opacity-100');
        ocrDrawerContent.classList.remove('translate-y-full');
        ocrDrawerContent.classList.add('translate-y-0');
      }, 10);
    }

    function closeOcrDrawer() {
      if (!ocrDrawer || !ocrDrawerContent) return;
      ocrDrawer.classList.remove('opacity-100');
      ocrDrawer.classList.add('opacity-0');
      ocrDrawerContent.classList.remove('translate-y-0');
      ocrDrawerContent.classList.add('translate-y-full');

      setTimeout(() => {
        ocrDrawer.style.display = 'none';
      }, 300);
    }

    btnCloseOcrDrawer?.addEventListener('click', closeOcrDrawer);
    ocrDrawer?.addEventListener('click', (ev) => {
      if (ev.target === ocrDrawer) {
        closeOcrDrawer();
      }
    });

    btnOcrCopy?.addEventListener('click', async () => {
      const textToCopy = ocrDrawerText?.value || '';
      try {
        await navigator.clipboard.writeText(textToCopy);
        if (ocrCopyText) ocrCopyText.textContent = "Copied!";
        const copyIcon = btnOcrCopy?.querySelector('.material-symbols-outlined');
        if (copyIcon) copyIcon.textContent = "check";

        setTimeout(() => {
          if (ocrCopyText) ocrCopyText.textContent = "Copy Text";
          if (copyIcon) copyIcon.textContent = "content_copy";
        }, 2000);
      } catch {
        // Copy failed silently
      }
    });

    btnOcrInsert?.addEventListener('click', () => {
      const text = ocrDrawerText?.value || '';
      if (text && textarea) {
        textarea.value = (textarea.value ? textarea.value + "\n" : "") + text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
      }
      closeOcrDrawer();
    });

    btnOcrSummarize?.addEventListener('click', () => {
      const text = ocrDrawerText?.value || '';
      if (text && textarea) {
        textarea.value = "Please summarize this document:\n\n" + text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        handleSend(user);
      }
      closeOcrDrawer();
    });

    btnOcrReword?.addEventListener('click', () => {
      ocrDefaultActions?.classList.add('hidden');
      ocrRewordActions?.classList.remove('hidden');
    });

    btnOcrRewordBack?.addEventListener('click', () => {
      ocrRewordActions?.classList.add('hidden');
      ocrDefaultActions?.classList.remove('hidden');
    });

    const toneButtons = ocrRewordActions?.querySelectorAll('[data-ocr-tone]');
    toneButtons?.forEach(btn => {
      btn.addEventListener('click', () => {
        const tone = btn.getAttribute('data-ocr-tone');
        const text = ocrDrawerText?.value || '';
        if (!text || !textarea) return;

        let promptPrefix = '';
        if (tone === 'professional') {
          promptPrefix = "Please reword this text in a professional, clear business tone:\n\n";
        } else if (tone === 'casual') {
          promptPrefix = "Please reword this text in a friendly, casual, and relaxed tone:\n\n";
        } else if (tone === 'eli5') {
          promptPrefix = "Please explain and reword this text as if I am a 5 year old:\n\n";
        } else if (tone === 'custom') {
          const customTone = prompt("Enter custom tone description (e.g. Passive aggressive, Shakespearean, Pirate, Victorian princess):");
          if (!customTone || !customTone.trim()) return;
          promptPrefix = `Please reword this text in a ${customTone.trim()} tone:\n\n`;
        }

        textarea.value = promptPrefix + text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        handleSend(user);
        closeOcrDrawer();
      });
    });

    btnRemove?.addEventListener('click', clearStagedImage);

    // Voice Recording
    const btnMic = document.getElementById('btn-mic');
    btnMic?.addEventListener('click', handleMicClick);

    // Reset back to home/welcome screen when user clicks any link in the chat bubbles
    document.getElementById('messages-container')?.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.getAttribute('href')) {
        e.preventDefault();
        window.open(link.href, '_blank');
        setTimeout(() => {
          switchSession(user, null);
        }, 100);
      }
    });

    // ── Auto-focus textarea after sending ──────────────────────────────
    // Restores keyboard focus on desktop so users don't have to re-click.
    // On iOS, the keyboard won't auto-pop (requires user gesture), but
    // focus state is still restored correctly for the next interaction.
    const btnSend = document.getElementById('btn-send');
    if (btnSend) {
      btnSend.addEventListener('click', () => {
        if (window.innerWidth > 768) {
          setTimeout(() => textarea?.focus(), 80);
        }
      });
    }

    textarea?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        if (window.innerWidth > 768) {
          setTimeout(() => textarea?.focus(), 80);
        }
      }
    });

    // ── Offline / Online detection ─────────────────────────────────────
    const offlineBanner = document.getElementById('offline-banner');
    const showOfflineBanner = () => {
      if (offlineBanner) offlineBanner.style.display = 'block';
    };
    const hideOfflineBanner = () => {
      if (offlineBanner) offlineBanner.style.display = 'none';
    };
    window.addEventListener('offline', showOfflineBanner);
    window.addEventListener('online', hideOfflineBanner);
    // Check initial state (in case page loaded offline)
    if (!navigator.onLine) showOfflineBanner();

    const messagesContainer = document.getElementById('messages-container');
    messagesContainer?.addEventListener('message-reprompt', async (e) => {
      if (isSending) return;

      const { messageId, text } = e.detail;
      isSending = true;
      setSendLoading(true);

      try {
        if (messageId) {
          // 1. Manually update local context history and truncate subsequent items
          const msgWrappers = Array.from(messagesContainer.querySelectorAll('.msg-wrapper'));
          const index = msgWrappers.findIndex(w => w.dataset.messageId === messageId);
          if (index !== -1) {
            messageHistory = messageHistory.slice(0, index + 1);
            if (messageHistory[index]) {
              messageHistory[index].text = text;
            }
            // 2. Remove subsequent bubbles from UI
            truncateMessagesAfter(messageId);

            // Scroll edited user bubble to top of container
            const editedBubble = msgWrappers[index]?.querySelector('.bubble');
            if (editedBubble) {
              setTimeout(() => scrollElementToTop(editedBubble), 120);
            }
          }

          // 3. Find and delete subsequent messages in Firestore, and update the edited message in place
          if (user && currentSessionId) {
            const messagesColl = collection(db, 'users', user.uid, 'sessions', currentSessionId, 'messages');
            const q = query(messagesColl, orderBy('createdAt', 'asc'));
            const querySnapshot = await getDocs(q);

            let foundEdited = false;
            const docsToDelete = [];

            for (const docSnap of querySnapshot.docs) {
              if (foundEdited) {
                docsToDelete.push(docSnap.ref);
              }
              if (docSnap.id === messageId) {
                foundEdited = true;
              }
            }

            // Update edited message document
            const msgDocRef = doc(db, 'users', user.uid, 'sessions', currentSessionId, 'messages', messageId);
            await updateDoc(msgDocRef, { text });

            // Delete subsequent documents
            for (const docRef of docsToDelete) {
              await deleteDoc(docRef);
            }
          }
        } else {
          // No Firestore id — still reprompt using current in-memory history
          // Just push the edited text as the last user message
          if (messageHistory.length > 0) {
            messageHistory[messageHistory.length - 1].text = text;
          } else {
            messageHistory.push({ role: 'user', text });
          }
        }

        // 4. Trigger streaming AI response for the new truncated history
        showTypingIndicator();
        let aiTextEl = null;
        let fullResponse = '';

        const toneSlider = document.getElementById('tone-slider');
        const toneValue = parseInt(toneSlider?.value ?? '50', 10);

        try {
          hideTypingIndicator();
          const { textEl } = createStreamingBubble();
          aiTextEl = textEl;

          let requestedLocation = false;

          const { stream, model: aiModel } = await streamChat({
            messages: messageHistory,
            toneValue,
            userFacts,
            onNewMemory: async (fact) => {
              const saved = await saveFact(currentUid, fact, userFacts);
              if (saved) {
                userFacts = [...userFacts, fact];
                showMemoryToast(fact);
              }
            },
          });

          let hasReceivedAnyText = false;
          for await (const chunk of stream) {
            if (chunk.type === 'thought') {
              updateThinkingThought(textEl, chunk.text);
            } else if (chunk.type === 'text') {
              if (chunk.text) hasReceivedAnyText = true;
              fullResponse += chunk.text;
            }

            if (fullResponse.includes('[REQUEST_LOCATION]')) {
              requestedLocation = true;
              fullResponse = fullResponse.replace('[REQUEST_LOCATION]', '');
            }

            updateStreamingBubble(textEl, fullResponse);
            scrollToBottom();
          }

          if (!hasReceivedAnyText && !requestedLocation) {
            throw new Error('Received empty response from the AI.');
          }

          updateStreamingBubble(textEl, fullResponse, true);

          if (requestedLocation && fullResponse.trim() === '') {
            if (aiTextEl?.closest('.msg-wrapper')) {
              aiTextEl.closest('.msg-wrapper').remove();
            }
          } else {
            if (aiTextEl) {
              addDebugInfoToBubble(aiTextEl.closest('.bubble'), {
                toneValue,
                createdAt: Date.now(),
                aiModel
              });
              scrollToBottom();
            }

            messageHistory.push({ role: 'model', text: fullResponse });
            const cleanResponse = fullResponse.replace(/\[\[MEMORY:[^\]]*\]\]/gi, '').trim();

            await saveMessage(user.uid, currentSessionId, {
              role: 'model',
              text: cleanResponse,
              imageUrl: null,
              imageRef: null,
              toneValue,
              aiModel,
            });
          }
        } catch {
          // Stream error — handled by UI state
        }
      } catch {
        // Firestore update failed silently
      } finally {
        isSending = false;
        setSendLoading(false);
      }
    });

    textarea.dataset.listenerAttached = 'true';
  }
}

// ── Voice Recording Logic ──────────────────────────────────
async function handleMicClick() {
  const btnMic = document.getElementById('btn-mic');
  const icon = btnMic?.querySelector('span');

  if (isRecording) {
    // Stop recording
    mediaRecorder.stop();
    isRecording = false;
    btnMic.classList.remove('btn-recording');
    if (icon) {
      icon.textContent = 'mic';
      icon.style.fontVariationSettings = "'FILL' 0";
    }
  } else {
    // Start recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Use webm if available, otherwise mp4 (safari) or whatever is default
      const options = MediaRecorder.isTypeSupported('audio/webm')
        ? { mimeType: 'audio/webm' }
        : undefined;

      mediaRecorder = new MediaRecorder(stream, options);
      audioChunks = [];

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunks, { type: mimeType });

        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const stagedVoiceFile = new File([audioBlob], `voice_note.${ext}`, { type: mimeType });

        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target.result;
          const base64 = dataUrl.split(',')[1];
          stagedMediaList.push({
            file: stagedVoiceFile,
            base64: base64,
            dataUrl: dataUrl
          });
          renderStagedPreviews();
        };
        reader.readAsDataURL(audioBlob);

        // Stop all tracks to turn off the red dot in browser tab
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      btnMic.classList.add('btn-recording');
      if (icon) {
        icon.textContent = 'stop';
        icon.style.fontVariationSettings = "'FILL' 1";
      }
    } catch {
      setRecordingState(false);
    }
  }
}

function renderStagedPreviews() {
  const strip = document.getElementById('image-preview-strip');
  if (!strip) return;

  strip.innerHTML = '';

  if (stagedMediaList.length === 0) {
    strip.classList.add('hidden');
    return;
  }

  stagedMediaList.forEach((media, idx) => {
    const isImg = media.file.type.startsWith('image/');
    const isAud = media.file.type.startsWith('audio/');
    const ext = media.file.name.split('.').pop().toUpperCase();

    const itemWrapper = document.createElement('div');
    itemWrapper.className = 'relative shrink-0 w-14 h-14';

    if (isImg) {
      const thumb = document.createElement('div');
      thumb.className = 'w-14 h-14 rounded-xl bg-cover bg-center border-2';
      thumb.style.borderColor = 'rgba(255,105,180,0.5)';
      thumb.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
      thumb.style.backgroundImage = `url(${media.dataUrl})`;
      itemWrapper.appendChild(thumb);
    } else {
      // White box for non-image files
      const box = document.createElement('div');
      box.className = 'w-14 h-14 rounded-xl bg-white border-2 flex flex-col items-center justify-center p-1 text-center';
      box.style.borderColor = 'rgba(172,36,113,0.2)';
      box.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';

      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined text-primary';
      icon.style.fontSize = '18px';
      icon.textContent = isAud ? 'volume_up' : 'description';

      const extLabel = document.createElement('span');
      extLabel.style.fontSize = '9px';
      extLabel.style.fontWeight = '700';
      extLabel.className = 'text-primary truncate max-w-full uppercase';
      extLabel.textContent = ext;

      box.appendChild(icon);
      box.appendChild(extLabel);
      itemWrapper.appendChild(box);
    }

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white shadow-md cursor-pointer';
    closeBtn.style.background = '#ac2471';
    closeBtn.style.border = 'none';
    closeBtn.setAttribute('aria-label', `Remove ${media.file.name}`);
    closeBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:12px; font-variation-settings:\'FILL\' 1;">close</span>';

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      stagedMediaList.splice(idx, 1);
      renderStagedPreviews();
    });

    itemWrapper.appendChild(closeBtn);
    strip.appendChild(itemWrapper);
  });

  strip.classList.remove('hidden');
}

function clearStagedMedia() {
  stagedMediaList = [];
  document.getElementById('image-preview-strip')?.classList.add('hidden');
  const strip = document.getElementById('image-preview-strip');
  if (strip) strip.innerHTML = '';
}

// ── Core send flow ─────────────────────────────────────────

async function handleSend(user, systemOverrideText = null) {
  if (isSending) return;

  const textarea = document.getElementById('input-message');
  const toneSlider = document.getElementById('tone-slider');
  const text = systemOverrideText !== null ? systemOverrideText : (textarea?.value.trim() ?? '');
  const toneValue = parseInt(toneSlider?.value ?? '50', 10);

  // Must have text or at least one file
  if (!text && stagedMediaList.length === 0) return;

  isSending = true;
  setSendLoading(true);

  if (systemOverrideText === null && textarea) {
    textarea.value = '';
    textarea.style.height = 'auto';
    textarea.blur(); // Dismiss mobile soft keyboard on single tap
    document.activeElement?.blur();
    document.getElementById('input-bar-container')?.classList.remove('input-bar-typing');
  }

  // Create session if first message
  if (!currentSessionId) {
    currentSessionId = await createSession(user.uid);
    hideWelcomeScreen();
  }



  const currentStagedList = [...stagedMediaList];
  clearStagedMedia();

  const optimisticMediaList = currentStagedList.map(m => ({
    name: m.file.name,
    url: m.dataUrl || URL.createObjectURL(m.file),
    mimeType: m.file.type,
    file: m.file
  }));

  let userBubble = null;
  if (systemOverrideText === null) {
    userBubble = appendMessage({
      role: 'user',
      text: text || null,
      mediaList: optimisticMediaList,
      sending: true,
      toneValue: toneValue,
      createdAt: Date.now()
    });
  }

  const cleanInput = (text || '').trim().toLowerCase();
  const isHelpQuery = cleanInput === 'help' || cleanInput === '/help';
  const apiPromptText = isHelpQuery
    ? "Provide a clear, fun, and easy-to-read user guide to all 7 features of Isla Intelligence for Isla (1. 🗺️ Interactive Leaflet Maps & Cabinet Blueprints, 2. 📊 Flowcharts & Timelines, 3. 🎬 Antique Reels Feed, 4. 🔔 Alert Trackers & Email Notifications, 5. 📚 Memories & Virtual Trinket Shelf, 6. 📎 Media Attachments & 📝 OCR Scanner, 7. 👑 Mood/Tone Slider). Explain what each feature does clearly so she knows how to use them. Write this guide in character matching your CURRENT personality mode (whether sarcastic/ragebait, formal, or princess), but ALWAYS list and explain all 7 features clearly in rendered Markdown with headers and bullet points!"
    : (text || '');

  messageHistory.push({ role: 'user', text: apiPromptText });

  // Upload all staged files to Firebase Storage
  const uploadedMediaList = [];
  for (const media of currentStagedList) {
    try {
      const storageRef = ref(
        storage,
        `users/${user.uid}/sessions/${currentSessionId}/images/${Date.now()}_${media.file.name}`,
      );
      const snapshot = await uploadBytes(storageRef, media.file);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      uploadedMediaList.push({
        name: media.file.name,
        url: downloadUrl,
        mimeType: media.file.type,
        ref: `users/${user.uid}/sessions/${currentSessionId}/images/${media.file.name}`
      });
    } catch {
      // File upload failed silently
    }
  }

  if (userBubble) {
    confirmBubble(userBubble);
  }

  saveMessage(user.uid, currentSessionId, {
    role: 'user',
    text: text || null,
    mediaList: uploadedMediaList.length > 0 ? uploadedMediaList : null,
    toneValue,
  });

  showTypingIndicator();
  let aiTextEl = null;
  let fullResponse = '';

  try {
    hideTypingIndicator();
    const { textEl } = createStreamingBubble();
    aiTextEl = textEl;

    let requestedLocation = false;

    // Prepare media payload for Gemini Worker
    const mediaListPayload = currentStagedList.map(m => {
      let mime = m.file.type || 'application/pdf';
      if (m.file.name && m.file.name.toLowerCase().endsWith('.pdf')) {
        mime = 'application/pdf';
      }
      return {
        name: m.file.name,
        data: m.base64,
        mimeType: mime
      };
    });

    const streamStartTime = Date.now();
    const { stream, model: aiModel } = await streamChat({
      messages: messageHistory,
      toneValue,
      userFacts,
      mediaList: mediaListPayload,
      modelChoice: currentModelChoice,
      onNewMemory: async (fact) => {
        const saved = await saveFact(currentUid, fact, userFacts);
        if (saved) {
          userFacts = [...userFacts, fact];
          showMemoryToast(fact);
          updateMemoryBadge();
        }
      },
      onNewTrinket: async (trinket) => {
        const saved = await saveTrinket(currentUid, trinket, userTrinkets);
        if (saved) {
          userTrinkets = [...userTrinkets, trinket];
          renderDrawerTrinkets();
        }
      }
    });

    let hasReceivedAnyText = false;

    for await (const chunk of stream) {
      if (chunk.type === 'thought') {
        updateThinkingThought(textEl, chunk.text);
      } else if (chunk.type === 'text') {
        if (chunk.text) hasReceivedAnyText = true;
        fullResponse += chunk.text;
      }

      if (fullResponse.includes('[REQUEST_LOCATION]')) {
        requestedLocation = true;
        fullResponse = fullResponse.replace('[REQUEST_LOCATION]', '');
      }

      updateStreamingBubble(textEl, fullResponse, false);
    }

    if (!hasReceivedAnyText && !requestedLocation) {
      throw new Error('Received empty response from the AI.');
    }

    const latencyMs = Date.now() - streamStartTime;

    // Force a final complete render once streaming is over to ensure tables finish building
    updateStreamingBubble(textEl, fullResponse, true);

    if (requestedLocation && fullResponse.trim() === '') {
      if (aiTextEl?.closest('.msg-wrapper')) {
        aiTextEl.closest('.msg-wrapper').remove();
      }
    } else {
      if (aiTextEl) {
        addDebugInfoToBubble(aiTextEl.closest('.bubble'), {
          toneValue,
          createdAt: Date.now(),
          aiModel,
          latencyMs
        });
      }

      messageHistory.push({ role: 'model', text: fullResponse });

      // Strip any [[MEMORY:...]] markers before persisting to Firestore
      const cleanResponse = fullResponse.replace(/\[\[MEMORY:[^\]]*\]\]/gi, '').trim();

      await saveMessage(user.uid, currentSessionId, {
        role: 'model',
        text: cleanResponse,
        imageUrl: null,
        imageRef: null,
        toneValue,
        aiModel,
      });

      // Generate a session title using the first user message + AI reply for context.
      // If the user only sent an image with no text, we fall back to a placeholder so it triggers immediately.
      const firstUserMsg = messageHistory.find(m => m.role === 'user' && m.text && m.text.trim() && !m.text.includes('[System intercept:'))?.text || '[Uploaded Image]';
      generateSessionTitle(user.uid, currentSessionId, firstUserMsg, cleanResponse.slice(0, 600));
    }

    if (requestedLocation) {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const loc = `[System intercept: The user's current location is Latitude: ${pos.coords.latitude}, Longitude: ${pos.coords.longitude}]`;
            handleSend(user, loc);
          },
          () => {
            handleSend(user, `[System intercept: Failed to get location because user denied permission or error occurred.]`);
          }
        );
      }
    }

  } catch (err) {
    // Suppressed
    hideTypingIndicator();
    let userFriendlyError = "Shit, couldn't respond right now.";
    if (err && err.message) {
      if (err.message.includes('limit of') || err.message.includes('exceeds character limit')) {
        userFriendlyError = "Whoops, this thread is a little long! Why not start a fresh chat session dumbass?";
      }
    }
    if (aiTextEl?.closest('.msg-wrapper')) {
      markBubbleError(aiTextEl.closest('.msg-wrapper'), userFriendlyError);
    } else {
      appendMessage({
        role: 'model',
        text: userFriendlyError,
        toneValue,
        createdAt: Date.now()
      });
    }
  } finally {
    hideTypingIndicator();
    isSending = false;
    setSendLoading(false);
  }
}

/**
 * Write a message document to Firestore.
 */
async function saveMessage(uid, sessionId, { role, text, imageUrl, imageRef, mediaList, toneValue, aiModel }) {
  try {
    await addDoc(collection(db, 'users', uid, 'sessions', sessionId, 'messages'), {
      role,
      text: text ?? null,
      imageUrl: imageUrl ?? null,
      imageRef: imageRef ?? null,
      mediaList: mediaList ?? null,
      toneValue: toneValue ?? null,
      aiModel: aiModel ?? null,
      createdAt: serverTimestamp(),
      status: 'complete',
    });
  } catch (err) {
    if (!err.message?.includes('Document already exists')) {
      console.error('saveMessage failed:', err);
    }
  }
}

/**
 * Delete legacy messages that were stored at users/{uid}/messages
 */
async function deleteLegacyMessages(uid) {
  try {
    const legacyRef = collection(db, 'users', uid, 'messages');
    const snapshot = await getDocs(legacyRef);
    if (!snapshot.empty) {
      const deletePromises = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
      }
    }
  } catch {
    // Legacy cleanup failed silently
  }
}

// -- Memory Bank Toast --------------------------------------

function showMemoryToast(fact) {
  document.getElementById('memory-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'memory-toast';
  toast.className = 'memory-toast';
  // Build toast safely without innerHTML to prevent XSS from crafted memory facts
  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined';
  icon.style.cssText = 'font-size:15px;vertical-align:middle;margin-right:6px;';
  icon.textContent = 'neurology';
  const label = document.createElement('em');
  label.style.marginLeft = '4px';
  label.textContent = fact; // textContent prevents any HTML injection
  toast.appendChild(icon);
  toast.append('Memory saved: ', label);
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('memory-toast-hide'), 3000);
  setTimeout(() => toast.remove(), 3500);
}

export function updateMemoryBadge() {
  const badge = document.getElementById('memory-badge');
  if (!badge) return;
  badge.style.display = userFacts.length > 0 ? 'block' : 'none';
}

export function openMemoryModal() {
  const drawer = document.getElementById('memory-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  if (!drawer || !backdrop) return;

  drawer.classList.add('open');
  backdrop.classList.remove('hidden');
  backdrop.offsetWidth;
  backdrop.classList.add('show');

  renderDrawerFacts();
  renderDrawerTrinkets();
}

export function closeMemoryDrawer() {
  const drawer = document.getElementById('memory-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  if (!drawer || !backdrop) return;

  drawer.classList.remove('open');
  backdrop.classList.remove('show');
  setTimeout(() => {
    backdrop.classList.add('hidden');
  }, 300);
}

export function renderDrawerFacts() {
  const list = document.getElementById('drawer-fact-list');
  if (!list) return;
  list.innerHTML = '';

  if (userFacts.length === 0) {
    list.innerHTML = '<div class="drawer-empty-text">No memories yet. Start chatting and Isla will learn about you!</div>';
    return;
  }

  userFacts.forEach((fact) => {
    const card = document.createElement('div');
    card.className = 'drawer-fact-card';

    const textSpan = document.createElement('span');
    textSpan.className = 'drawer-fact-text';
    textSpan.textContent = fact;

    const delBtn = document.createElement('button');
    delBtn.className = 'drawer-fact-delete-btn';
    delBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
    delBtn.title = 'Delete memory';
    delBtn.addEventListener('click', async () => {
      await deleteFact(currentUid, fact);
      userFacts = userFacts.filter(f => f !== fact);
      renderDrawerFacts();
      updateMemoryBadge();
    });

    card.appendChild(textSpan);
    card.appendChild(delBtn);
    list.appendChild(card);
  });
}

export function renderDrawerTrinkets() {
  const shelf = document.getElementById('trinket-shelf-list');
  if (!shelf) return;
  shelf.innerHTML = '';

  if (userTrinkets.length === 0) {
    shelf.innerHTML = '<div class="drawer-empty-text">No trinkets collected yet. Scans or layout recommendations will collect them!</div>';
    return;
  }

  userTrinkets.forEach((trinket) => {
    const match = trinket.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji_Presentation}|\p{Emoji})\s*(.+)$/u);
    const emoji = match ? match[1] : '🎁';
    const label = match ? match[2] : trinket;

    const item = document.createElement('div');
    item.className = 'trinket-item';
    item.title = trinket;

    const badge = document.createElement('div');
    badge.className = 'trinket-badge';
    badge.textContent = emoji;

    const lbl = document.createElement('div');
    lbl.className = 'trinket-label';
    lbl.textContent = label;

    const delBtn = document.createElement('button');
    delBtn.className = 'trinket-delete-btn';
    delBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
    delBtn.title = 'Remove trinket';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteTrinket(currentUid, trinket);
      userTrinkets = userTrinkets.filter(t => t !== trinket);
      renderDrawerTrinkets();
    });

    const searchBtn = document.createElement('button');
    searchBtn.className = 'trinket-search-btn';
    searchBtn.innerHTML = '<span class="material-symbols-outlined">search</span>';
    searchBtn.title = 'Search in chat';
    searchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMemoryDrawer();
      const textarea = document.getElementById('input-message');
      if (textarea) {
        textarea.value = `Can you search for the "${label}" trinket you recommended? Give me a description, price estimate in British Pounds, Google Images link, and explain how it can fit in my room.`;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
        const user = auth.currentUser;
        if (user) {
          handleSend(user);
        }
      }
    });

    item.appendChild(badge);
    item.appendChild(lbl);
    item.appendChild(delBtn);
    item.appendChild(searchBtn);
    shelf.appendChild(item);
  });
}
