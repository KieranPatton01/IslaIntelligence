/**
 * api.js — Cloudflare Worker streaming client
 *
 * The Worker is the only layer that holds the Gemini API key.
 * This module sends the assembled payload and yields SSE text chunks
 * as an async generator so the UI can render them incrementally.
 *
 * Security headers sent on every request:
 *   Authorization: Bearer <firebase-id-token>  (VULN-03: proves caller is authenticated)
 *   X-Isla-Token:  <shared-secret>             (VULN-01: stops unauthenticated callers)
 *
 * Memory extraction:
 * If the AI appends [[MEMORY: some fact]] at the end of a response,
 * this module strips it from the visible text and emits it via the
 * onNewMemory callback so chat.js can persist it to Firestore.
 */

import { auth } from './firebase.js';

function getWorkerUrl() {
  const url = import.meta.env.VITE_WORKER_URL;
  if (!url || typeof url !== 'string' || !url.startsWith('http') || url.includes('VITE_WORKER_URL')) {
    return 'https://isla-intelligence-proxy.isingingbanana.workers.dev';
  }
  return url;
}

const WORKER_URL  = getWorkerUrl();
const ISLA_SECRET = import.meta.env.VITE_ISLA_SECRET || '';

// Regex to match [[MEMORY: ...]] and [[TRINKET: ...]] at the end of a completed response
const MEMORY_TAG_RE = /\[\[MEMORY:\s*(.+?)\]\]/gi;
const TRINKET_TAG_RE = /\[\[TRINKET:\s*(.+?)\]\]/gi;

/**
 * Stream a chat response from the Cloudflare Worker proxy.
 *
 * @param {Object} params
 * @param {{ role: 'user'|'model', text: string }[]} params.messages  - Conversation history
 * @param {number}   params.toneValue      - 0 (ragebait) → 100 (princess)
 * @param {string[]} [params.userFacts]    - Memory bank facts to inject into system prompt
 * @param {string}   [params.imageBase64]  - Raw base64 image string (no data: prefix)
 * @param {string}   [params.imageMimeType] - e.g. 'image/jpeg'
 * @param {Function} [params.onNewMemory]  - Called with (factString) when AI auto-discovers a new fact
 * @param {Function} [params.onNewTrinket] - Called with (trinketString) when AI auto-recommends a new trinket
 * @returns {Promise<{ model: string, stream: AsyncGenerator<string, void, unknown> }>}
 */
export async function streamChat({
  messages,
  toneValue = 50,
  userFacts = [],
  mediaList = [],
  modelChoice = '3.5-standard',
  onNewMemory = null,
  onNewTrinket = null,
}) {
  let idToken = '';
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      idToken = await currentUser.getIdToken(true); // Force fresh token
    } catch (tokenErr) {
      // Token fetch failed
    }
  }

  if (!idToken) {
    throw new Error('Unauthenticated');
  }

  const headers = {
    'Content-Type': 'application/json',
  };
  if (ISLA_SECRET) headers['X-Isla-Token'] = ISLA_SECRET;
  headers['Authorization'] = `Bearer ${idToken}`;

  let response;
  try {
    response = await fetch(WORKER_URL, {
      method:  'POST',
      headers,
      body:    JSON.stringify({
        messages,
        toneValue,
        userFacts,
        mediaList,
        modelChoice,
      }),
    });
  } catch (netErr) {
    throw netErr;
  }

  if (!response.ok) {
    let errText = '';
    try {
      errText = await response.text();
    } catch (e) {
      errText = `Error: ${response.status} ${response.statusText}`;
    }
    throw new Error(errText || `Error: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('No response body from Worker.');
  }

  const aiModel = response.headers.get('X-Isla-Model') || 'unknown-model';

  async function* generateStream() {
    const reader  = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let buffer = '';
    let fullText = ''; // accumulate to extract [[MEMORY:]] at the end

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Stream finished — scan full accumulated text for memory and trinket tags
        if (onNewMemory && fullText) {
          const matches = [...fullText.matchAll(MEMORY_TAG_RE)];
          for (const match of matches) {
            const fact = match[1].trim();
            if (fact) onNewMemory(fact);
          }
        }
        if (onNewTrinket && fullText) {
          const matches = [...fullText.matchAll(TRINKET_TAG_RE)];
          for (const match of matches) {
            const trinket = match[1].trim();
            if (trinket) onNewTrinket(trinket);
          }
        }
        break;
      }

      // Append incoming bytes to the buffer
      buffer += decoder.decode(value, { stream: true });

      // Split on SSE line boundaries and process complete events
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              throw new Error(parsed.error.message || 'Error occurred in Gemini stream');
            }
            const candidate = parsed.candidates?.[0];
            
            if (candidate?.finishReason && candidate.finishReason !== 'STOP' && candidate.finishReason !== '') {
              yield { type: 'text', text: `\n\n[System intercept: The AI stopped generating here due to a safety/policy filter (${candidate.finishReason}).]` };
            }
            
            if (candidate?.content?.parts) {
              for (const part of candidate.content.parts) {
                const textChunk = part.text || '';
                const isThought = !!part.thought;

                if (isThought) {
                  if (textChunk) {
                    yield { type: 'thought', text: textChunk };
                  }
                } else {
                  if (textChunk) {
                    fullText += textChunk;
                    // Yield the chunk but strip any [[MEMORY:...]] and [[TRINKET:...]] markers from visible output
                    const visibleChunk = textChunk.replace(MEMORY_TAG_RE, '').replace(TRINKET_TAG_RE, '');
                    if (visibleChunk) {
                      yield { type: 'text', text: visibleChunk };
                    }
                  }
                }
              }
            }
          } catch (e) {
            throw e;
          }
        }
      }
    }
  }

  return { model: aiModel, stream: generateStream() };
}
