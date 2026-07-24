/**
 * tts.js — Text-to-Speech using the Web Speech API
 * Reads AI response text aloud with voice characteristics
 * that adapt based on the current tone slider value (0–100).
 */

import { startVisualizer, stopVisualizer } from './visualizer.js';

let currentUtterance = null;
let currentSpeakBtn  = null;

/** Strip markdown & HTML tags to get clean speakable text */
function cleanForSpeech(text) {
  return text
    // Remove HTML tags (e.g. <span class="...">)
    .replace(/<[^>]+>/g, '')
    // Remove markdown code blocks
    .replace(/```[\s\S]*?```/g, 'code block')
    // Remove inline code
    .replace(/`[^`]+`/g, '')
    // Remove mermaid diagrams
    .replace(/```mermaid[\s\S]*?```/g, 'diagram')
    // Remove markdown headers hashes
    .replace(/^#+\s+/gm, '')
    // Remove bold/italic markers
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove bullet points
    .replace(/^[-*•]\s+/gm, '')
    // Collapse extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get speech parameters based on tone (0-100)
 * Narrowed limits to prevent robotic pitch distortions.
 */
function getSpeechParams(toneValue) {
  if (toneValue <= 20) {
    // Ragebait: fast, energetic, slightly higher pitch
    return { rate: 1.22, pitch: 1.06, volume: 1.0 };
  } else if (toneValue <= 40) {
    // Teasing: slightly fast, slightly high
    return { rate: 1.10, pitch: 1.03, volume: 0.95 };
  } else if (toneValue <= 60) {
    // Formal: neutral, clear, steady
    return { rate: 1.0, pitch: 1.0, volume: 1.0 };
  } else if (toneValue <= 80) {
    // Sooky: slightly slow, warm, soft
    return { rate: 0.94, pitch: 0.98, volume: 0.9 };
  } else {
    // Princess: slow, gentle, adoring
    return { rate: 0.88, pitch: 0.96, volume: 0.85 };
  }
}

/** Find a high-quality natural voice on the device */
function selectVoice() {
  if (!window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // Curated list of premium natural voices (Google, Siri, Microsoft Hazel/Susan)
  const preferredVoices = [
    'Google UK English Female',
    'Google UK English Male',
    'Siri',
    'Microsoft Hazel',
    'Microsoft Susan',
    'Microsoft George',
    'Google US English'
  ];

  for (const name of preferredVoices) {
    const found = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
    if (found) return found;
  }

  // Fallback to any en-GB voice
  const enGB = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith('en-gb'));
  if (enGB) return enGB;

  // Fallback to any English voice
  const English = voices.find(v => v.lang.toLowerCase().startsWith('en'));
  if (English) return English;

  return voices[0];
}

/**
 * Speak an AI message aloud, adapting voice params to toneValue.
 * Toggles off if already speaking the same message.
 *
 * SECURITY NOTE: `rawText` is passed to cleanForSpeech() which strips all HTML/markdown
 * before being assigned to SpeechSynthesisUtterance.text (a plain-string property).
 * It is NEVER injected into the DOM, so there is no XSS risk here.
 * Do NOT change this to use innerHTML without re-evaluating that assumption.
 *
 * @param {string} rawText     - Markdown/HTML text from the bubble
 * @param {number} toneValue   - Slider value 0-100
 * @param {HTMLElement} btn    - The speaker button element (for UI state)
 */
export function speakMessage(rawText, toneValue, btn) {
  // If already speaking this bubble, stop it (toggle off)
  if (currentUtterance && currentSpeakBtn === btn && window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    setSpeakBtnState(btn, false);
    currentUtterance = null;
    currentSpeakBtn = null;
    stopVisualizer();
    return;
  }

  // Stop any currently running speech
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    if (currentSpeakBtn) setSpeakBtnState(currentSpeakBtn, false);
  }

  const text = cleanForSpeech(rawText);
  if (!text) return;

  const { rate, pitch, volume } = getSpeechParams(toneValue);

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate   = rate;
  utterance.pitch  = pitch;
  utterance.volume = volume;
  utterance.lang   = 'en-GB';

  // Apply premium voice
  const voice = selectVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }

  utterance.onstart = () => {
    setSpeakBtnState(btn, true);
    currentSpeakBtn = btn;
    currentUtterance = utterance;
    startVisualizer();
  };

  utterance.onend = () => {
    setSpeakBtnState(btn, false);
    currentUtterance = null;
    currentSpeakBtn = null;
    stopVisualizer();
  };

  utterance.onerror = () => {
    setSpeakBtnState(btn, false);
    currentUtterance = null;
    currentSpeakBtn = null;
    stopVisualizer();
  };

  window.speechSynthesis.speak(utterance);
}

/** Update the speaker button visual state */
function setSpeakBtnState(btn, isPlaying) {
  if (!btn) return;
  const icon = btn.querySelector('.material-symbols-outlined');
  if (icon) icon.textContent = isPlaying ? 'stop_circle' : 'volume_up';
  btn.classList.toggle('tts-playing', isPlaying);
  btn.title = isPlaying ? 'Stop reading' : 'Read aloud';
}

/** Stop any active speech and reset UI */
export function stopSpeech() {
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
  }
  stopVisualizer();
  if (currentSpeakBtn) {
    setSpeakBtnState(currentSpeakBtn, false);
    currentSpeakBtn = null;
    currentUtterance = null;
  }
}
