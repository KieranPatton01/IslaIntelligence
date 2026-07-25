/**
 * ui.js — DOM helpers for the chat interface
 * Pure functions that manipulate the #messages-container.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import { speakMessage, stopSpeech } from './tts.js';
import { openDiagramModal } from './diagramViewer.js';

// Add DOMPurify hook to preserve raw inline style attributes (preventing CSS sanitization from stripping top/left/width/height)
DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
  if (data.attrName === 'style') {
    data.forceKeepAttr = true;
  }
});

// Current tone value — updated externally via setCurrentTone()
let currentToneValue = 50;
export function setCurrentTone(v) { currentToneValue = Number(v); }
export function getCurrentToneValue() { return currentToneValue; }

// Reaction map: key → { emoji, label, animation CSS class }
const REACTION_MAP = {
  'eye-roll': { emoji: '🙄', label: 'eye roll', anim: 'reaction-spin' },
  'table-flip': { emoji: '🤬', label: 'table flip', anim: 'reaction-shake' },
  'facepalm': { emoji: '🤦', label: 'facepalm', anim: 'reaction-drop' },
  'sarcastic-clap': { emoji: '👏', label: 'sarcastic clap', anim: 'reaction-clap' },
  'gasp': { emoji: '😱', label: 'gasp', anim: 'reaction-bounce' },
  'popcorn': { emoji: '🍿', label: 'popcorn', anim: 'reaction-bounce' },
  'shrug': { emoji: '🤷', label: 'shrug', anim: 'reaction-shake' },
  'bored': { emoji: '😑', label: 'bored', anim: 'reaction-drop' },
  'dramatic-cry': { emoji: '😭', label: 'crying', anim: 'reaction-bounce' },
  'mind-blown': { emoji: '🤯', label: 'mind blown', anim: 'reaction-spin' },
};

/** Helper to parse markdown safely, preprocess to fix missing code block newlines */
function parseMarkdown(text) {
  if (!text) return '';
  let cleaned = text;
  // Ensure there is a newline before starting a code block (e.g. text```mermaid -> text\n```mermaid)
  cleaned = cleaned.replace(/([^\n])(```[a-zA-Z]*)/g, '$1\n$2');

  // Replace [[GIF: key]] tags with self-contained animated emoji reaction cards
  cleaned = cleaned.replace(/\[\[GIF:\s*(.+?)\]\]/gi, (match, key) => {
    const reaction = REACTION_MAP[key.trim().toLowerCase()];
    if (reaction) {
      return `\n\n<span class="reaction-card ${reaction.anim}" title="${reaction.label}" aria-label="${reaction.label} reaction">${reaction.emoji}</span>\n\n`;
    }
    return '';
  });

  // Auto-close any unclosed ```deskmap or ```geomap block so marked.js always produces a code element
  const deskmapOpen = cleaned.lastIndexOf('```deskmap');
  if (deskmapOpen !== -1) {
    const afterOpen = cleaned.indexOf('```', deskmapOpen + 10);
    if (afterOpen === -1) cleaned = cleaned + '\n```'; // close the block
  }
  const geomapOpen = cleaned.lastIndexOf('```geomap');
  if (geomapOpen !== -1) {
    const afterOpen = cleaned.indexOf('```', geomapOpen + 8);
    if (afterOpen === -1) cleaned = cleaned + '\n```'; // close the block
  }
  return marked.parse(cleaned);
}

/**
 * Finds all ```deskmap JSON blocks rendered as <code class="language-deskmap">
 * and replaces them with a fully JavaScript-rendered visual blueprint.
 */
export function renderDeskMaps(containerEl) {
  const blocks = containerEl.querySelectorAll('code.language-deskmap');
  blocks.forEach(codeEl => {
    const pre = codeEl.parentElement;
    if (!pre) return;
    let data;
    const raw = codeEl.textContent.trim();
    try {
      data = JSON.parse(raw);
    } catch (e) {
      // Try partial rescue: extract all complete item objects from a truncated JSON stream
      const itemMatches = [...raw.matchAll(/\{[^{}]*"label"[^{}]*"top"[^{}]*\}/g)];
      if (itemMatches.length === 0) { // suppressed
        return;
      }
      const items = itemMatches.map(m => { try { return JSON.parse(m[0]); } catch { return null; } }).filter(Boolean);
      const titleMatch = raw.match(/"title"\s*:\s*"([^"]+)"/);
      data = { title: titleMatch ? titleMatch[1] : 'Desk Layout', items };
    }
    const items = Array.isArray(data.items) ? data.items : [];
    const title = data.title || 'Desk Layout';

    // Build the wrapper with all styles applied via JS (no CSS dependency)
    const wrapper = document.createElement('div');
    wrapper.style.cssText = [
      'position:relative',
      'width:100%',
      'height:260px',
      'background-color:#fdfaf7',
      'background-image:radial-gradient(rgba(172,36,113,0.08) 1.5px,transparent 0)',
      'background-size:14px 14px',
      'border:1px solid rgba(172,36,113,0.2)',
      'border-radius:16px',
      'overflow:hidden',
      'box-shadow:inset 0 2px 6px rgba(0,0,0,0.04)',
      'margin:12px 0',
      'display:block',
    ].join(';');

    // Title label
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'position:absolute;top:6px;left:12px;font-size:11px;font-weight:600;opacity:0.45;letter-spacing:0.05em;text-transform:uppercase;pointer-events:none;';
    titleEl.textContent = title;
    wrapper.appendChild(titleEl);

    // Draw each item
    items.forEach(item => {
      const box = document.createElement('div');
      box.style.cssText = [
        `position:absolute`,
        `top:${item.top}%`,
        `left:${item.left}%`,
        `width:${item.width}%`,
        `height:${item.height}%`,
        `background:${item.color || '#6b7280'}`,
        `border-radius:8px`,
        `border:1.5px solid rgba(255,255,255,0.25)`,
        `box-shadow:0 2px 8px rgba(0,0,0,0.18)`,
        `display:flex`,
        `flex-direction:column`,
        `align-items:center`,
        `justify-content:center`,
        `color:#fff`,
        `font-size:11px`,
        `font-weight:600`,
        `gap:3px`,
        `padding:4px`,
        `text-align:center`,
        `overflow:hidden`,
        `cursor:default`,
        `transition:transform 0.15s,box-shadow 0.15s`,
      ].join(';');
      box.addEventListener('mouseenter', () => { box.style.transform = 'scale(1.04)'; box.style.boxShadow = '0 4px 14px rgba(0,0,0,0.28)'; });
      box.addEventListener('mouseleave', () => { box.style.transform = ''; box.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)'; });
      if (item.emoji) {
        const em = document.createElement('span');
        em.style.fontSize = '18px';
        em.textContent = item.emoji;
        box.appendChild(em);
      }
      const lbl = document.createElement('span');
      lbl.textContent = item.label || '';
      box.appendChild(lbl);
      wrapper.appendChild(box);
    });

    pre.replaceWith(wrapper);

    // Expand parent bubble to fill available whitespace
    const bubble = wrapper.closest('.bubble');
    if (bubble) {
      bubble.style.width = '100%';
      bubble.style.maxWidth = '100%';
    }
  });
}

/**
 * Finds all ```geomap JSON blocks rendered as <code class="language-geomap">
 * and replaces them with an interactive Leaflet + OpenStreetMap map.
 * Supports single locations or arrays of multiple markers.
 */
export function renderGeoMaps(containerEl) {
  const blocks = containerEl.querySelectorAll('code.language-geomap');
  blocks.forEach(codeEl => {
    const pre = codeEl.parentElement;
    if (!pre) return;
    let data;
    const raw = codeEl.textContent.trim();
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return;
    }

    const markersData = Array.isArray(data.markers) ? data.markers : [];

    // Determine map center coordinates
    let centerLat = Number(data.centerLat || data.lat);
    let centerLng = Number(data.centerLng || data.lng);
    const zoom = Number(data.zoom || 13);
    const singleLabel = data.label || 'Location';

    if (isNaN(centerLat) && markersData.length > 0) {
      centerLat = Number(markersData[0].lat);
      centerLng = Number(markersData[0].lng);
    }

    if (isNaN(centerLat) || isNaN(centerLng)) return;

    // Create the map container element
    const mapId = 'geomap-' + Math.random().toString(36).substring(2, 11);
    const mapContainer = document.createElement('div');
    mapContainer.id = mapId;
    mapContainer.style.cssText = [
      'width:100%',
      'height:380px',
      'border:1px solid rgba(172,36,113,0.2)',
      'border-radius:16px',
      'box-shadow:0 2px 12px rgba(172,36,113,0.1)',
      'margin:12px 0',
      'display:block',
      'position:relative',
      'z-index:1'
    ].join(';');

    pre.replaceWith(mapContainer);

    // Expand parent bubble to fill available whitespace
    const bubble = mapContainer.closest('.bubble');
    if (bubble) {
      bubble.style.width = '100%';
      bubble.style.maxWidth = '100%';
    }

    // Initialize Leaflet map
    try {
      if (typeof L === 'undefined') {
        mapContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: red;">Leaflet library failed to load.</div>`;
        return;
      }

      const map = L.map(mapContainer, {
        center: [centerLat, centerLng],
        zoom: zoom,
        zoomControl: true,
        attributionControl: false,
        tap: false
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
      const markerObjects = [];

      // Helper to generate styled popup HTML
      const createPopupHtml = (lbl, lt, ln, url) => `
        <div style="font-family:'Outfit', sans-serif; font-size:13px; color:#564149; line-height:1.4;">
          <div style="font-weight:600; margin-bottom:4px; color:#ac2471;">${lbl}</div>
          <div style="margin-bottom:8px; opacity:0.8; font-size:11px;">${lt.toFixed(5)}, ${ln.toFixed(5)}</div>
          <a href="${url}" target="_blank" rel="noopener noreferrer" style="
            display:inline-block;
            background: linear-gradient(135deg, #ac2471, #7212ff);
            color:#fff;
            text-decoration:none;
            padding:5px 10px;
            font-size:11px;
            font-weight:600;
            border-radius:6px;
            box-shadow: 0 2px 6px rgba(172,36,113,0.3);
          ">Open in Maps App</a>
        </div>
      `;

      if (markersData.length > 0) {
        // Render multiple markers
        markersData.forEach(m => {
          const mLat = Number(m.lat);
          const mLng = Number(m.lng);
          const mLabel = m.label || 'Location';
          if (isNaN(mLat) || isNaN(mLng)) return;

          const mapsUrl = isApple
            ? `https://maps.apple.com/?q=${encodeURIComponent(mLabel)}&ll=${mLat},${mLng}`
            : `https://www.google.com/maps/search/?api=1&query=${mLat},${mLng}`;

          const marker = L.marker([mLat, mLng]).addTo(map);
          marker.bindPopup(createPopupHtml(mLabel, mLat, mLng, mapsUrl));
          markerObjects.push(marker);
        });

        // Automatically fit view bounds if there's more than one marker
        if (markerObjects.length > 1) {
          const group = new L.featureGroup(markerObjects);
          map.fitBounds(group.getBounds().pad(0.15));
        }
      } else {
        // Fallback to single marker
        const mapsUrl = isApple
          ? `https://maps.apple.com/?q=${encodeURIComponent(singleLabel)}&ll=${centerLat},${centerLng}`
          : `https://www.google.com/maps/search/?api=1&query=${centerLat},${centerLng}`;

        const marker = L.marker([centerLat, centerLng]).addTo(map);
        marker.bindPopup(createPopupHtml(singleLabel, centerLat, centerLng, mapsUrl)).openPopup();
      }

      setTimeout(() => {
        map.invalidateSize();
      }, 200);

    } catch (err) {

      mapContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: red;">Failed to load map.</div>`;
    }
  });
}

// Initialize Mermaid with a custom theme matching the app's styling
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: 'rgba(172, 36, 113, 0.1)',
    primaryTextColor: '#333',
    primaryBorderColor: '#ac2471',
    lineColor: '#ac2471',
    secondaryColor: 'rgba(114, 18, 255, 0.1)',
    tertiaryColor: '#fff',
    fontFamily: 'inherit',
    // XYChart colors matching the brand gradient (raspberry -> purple)
    barColor1: '#ac2471',
    barColor2: '#7212ff',
    lineColor1: '#ac2471',
    lineColor2: '#7212ff',
    xychartAxisColor: '#ac2471',
    xychartLabelColor: '#555',
    xychartTitleColor: '#ac2471'
  }
});

