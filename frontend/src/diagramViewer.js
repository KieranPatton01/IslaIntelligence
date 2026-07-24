/**
 * diagramViewer.js
 * Provides an interactive, fullscreen vector diagram viewer (zoom, pan, pinch)
 * for Mermaid charts in the Isla Intelligence PWA.
 */

let scale = 1;
let panX = 0;
let panY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

// Tracking pointers for pinch-to-zoom
let evHistory = [];
let prevDiff = -1;

let modal = null;
let viewport = null;
let targetSvg = null;

export function initDiagramViewer() {
  modal = document.getElementById('diagram-modal');
  viewport = document.getElementById('diagram-modal-viewport');
  
  if (!modal || !viewport) return;

  const btnClose = document.getElementById('btn-close-diagram-modal');
  const btnZoomIn = document.getElementById('btn-diagram-zoom-in');
  const btnZoomOut = document.getElementById('btn-diagram-zoom-out');
  const btnReset = document.getElementById('btn-diagram-zoom-reset');

  btnClose?.addEventListener('click', closeDiagramModal);
  btnZoomIn?.addEventListener('click', () => zoom(1.2));
  btnZoomOut?.addEventListener('click', () => zoom(0.85));
  btnReset?.addEventListener('click', resetZoom);

  // Close modal on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeDiagramModal();
    }
  });

  // Pan interaction (Desktop & Mobile Pointer events)
  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', onPointerUp);
  viewport.addEventListener('pointercancel', onPointerUp);

  // Wheel zoom (Desktop mouse scroll)
  viewport.addEventListener('wheel', onWheel, { passive: false });
}

export function openDiagramModal(svgElement) {
  if (!modal || !viewport) return;

  // Clear previous SVG
  viewport.innerHTML = '';

  // Clone SVG
  targetSvg = svgElement.cloneNode(true);
  
  // Reset style properties to let transform take full control
  targetSvg.style.setProperty('width', '90%', 'important');
  targetSvg.style.setProperty('height', '90%', 'important');
  targetSvg.style.setProperty('max-width', 'none', 'important');
  targetSvg.style.setProperty('max-height', 'none', 'important');
  targetSvg.style.setProperty('transform-origin', 'center center', 'important');
  targetSvg.style.transition = 'transform 0.12s ease-out'; // smooth transition for button zooms

  viewport.appendChild(targetSvg);

  // Show modal
  modal.classList.remove('hidden');
  resetZoom();
}

function closeDiagramModal() {
  modal?.classList.add('hidden');
  viewport.innerHTML = '';
  targetSvg = null;
  evHistory = [];
  prevDiff = -1;
}

function updateTransform() {
  if (!targetSvg) return;
  targetSvg.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
}

function zoom(factor) {
  scale = Math.max(0.15, Math.min(scale * factor, 10));
  updateTransform();
}

function resetZoom() {
  scale = 1;
  panX = 0;
  panY = 0;
  updateTransform();
}

function onWheel(e) {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
  zoom(zoomFactor);
}

// ── Pointer Pan & Zoom ──────────────────────────────────────
function onPointerDown(e) {
  viewport.setPointerCapture(e.pointerId);
  evHistory.push(e);
  
  if (evHistory.length === 1) {
    isDragging = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    if (targetSvg) targetSvg.style.transition = 'none'; // disable transitions during drag for 0 latency
  }
}

function onPointerMove(e) {
  // Update pointer coordinates in cache
  const idx = evHistory.findIndex(h => h.pointerId === e.pointerId);
  if (idx !== -1) evHistory[idx] = e;

  // Handle Pinch to Zoom
  if (evHistory.length === 2) {
    const curDiff = Math.hypot(
      evHistory[0].clientX - evHistory[1].clientX,
      evHistory[0].clientY - evHistory[1].clientY
    );

    if (prevDiff > 0) {
      if (curDiff > prevDiff) {
        zoom(1.025); // pinch open = zoom in
      } else if (curDiff < prevDiff) {
        zoom(0.975); // pinch close = zoom out
      }
    }
    prevDiff = curDiff;
  }
  // Handle Pan
  else if (isDragging && evHistory.length === 1) {
    panX = e.clientX - startX;
    panY = e.clientY - startY;
    updateTransform();
  }
}

function onPointerUp(e) {
  const idx = evHistory.findIndex(h => h.pointerId === e.pointerId);
  if (idx !== -1) evHistory.splice(idx, 1);

  if (evHistory.length < 2) {
    prevDiff = -1;
  }
  if (evHistory.length === 0) {
    isDragging = false;
    if (targetSvg) targetSvg.style.transition = 'transform 0.12s ease-out';
  }
}
