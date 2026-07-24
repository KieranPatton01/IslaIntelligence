import { db, auth } from './firebase.js';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc
} from 'firebase/firestore';

function getWorkerUrl() {
  const url = import.meta.env.VITE_WORKER_URL;
  if (!url || typeof url !== 'string' || !url.startsWith('http') || url.includes('VITE_WORKER_URL')) {
    return 'https://isla-intelligence-proxy.kieranpatton01.workers.dev';
  }
  return url;
}

const WORKER_URL  = getWorkerUrl();
const ISLA_SECRET = import.meta.env.VITE_ISLA_SECRET || '';

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

/**
 * Creates a new session document for the user.
 * @param {string} uid
 * @returns {Promise<string>} The new session ID
 */
export async function createSession(uid) {
  const sessionsRef = collection(db, 'users', uid, 'sessions');
  const docRef = await addDoc(sessionsRef, {
    title: 'New Chat',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return docRef.id;
}

/**
 * Subscribes to the user's sessions, ordered by most recently updated.
 * @param {string} uid
 * @param {function(Array): void} callback
 * @returns {function()} Unsubscribe function
 */
export function listSessions(uid, callback) {
  const sessionsRef = collection(db, 'users', uid, 'sessions');
  const q = query(sessionsRef, orderBy('updatedAt', 'desc'));
  
  return onSnapshot(q, (snapshot) => {
    const sessions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(sessions);
  }, (error) => {

  });
}

/**
 * Renames a specific session.
 * @param {string} uid 
 * @param {string} sessionId 
 * @param {string} newTitle 
 */
export async function renameSession(uid, sessionId, newTitle) {
  const sessionRef = doc(db, 'users', uid, 'sessions', sessionId);
  await updateDoc(sessionRef, {
    title: newTitle,
    updatedAt: serverTimestamp()
  });
}

/**
 * Calls the worker to generate a title based on the conversation text,
 * but only if the session doesn't already have a descriptive title.
 * @param {string} uid 
 * @param {string} sessionId 
 * @param {string} conversationText 
 */
export async function generateSessionTitle(uid, sessionId, conversationText, modelReply = '') {
  try {

    const sessionRef = doc(db, 'users', uid, 'sessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);
    if (sessionSnap.exists()) {
      const currentTitle = sessionSnap.data().title || '';
      const genericTitles = ['new chat', 'unnamed chat', 'chat session', 'ai conversation', ''];

      
      // If we already have a descriptive title, do nothing
      if (!genericTitles.includes(currentTitle.toLowerCase().trim())) {

        return;
      }
    } else {

    }


    const headers = await getWorkerHeaders();
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        generateTitle: true,
        firstUserMessage: conversationText.trim() || '[User sent a media file with no caption]',
        firstModelMessage: modelReply.trim()
      })
    });
    
    if (response.ok) {
      const data = await response.json();

      const genericTitles = ['new chat', 'unnamed chat', 'chat session', 'ai conversation'];
      const isGeneric = genericTitles.includes((data.title || '').toLowerCase().trim());
      const titleWords = (data.title || '').trim().split(/\s+/).length;

      
      if (data.title && !isGeneric && titleWords >= 2) {

        await renameSession(uid, sessionId, data.title);
      } else {
        // Gemini returned garbage — fall back to first 5 words of the user's message
        const fallback = conversationText
          .trim()
          .split(/\s+/)
          .filter(w => w.length > 0)
          .slice(0, 5)
          .join(' ');
        if (fallback) {
          const fallbackTitle = fallback.length > 40 ? fallback.slice(0, 40) + '…' : fallback;

          await renameSession(uid, sessionId, fallbackTitle);
        }
      }
    } else {

      // Worker error — still try the fallback
      const fallback = conversationText
        .trim()
        .split(/\s+/)
        .filter(w => w.length > 0)
        .slice(0, 5)
        .join(' ');
      if (fallback) {
        await renameSession(uid, sessionId, fallback);
      }
    }
  } catch (err) {

  }
}

/**
 * Deletes a session document and all its messages subcollection.
 * @param {string} uid
 * @param {string} sessionId
 */
export async function deleteSession(uid, sessionId) {
  const messagesRef = collection(db, 'users', uid, 'sessions', sessionId, 'messages');
  const messagesSnap = await getDocs(messagesRef);
  const deletePromises = messagesSnap.docs.map(d => deleteDoc(d.ref));
  await Promise.all(deletePromises);
  await deleteDoc(doc(db, 'users', uid, 'sessions', sessionId));
}