// Enable GitHub Flavored Markdown (tables, strikethrough, etc.)
marked.setOptions({ gfm: true, breaks: true });

const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'img',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
    'hr', 'span', 'div', 'details', 'summary',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel', 'colspan', 'rowspan', 'scope', 'style', 'open'],
};

/** Sanitise with table support */
function sanitise(html) {
  return DOMPurify.sanitize(html, DOMPURIFY_CONFIG);
}

const CONTAINER_ID = 'messages-container';

/** @returns {HTMLElement} */
function getContainer() {
  return document.getElementById(CONTAINER_ID);
}

let spacerSetupDone = false;

/**
 * Sets up a ResizeObserver on the footer to dynamically adjust 
 * the messages container padding-bottom, avoiding fixed spacers.
 */
export function setupDynamicSpacer() {
  if (spacerSetupDone) return;
  const footer = document.getElementById('chat-footer');
  const container = getContainer();
  if (!footer || !container) return;

  spacerSetupDone = true;

  const observer = new ResizeObserver((entries) => {
    for (let entry of entries) {
      // Add 20px extra breathing room above the footer
      const height = entry.contentRect.height;
      container.style.paddingBottom = `${height + 20}px`;
    }
  });

  observer.observe(footer);
}

/** Scroll the messages container to the bottom */
export function scrollToBottom() {
  const c = getContainer();
  if (!c) return;
  c.scrollTop = c.scrollHeight;
}

