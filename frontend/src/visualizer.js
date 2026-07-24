/**
 * visualizer.js
 * Siri-style procedural audio waveform animation using Canvas.
 * Simulates speech rhythm and volume changes while TTS is active.
 */

let canvas = null;
let ctx = null;
let animationId = null;
let isVisualizing = false;
let phase = 0;

// Setup overlapping sine waves with distinct frequencies, phases, and brand colors
const waves = [
  { color: 'rgba(114, 18, 255, 0.25)',  freq: 0.02, amp: 16, speed: 0.07 }, // Purple base
  { color: 'rgba(255, 105, 180, 0.28)', freq: 0.035, amp: 12, speed: -0.05 }, // Warm cream/pink accent
  { color: 'rgba(172, 36, 113, 0.65)',  freq: 0.028, amp: 22, speed: 0.11 }  // Deep Raspberry main
];

export function initVisualizer() {
  canvas = document.getElementById('voice-visualizer-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  
  // Resize handler to match viewport changes
  const resize = () => {
    if (!canvas || !canvas.parentElement) return;
    canvas.width = canvas.parentElement.clientWidth * window.devicePixelRatio;
    canvas.height = canvas.parentElement.clientHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  };
  
  window.addEventListener('resize', resize);
  resize();
}

export function startVisualizer() {
  const container = document.getElementById('voice-visualizer-container');
  if (container) {
    container.classList.remove('hidden');
    container.classList.add('flex');
  }
  isVisualizing = true;
  if (!animationId) {
    tick();
  }
}

export function stopVisualizer() {
  isVisualizing = false;
  // Let the waveform collapse smoothly before hiding
  setTimeout(() => {
    if (!isVisualizing) {
      const container = document.getElementById('voice-visualizer-container');
      if (container) {
        container.classList.add('hidden');
        container.classList.remove('flex');
      }
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    }
  }, 250);
}

function tick() {
  if (!canvas || !ctx) return;

  if (!isVisualizing && phase < 0.01) {
    return;
  }
  
  if (isVisualizing) {
    phase += 0.04;
  } else {
    phase += 0.015; // Slow down fade
  }
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const width = canvas.width / window.devicePixelRatio;
  const height = canvas.height / window.devicePixelRatio;
  const centerY = height / 2;
  
  // Draw waves
  waves.forEach(w => {
    ctx.beginPath();
    ctx.strokeStyle = w.color;
    ctx.lineWidth = 2.0;
    ctx.shadowBlur = 6;
    ctx.shadowColor = w.color;
    
    // Vary amplitude over time to simulate vocal cadence
    const timeFactor = isVisualizing 
      ? (Math.sin(phase * 0.45) * 0.4 + 0.6) 
      : 0; // Collapse to zero when visualizer stops
      
    const currentAmp = w.amp * timeFactor;
    
    for (let x = 0; x < width; x++) {
      // Fade out at ends (pinched boundary envelope)
      const limit = 50;
      let envelope = 1;
      if (x < limit) {
        envelope = x / limit;
      } else if (x > width - limit) {
        envelope = (width - x) / limit;
      }
      
      const y = centerY + Math.sin(x * w.freq + phase * w.speed) * currentAmp * envelope;
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  });
  
  animationId = requestAnimationFrame(tick);
}
