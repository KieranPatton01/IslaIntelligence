/**
 * memory.js — Memory Bank CRUD
 *
 * Stores user facts in Firestore at:
 *   users/{uid}  →  { facts: string[] }
 *
 * Facts are global (shared across all sessions).
 */

import { db } from './firebase.js';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

const USER_DOC = (uid) => doc(db, 'users', uid);

/**
 * Load all facts for the current user.
 * Returns an empty array if the document doesn't exist yet.
 * @param {string} uid
 * @returns {Promise<string[]>}
 */
export async function loadFacts(uid) {
  try {
    const snap = await getDoc(USER_DOC(uid));
    if (!snap.exists()) return [];
    return snap.data().facts ?? [];
  } catch (err) {
    // Suppressed
    return [];
  }
}

/**
 * Add a new fact if it doesn't already exist (case-insensitive dedup).
 * @param {string} uid
 * @param {string} fact
 * @param {string[]} currentFacts - Local facts array for dedup check
 * @returns {Promise<boolean>} true if saved, false if duplicate/skipped
 */
export async function saveFact(uid, fact, currentFacts = []) {
  const trimmed = fact.trim();
  if (!trimmed) return false;

  // Deduplicate: skip if a very similar fact already exists
  const lower = trimmed.toLowerCase();
  const isDuplicate = currentFacts.some(f => f.toLowerCase() === lower);
  if (isDuplicate) return false;

  try {
    const ref = USER_DOC(uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { facts: arrayUnion(trimmed) });
    } else {
      await setDoc(ref, { facts: [trimmed] });
    }
    return true;
  } catch (err) {

    return false;
  }
}

/**
 * Remove a specific fact from the user's memory bank.
 * @param {string} uid
 * @param {string} fact
 */
export async function deleteFact(uid, fact) {
  try {
    await updateDoc(USER_DOC(uid), { facts: arrayRemove(fact) });
  } catch (err) {

  }
}

/**
 * Load all collected trinkets for the current user.
 * @param {string} uid
 * @returns {Promise<string[]>}
 */
export async function loadTrinkets(uid) {
  try {
    const snap = await getDoc(USER_DOC(uid));
    if (!snap.exists()) return [];
    return snap.data().trinkets ?? [];
  } catch (err) {

    return [];
  }
}

/**
 * Add a new trinket if it doesn't already exist.
 * @param {string} uid
 * @param {string} trinket
 * @param {string[]} currentTrinkets
 * @returns {Promise<boolean>}
 */
export async function saveTrinket(uid, trinket, currentTrinkets = []) {
  const trimmed = trinket.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  const isDuplicate = currentTrinkets.some(t => t.toLowerCase() === lower);
  if (isDuplicate) return false;

  try {
    const ref = USER_DOC(uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { trinkets: arrayUnion(trimmed) });
    } else {
      await setDoc(ref, { trinkets: [trimmed] });
    }
    return true;
  } catch (err) {

    return false;
  }
}

/**
 * Remove a specific trinket from the user's collected shelf.
 * @param {string} uid
 * @param {string} trinket
 */
export async function deleteTrinket(uid, trinket) {
  try {
    await updateDoc(USER_DOC(uid), { trinkets: arrayRemove(trinket) });
  } catch (err) {

  }
}