/** Scroll a specific message wrapper's TOP into view, dynamically aligned below the sticky header */
export function scrollToMessageTop(wrapperEl) {
  const c = getContainer();
  if (!c || !wrapperEl) return;
  const wrapper = wrapperEl.closest('.msg-wrapper') || wrapperEl;

  const header = document.querySelector('header');
  if (!header) return;

  // Use exact live viewport bounding rectangles — ZERO hardcoded height numbers
  const headerRect = header.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();

  // Calculate exact scroll delta to position wrapper 10px below the header's live bottom edge
  const targetScrollTop = c.scrollTop + (wrapperRect.top - headerRect.bottom) - 10;

  // Dynamically add padding to container if needed so browser can scroll wrapper into position
  const currentMaxScroll = c.scrollHeight - c.clientHeight;
  if (targetScrollTop > currentMaxScroll) {
    const extraNeeded = Math.ceil(targetScrollTop - currentMaxScroll) + 160;
    c.style.paddingBottom = `${extraNeeded}px`;
  }

  c.scrollTo({
    top: Math.max(0, targetScrollTop),
    behavior: 'smooth'
  });
}

/** Helper: Add long-press to copy text */
function addLongPressCopy(bubbleEl) {
  let pressTimer;
  const triggerCopy = async () => {
    try {
      // .innerText gets the rendered text, ignoring HTML tags
      const text = bubbleEl.innerText;
      if (!text.trim()) return;
      await navigator.clipboard.writeText(text);

      // Visual feedback: brief flash
      const originalBg = bubbleEl.style.backgroundColor;
      bubbleEl.style.transition = 'background-color 0.2s ease';
      bubbleEl.style.backgroundColor = 'rgba(76, 175, 80, 0.4)'; // green flash

      setTimeout(() => {
        bubbleEl.style.backgroundColor = originalBg;
        setTimeout(() => { bubbleEl.style.transition = ''; }, 200);
      }, 300);
    } catch (err) {

    }
  };

  const startPress = (e) => {
    if (e.type === 'mousedown' && e.button !== 0) return;
    pressTimer = setTimeout(triggerCopy, 600);
  };
  const cancelPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
  };

  bubbleEl.addEventListener('mousedown', startPress);
  bubbleEl.addEventListener('touchstart', startPress, { passive: true });
  bubbleEl.addEventListener('mouseup', cancelPress);
  bubbleEl.addEventListener('mouseleave', cancelPress);
  bubbleEl.addEventListener('touchend', cancelPress);
  bubbleEl.addEventListener('touchcancel', cancelPress);
  bubbleEl.addEventListener('touchmove', cancelPress, { passive: true });
}

