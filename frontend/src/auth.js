/**
 * auth.js — Firebase Authentication (email + password only)
 */
import { auth } from './firebase.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';

/**
 * Subscribe to Firebase auth state changes.
 * @param {(user: import('firebase/auth').User|null) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

// Hard-coded email allowlist — only these addresses may sign in or sign up.
const ALLOWED_EMAILS = new Set([
  'isingingbanana@gmail.com',
  'iscowper@icloud.com',
  'developer@ii.com',
]);

/**
 * Sign in with email + password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function signIn(email, password) {
  const normalised = (email || '').toLowerCase().trim();
  if (!ALLOWED_EMAILS.has(normalised)) {
    throw Object.assign(new Error('Access denied.'), { code: 'auth/not-authorised' });
  }
  const credential = await signInWithEmailAndPassword(auth, normalised, password);
  return credential.user;
}

/**
 * Create a new account with email + password, then set the display name.
 * @param {string} email
 * @param {string} password
 * @param {string} displayName
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function signUp(email, password, displayName) {
  const normalised = (email || '').toLowerCase().trim();
  if (!ALLOWED_EMAILS.has(normalised)) {
    throw Object.assign(new Error('Access denied.'), { code: 'auth/not-authorised' });
  }
  const credential = await createUserWithEmailAndPassword(auth, normalised, password);
  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }
  return credential.user;
}

/**
 * Sign the current user out.
 */
export async function signOutUser() {
  await signOut(auth);
}

/**
 * Send a password reset email to the given address.
 * @param {string} email
 */
export async function sendPasswordReset(email) {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Map Firebase error codes to user-friendly messages.
 * @param {string} code - e.g. 'auth/wrong-password'
 * @returns {string}
 */
export function parseAuthError(code) {
  const map = {
    'auth/invalid-email':               'Please enter a valid email address.',
    'auth/not-authorised':              'Access denied. Email not on allowlist.',
    'auth/user-not-found':              'Invalid email or password.',
    'auth/wrong-password':              'Invalid email or password.',
    'auth/invalid-credential':          'Invalid email or password.',
    'auth/email-already-in-use':        'An account with this email already exists. Try signing in.',
    'auth/weak-password':               'Password must be at least 6 characters.',
    'auth/too-many-requests':           'Too many attempts. Please wait a moment and try again.',
    'auth/network-request-failed':      'Network error. Please check your connection.',
    'auth/user-disabled':               'This account has been disabled.',
    'auth/admin-restricted-operation':  'Account creation is currently disabled in Firebase Console. Please sign in.',
    'auth/operation-not-allowed':       'Email/Password sign-in or sign-up is disabled in Firebase Console.',
  };
  return map[code] ?? `Authentication error [${code || 'Unknown'}]. Please try again.`;
}