/** Helper: setup inline text editing for chat bubbles */
function setupEditBubbleHandler(bubble, div, initialText, role) {
  let currentText = initialText;

  const editBtn = document.createElement('button');
  editBtn.className = 'edit-btn';
  editBtn.title = 'Edit text';
  editBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">edit</span>';

  // Make space for absolute positioned edit button
  bubble.style.paddingBottom = '28px';

  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (bubble.classList.contains('editing-mode')) return;

    bubble.classList.add('editing-mode');
    editBtn.style.display = 'none';
    div.style.display = 'none';

    const textarea = document.createElement('textarea');
    textarea.className = 'edit-textarea';
    textarea.value = currentText;
    bubble.appendChild(textarea);

    textarea.focus();
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 250) + 'px';

    const actions = document.createElement('div');
    actions.className = 'edit-actions';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn-cancel-edit';
    btnCancel.textContent = 'Cancel';
    btnCancel.type = 'button';

    const btnSave = document.createElement('button');
    btnSave.className = 'btn-reprompt-edit';
    btnSave.textContent = 'Reprompt';
    btnSave.type = 'button';

    actions.appendChild(btnCancel);
    actions.appendChild(btnSave);
    bubble.appendChild(actions);

    const resizeTextarea = () => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 250) + 'px';
    };
    textarea.addEventListener('input', resizeTextarea);

    btnCancel.addEventListener('click', (ev) => {
      ev.stopPropagation();
      cleanup();
    });

    btnSave.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const newText = textarea.value;
      if (newText.trim() && newText.trim() !== currentText) {
        currentText = newText.trim();
        div.innerHTML = sanitise(parseMarkdown(currentText));

        if (role === 'model') {
          renderMermaidDiagrams(div);
          renderDeskMaps(div);
        }

        const msgWrapper = bubble.closest('.msg-wrapper');
        const messageId = msgWrapper?.dataset.messageId ?? null;
        // Always dispatch — the chat handler will skip Firestore ops if messageId is null
        bubble.dispatchEvent(new CustomEvent('message-reprompt', {
          bubbles: true,
          detail: { messageId, text: currentText }
        }));
      }
      cleanup();
    });

    function cleanup() {
      textarea.removeEventListener('input', resizeTextarea);
      textarea.remove();
      actions.remove();
      div.style.display = 'block';
      editBtn.style.display = 'flex';
      bubble.classList.remove('editing-mode');
    }
  });

  bubble.appendChild(editBtn);
}

/**
 * Insert a message bubble into the chat.
 *
 * @param {Object} opts
 * @param {'user'|'model'} opts.role
 * @param {string|null}    [opts.text]      - Text content
 * @param {string|null}    [opts.imageUrl]  - URL of an uploaded image
 * @param {File|null}      [opts.file]      - Original File object (for non-image display)
 * @param {string}         [opts.id]        - Optional Firestore doc ID for data attribute
 * @param {boolean}        [opts.sending]   - If true, applies dimmed "sending" state
 * @param {number}         [opts.toneValue] - Tone slider value (0-100)
 * @param {number}         [opts.createdAt] - Timestamp in ms
 * @param {string}         [opts.aiModel]   - The AI model used
 */
export function appendMessage({ role, text, imageUrl, file, mediaList, id, toneValue, createdAt, aiModel, thought, sending = false }) {
  const container = getContainer();

  // Wrapper — controls alignment
  const wrapper = document.createElement('div');
  wrapper.className = `msg-wrapper ${role}`;
  if (id) wrapper.dataset.messageId = id;

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = `bubble ${role === 'user' ? 'user-bubble' : 'model-bubble'}`;
  if (sending) bubble.classList.add('sending');
  addLongPressCopy(bubble);

  // Normalize single image/file options or arrays to a unified mediaList
  let normalizedMediaList = [];
  if (Array.isArray(mediaList)) {
    normalizedMediaList = mediaList;
  } else if (imageUrl || file) {
    normalizedMediaList = [{
      url: imageUrl || null,
      file: file || null,
      name: file ? file.name : (imageUrl ? imageUrl.split('/').pop() : 'attachment'),
      mimeType: file ? file.type : (imageUrl ? (imageUrl.match(/\.(webm|mp4|mp3|ogg|wav|m4a)/i) ? 'audio/mpeg' : 'image/jpeg') : 'image/jpeg')
    }];
  }

  if (normalizedMediaList.length > 0) {
    const mediaContainer = document.createElement('div');
    mediaContainer.className = 'flex flex-row flex-wrap gap-2 mb-2';

    normalizedMediaList.forEach(item => {
      const isAudio = item.file
        ? item.file.type.startsWith('audio/')
        : (item.mimeType?.startsWith('audio/') || item.url?.match(/\.(webm|mp4|mp3|ogg|wav|m4a)/i)) ? true : false;

      const isImage = !isAudio && (item.file
        ? item.file.type.startsWith('image/')
        : (item.mimeType?.startsWith('image/') || item.url) ? true : false);

      if (isAudio) {
        const audioWrapper = document.createElement('div');
        audioWrapper.className = 'mb-1 shrink-0';
        const audioEl = document.createElement('audio');
        audioEl.controls = true;
        audioEl.src = item.url || (item.file ? URL.createObjectURL(item.file) : '');
        audioEl.className = 'w-48 h-10';
        audioEl.style.borderRadius = '9999px';
        audioEl.style.outline = 'none';
        audioWrapper.appendChild(audioEl);
        mediaContainer.appendChild(audioWrapper);
      } else if (isImage) {
        const img = document.createElement('img');
        img.src = item.url || (item.file ? URL.createObjectURL(item.file) : '');
        img.alt = role === 'user' ? 'Your uploaded image' : 'Image';
        img.className = 'message-image shrink-0';
        img.loading = 'lazy';
        mediaContainer.appendChild(img);
      } else {
        // File pill
        const pill = document.createElement('div');
        pill.className = 'file-pill shrink-0';
        pill.title = 'Click to open file';
        pill.style.cursor = 'pointer';

        const name = item.name || 'file';
        const ext = name.split('.').pop().toUpperCase();
        const sizeStr = item.file ? `${(item.file.size / 1024).toFixed(1)} KB` : '';
        const metaStr = ext + (sizeStr ? ` &bull; ${sizeStr}` : '');

        pill.innerHTML = `
          <span class="file-pill-icon material-symbols-outlined">description</span>
          <div class="file-pill-info">
            <span class="file-pill-name">${name}</span>
            <span class="file-pill-meta">${metaStr}</span>
          </div>
          <span class="file-pill-icon material-symbols-outlined" style="font-size:16px;opacity:0.6;margin-left:4px;">open_in_new</span>`;

        pill.addEventListener('click', () => {
          if (item.file) {
            const objectUrl = URL.createObjectURL(item.file);
            window.open(objectUrl, '_blank');
          } else if (item.url) {
            window.open(item.url, '_blank');
          }
        });
        mediaContainer.appendChild(pill);
      }
    });

    bubble.appendChild(mediaContainer);
  }

  // Text content
  if (text) {
    const div = document.createElement('div');
    div.className = 'markdown-content';

    let thoughtHtml = '';
    if (thought) {
      thoughtHtml = `
        <details class="thinking-details">
          <summary class="thinking-summary">
            <span class="material-symbols-outlined">psychology</span>
            <span class="summary-text">Thought Process</span>
          </summary>
          <div class="thinking-content">${sanitise(thought)}</div>
        </details>
      `;
    }

    div.innerHTML = thoughtHtml + `<div class="output-content">${sanitise(parseMarkdown(text))}</div>`;
    bubble.appendChild(div);
    if (role === 'model') {
      renderMermaidDiagrams(div);
      renderDeskMaps(div);
      renderGeoMaps(div);
    }
    if (role === 'user') {
      setupEditBubbleHandler(bubble, div, text, role);
    }
  }

  // TTS Speaker button (AI messages only)
  if (role === 'model' && text) {
    const ttsBtn = document.createElement('button');
    ttsBtn.className = 'tts-btn';
    ttsBtn.title = 'Read aloud';
    ttsBtn.innerHTML = '<span class="material-symbols-outlined">volume_up</span>';
    ttsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      speakMessage(text, currentToneValue, ttsBtn);
    });
    bubble.appendChild(ttsBtn);
  }

  // Debug Info Bubble (AI messages only)
  if (role === 'model' && toneValue !== undefined && createdAt) {
    bubble.style.paddingBottom = '28px'; // make room for the "i" button inside the bubble
    addDebugInfoToBubble(bubble, { toneValue, createdAt, aiModel });
  }

  wrapper.appendChild(bubble);

  container.appendChild(wrapper);

  if (role === 'user') {
    setTimeout(() => scrollToMessageTop(wrapper), 40);
  }
  return bubble;
}

/**
 * Append a typing indicator to the container.
 * Removes any existing indicator first.
 */
export function showTypingIndicator() {
  hideTypingIndicator();
  const container = getContainer();

  const wrapper = document.createElement('div');
  wrapper.id = 'typing-indicator';
  wrapper.className = 'msg-wrapper model';

  wrapper.innerHTML = `
    <div class="thinking-bubble">
      <div class="thinking-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot" style="animation-delay: 0.15s"></div>
        <div class="typing-dot" style="animation-delay: 0.3s"></div>
      </div>
      <span class="thinking-label">Isla Intelligence is thinking</span>
    </div>
  `;

  container.appendChild(wrapper);
}

/** Remove the typing indicator from the DOM. */
export function hideTypingIndicator() {
  document.getElementById('typing-indicator')?.remove();
}

/**
 * Create an empty streaming AI bubble and return the <p> element
 * that text chunks should be appended to.
 *
 * @returns {{ bubble: HTMLElement, textEl: HTMLElement }}
 */
export function createStreamingBubble() {
  const container = getContainer();

  const wrapper = document.createElement('div');
  wrapper.className = 'msg-wrapper model streaming-active';

  const bubble = document.createElement('div');
  bubble.className = 'bubble model-bubble generating';
  bubble.style.position = 'relative';
  addLongPressCopy(bubble);

  const textEl = document.createElement('div');
  textEl.className = 'markdown-content';
  textEl.innerHTML = '';

  // TTS button — wired up on stream complete in updateStreamingBubble
  const ttsBtn = document.createElement('button');
  ttsBtn.className = 'tts-btn tts-btn-hidden';
  ttsBtn.title = 'Read aloud';
  ttsBtn.innerHTML = '<span class="material-symbols-outlined">volume_up</span>';

  bubble.appendChild(textEl);
  bubble.appendChild(ttsBtn);
  wrapper.appendChild(bubble);

  container.appendChild(wrapper);
  return { bubble, textEl };
}

/**
 * Mark a bubble as confirmed (remove the "sending" dim state).
 * @param {HTMLElement} bubbleEl
 */
export function confirmBubble(bubbleEl) {
  bubbleEl?.classList.remove('sending');
}

/**
 * Returns true if the text ends with a table block that isn't complete yet.
 * A valid GFM table needs at least: header row, separator row, one data row.
 */
function hasIncompleteTable(text) {
  const lines = text.trimEnd().split('\n');
  // Walk backwards to find the start of a potential table block
  let tableLines = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('|')) {
      tableLines.unshift(lines[i]);
    } else if (tableLines.length > 0) {
      break; // non-table line after collecting some table lines — stop
    } else {
      break; // trailing non-table line, no table in progress
    }
  }
  if (tableLines.length === 0) return false;
  // A complete table needs header + separator (containing ---) + at least 1 data row
  const hasSeparator = tableLines.some(l => /^\|[\s|:-]*-+[\s|:-]*\|/.test(l.trim()));
  return !hasSeparator || tableLines.length < 3;
}

/**
 * Returns true if the text ends with an incomplete mermaid block.
 */
function hasIncompleteMermaid(text) {
  const parts = text.split('```mermaid');
  if (parts.length < 2) return false;
  const lastBlock = parts[parts.length - 1];
  return !lastBlock.includes('```');
}

function hasIncompleteDeskmap(text) {
  const parts = text.split('```deskmap');
  if (parts.length < 2) return false;
  const lastBlock = parts[parts.length - 1];
  return !lastBlock.includes('```');
}

/**
 * Renders all mermaid diagrams inside a given container.
 * Finds code blocks with class 'language-mermaid' and replaces them with SVGs.
 * @param {HTMLElement} containerEl 
 */
export async function renderMermaidDiagrams(containerEl) {
  if (!containerEl) return;
  const blocks = containerEl.querySelectorAll('code.language-mermaid');
  for (let i = 0; i < blocks.length; i++) {
    const codeEl = blocks[i];
    const preEl = codeEl.parentElement;
    if (preEl && preEl.tagName === 'PRE') {
      let graphText = codeEl.textContent;

      // Clean trailing markdown syntax leaks (like closing backticks or post-block text)
      if (graphText.includes('```')) {
        graphText = graphText.split('```')[0];
      }
      graphText = graphText.trim();

      // Auto-repair missing node IDs in flowcharts (e.g. graph TD "Label" -> graph TD A["Label"])
      graphText = graphText.replace(/^(graph\s+(?:TD|LR|TB|BT|RL))\s+(".*?"|\[.*?\])/gm, (match, dir, label) => {
        return `${dir}\n  A${label}`;
      });

      // Auto-repair missing newlines between flowchart connections (e.g. D["Label"]A --> E)
      graphText = graphText.replace(/(\]|\)|\})([^\n]*?)([a-zA-Z0-9_-]+)([^\n]*?)(-->|---)/g, (match, g1, g2, g3, g4, g5) => {
        if (g2.includes('\n')) return match;
        return g1 + '\n' + g2.trim() + ' ' + g3 + g4 + g5;
      });

      // Auto-repair missing newlines between standalone node declarations (e.g. B["Label 1"]C["Label 2"])
      graphText = graphText.replace(/(\]|\)|\})([^\n]*?)([a-zA-Z0-9_-]+)([^\n]*?)(\[|\(|\{)/g, (match, g1, g2, g3, g4, g5) => {
        if (g2.includes('\n')) return match;
        return g1 + '\n' + g2.trim() + ' ' + g3 + g4 + g5;
      });

      // Auto-repair missing newlines between sequence diagram messages (e.g. A -> B B -> C)
      graphText = graphText.replace(/(->|-->>|->>)([^\n]*?)([a-zA-Z0-9_-]+)([^\n]+?)(->|-->>|->>)/g, (match, g1, g2, g3, g4, g5) => {
        if (g2.includes('\n')) return match;
        return g1 + '\n' + g2.trim() + ' ' + g3 + g4 + g5;
      });

      const id = 'mermaid-' + Math.random().toString(36).substring(2, 11);
      try {
        const { svg } = await mermaid.render(id, graphText);
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-container';
        wrapper.style.cssText = 'display:block; margin:1em 0; overflow-x:auto; background:rgba(255,255,255,0.6); padding:15px; border-radius:12px; box-shadow:0 2px 12px rgba(172,36,113,0.1); cursor:zoom-in;';
        wrapper.innerHTML = svg;

        const svgEl = wrapper.querySelector('svg');
        if (svgEl) {
          const naturalWidth = svgEl.style.maxWidth || '100%';
          svgEl.style.setProperty('width', naturalWidth, 'important');
          svgEl.style.setProperty('max-width', 'none', 'important');
          svgEl.style.setProperty('height', 'auto', 'important');
          svgEl.style.setProperty('display', 'block', 'important');
          svgEl.style.setProperty('margin', '0 auto', 'important');

          // Wire up click event to open the fullscreen diagram viewer
          wrapper.addEventListener('click', () => {
            openDiagramModal(svgEl);
          });
        }

        preEl.replaceWith(wrapper);

        // Expand parent bubble to fill available whitespace
        const bubble = wrapper.closest('.bubble');
        if (bubble) {
          bubble.style.width = '100%';
          bubble.style.maxWidth = '100%';
        }
      } catch (err) {

        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'color:#93000a; background:rgba(255,218,214,0.7); padding:10px; border-radius:8px; font-size:0.8em; margin:1em 0; border:1px solid #93000a;';
        errDiv.textContent = 'Diagram error: ' + (err.message ? err.message.split('\\n')[0] : 'Invalid syntax');
        preEl.replaceWith(errDiv);
      }
    }
  }
}

/**
 * Displays a dynamic single-line thought pill while the AI is thinking.
 * @param {HTMLElement} textEl
 * @param {string} thoughtText
 */
export function updateThinkingThought(textEl, thoughtText) {
  if (!textEl || !thoughtText) return;
  let thoughtBox = textEl.querySelector('.thought-container');
  if (!thoughtBox) {
    thoughtBox = document.createElement('div');
    thoughtBox.className = 'thought-container flex items-center gap-2 py-1 px-2.5 rounded-lg mb-2 text-xs text-on-surface-variant/80 bg-black/5 dark:bg-white/5 border border-outline-variant/20 animate-pulse';
    thoughtBox.innerHTML = `
      <span class="material-symbols-outlined text-sm text-primary">psychology</span>
      <span class="thought-text truncate font-mono text-[11px]">Thinking...</span>
    `;
    textEl.prepend(thoughtBox);
  }
  const label = thoughtBox.querySelector('.thought-text');
  if (label) {
    const cleanThought = thoughtText.replace(/[\n\r]+/g, ' ').trim();
    const snippet = cleanThought.length > 50 ? cleanThought.slice(-50) : cleanThought;
    label.textContent = snippet ? `Thinking: ${snippet}` : 'Thinking...';
  }
}

/**
 * Updates a streaming message bubble in place as text arrives from the AI.
 * Holds back incomplete tables mid-stream so they don't render as raw pipes.
 * @param {HTMLElement} textEl
 * @param {string} fullText
 * @param {boolean} isComplete
 */
export function updateStreamingBubble(textEl, fullText, isComplete = false) {
  if (!textEl) return;

  // Remove thought container the moment real response text begins
  const thoughtBox = textEl.querySelector('.thought-container');
  if (thoughtBox && fullText.trim()) {
    thoughtBox.remove();
  }

  // Manage text output independently
  let outputWrapper = textEl.querySelector('.output-content');
  if (!outputWrapper) {
    outputWrapper = document.createElement('div');
    outputWrapper.className = 'output-content';
    textEl.appendChild(outputWrapper);
  }

  let outputHtml = '';
  if (!isComplete && hasIncompleteDeskmap(fullText)) {
    const parts = fullText.split('```deskmap');
    const completePart = parts.slice(0, -1).join('```deskmap');
    const placeholder = `<span style="opacity:0.45;font-size:0.8em;font-style:italic;">🗺️ drawing desk map…</span>`;
    outputHtml = sanitise(parseMarkdown(completePart)) + placeholder;
  } else if (!isComplete && hasIncompleteMermaid(fullText)) {
    const parts = fullText.split('```mermaid');
    const completePart = parts.slice(0, -1).join('```mermaid');
    const placeholder = `<span style="opacity:0.45;font-size:0.8em;font-style:italic;">⬛ drawing diagram…</span>`;
    outputHtml = sanitise(parseMarkdown(completePart)) + placeholder;
  } else if (!isComplete && hasIncompleteTable(fullText)) {
    // Split off the complete portion and the pending table lines
    const lines = fullText.trimEnd().split('\n');
    let splitIndex = lines.length - 1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim().startsWith('|')) {
        splitIndex = i;
      } else if (i < lines.length - 1 && !lines[i].trim().startsWith('|')) {
        break;
      } else {
        break;
      }
    }
    const completePart = lines.slice(0, splitIndex).join('\n');
    const pendingLines = lines.slice(splitIndex).length;
    const placeholder = `<span style="opacity:0.45;font-size:0.8em;font-style:italic;">⬛ table (${pendingLines} rows so far)…</span>`;
    outputHtml = sanitise(parseMarkdown(completePart)) + placeholder;
  } else {
    outputHtml = sanitise(parseMarkdown(fullText));
  }

  outputWrapper.innerHTML = outputHtml;

  if (isComplete) {
    const c = getContainer();
    if (c) c.style.paddingBottom = '';
    const wrapper = textEl.closest('.msg-wrapper');
    if (wrapper) {
      wrapper.classList.remove('streaming-active');
    }
    // Render special blocks only once stream is complete — avoids re-running on every chunk
    renderDeskMaps(textEl);
    renderMermaidDiagrams(textEl);
    renderGeoMaps(textEl);
    // Wire up TTS button now that we have final text
    const bubble = textEl.closest('.bubble');
    if (bubble) {
      bubble.classList.remove('generating');
      const ttsBtn = bubble.querySelector('.tts-btn');
      if (ttsBtn) {
        ttsBtn.classList.remove('tts-btn-hidden');
        ttsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          speakMessage(fullText, currentToneValue, ttsBtn);
        });
      }
    }
  }
}

/**
 * Turn a bubble into an error state.
 * @param {HTMLElement} bubbleEl
 * @param {string} [message]
 */
export function markBubbleError(bubbleEl, message = '⚠️ Something went wrong. Try again.') {
  if (!bubbleEl) return;
  bubbleEl.style.background = 'rgba(255, 218, 214, 0.7)';
  bubbleEl.style.color = '#93000a';
  const div = bubbleEl.querySelector('.markdown-content');
  if (div) {
    div.innerHTML = sanitise(parseMarkdown(message));
  } else {
    const newDiv = document.createElement('div');
    newDiv.className = 'markdown-content';
    newDiv.innerHTML = sanitise(parseMarkdown(message));
    bubbleEl.appendChild(newDiv);
  }
}

/**
 * Clear all messages from the container, preserving the bottom spacer.
 */
export function clearMessages() {
  stopSpeech();
  const container = getContainer();
  // Remove all children
  [...container.children].forEach(child => child.remove());
}

/**
 * Set the send button into a loading spinner state.
 * @param {boolean} loading
 */
export function setSendLoading(loading) {
  const btn = document.getElementById('btn-send');
  const icon = btn?.querySelector('.material-symbols-outlined');
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.classList.add('loading');
    if (icon) icon.style.display = 'none';
    // Insert spinner if not present
    if (!btn.querySelector('.send-spinner')) {
      const spinner = document.createElement('span');
      spinner.className = 'send-spinner block w-4 h-4 rounded-full border-2 border-white/40 border-t-white';
      spinner.style.animation = 'spin 0.8s linear infinite';
      btn.appendChild(spinner);
    }
  } else {
    btn.classList.remove('loading');
    btn.querySelector('.send-spinner')?.remove();
    if (icon) icon.style.display = '';
  }
}

/**
 * Adds a debug info button to a message bubble.
 */
export function addDebugInfoToBubble(bubble, { toneValue, createdAt, aiModel, latencyMs }) {
  const infoBtn = document.createElement('div');
  infoBtn.className = 'debug-info-btn';
  infoBtn.innerHTML = '<span class="material-symbols-outlined">info</span>';

  // Popup container
  const popup = document.createElement('div');
  popup.className = 'debug-info-popup hidden';

  // Format time
  const timeStr = new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Format tone string
  let toneStr = 'Princess Mode';
  if (toneValue <= 20) toneStr = 'Ragebait Mode';
  else if (toneValue <= 40) toneStr = 'Teasing Mode';
  else if (toneValue <= 60) toneStr = 'Formal AI Mode';
  else if (toneValue <= 80) toneStr = 'Sooky Mode';

  let displayModel = aiModel || 'gemini-3.6-flash';
  if (displayModel === 'gemini-3.1-flash-lite') displayModel = '⚡ Stupid (3.1 Lite)';
  else if (displayModel === 'gemini-3.6-flash') displayModel = '🚀 Silly (3.6 Low)';
  else if (displayModel === 'gemini-3.5-flash') displayModel = '🚀 Silly (3.6 Low)';

  const latencyStr = latencyMs ? `${(latencyMs / 1000).toFixed(2)}s (${latencyMs}ms)` : null;

  popup.innerHTML = `
    <div class="debug-row"><strong>Time:</strong> ${timeStr}</div>
    <div class="debug-row"><strong>Model:</strong> ${DOMPurify.sanitize(displayModel)}</div>
    <div class="debug-row"><strong>Mode:</strong> ${toneStr} (${toneValue}/100)</div>
    ${latencyStr ? `<div class="debug-row"><strong>Response Time:</strong> ${latencyStr}</div>` : ''}
  `;

  infoBtn.appendChild(popup);

  infoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popup.classList.toggle('hidden');
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!infoBtn.contains(e.target)) {
      popup.classList.add('hidden');
    }
  });

  // Make the bubble position relative to contain the absolute info button
  bubble.style.position = 'relative';
  bubble.appendChild(infoBtn);
}

/**
 * Remove all message bubbles in the DOM that come after a specified message.
 * @param {string} messageId 
 */
export function truncateMessagesAfter(messageId) {
  const container = getContainer();
  if (!container) return;
  const wrappers = Array.from(container.querySelectorAll('.msg-wrapper'));
  const idx = wrappers.findIndex(w => w.dataset.messageId === messageId);
  if (idx !== -1) {
    for (let i = idx + 1; i < wrappers.length; i++) {
      wrappers[i].remove();
    }
  }
}

/**
 * Smoothly scroll the container so that the given bubble/element's wrapper aligns with the top.
 * @param {HTMLElement} element
 */
export function scrollElementToTop(element) {
  const container = getContainer();
  if (!container || !element) return;
  const wrapper = element.closest('.msg-wrapper') || element;

  // Calculate top position relative to container viewport boundary
  const containerRect = container.getBoundingClientRect();
  const wrapperRect = wrapper.getBoundingClientRect();
  const targetScrollTop = wrapperRect.top - containerRect.top + container.scrollTop;

  container.scrollTo({
    top: targetScrollTop - 10, // 10px padding breathing room at the top
    behavior: 'smooth'
  });
}
