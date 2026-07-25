/**
 * firebase.js — Firebase app initialisation
 * All config values come from Vite environment variables (injected at build time).
 * Safe to expose in the browser — Firestore/Storage Security Rules protect the data.
 */
import { initializeApp } from 'firebase/app';
import { getAuth }        from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage }     from 'firebase/storage';

function safeEnv(val, fallback) {
  if (!val || typeof val !== 'string' || val.startsWith('VITE_') || val.includes('PLACEHOLDER')) return fallback;
  return val;
}

const firebaseConfig = {
  apiKey:            safeEnv(import.meta.env.VITE_FIREBASE_API_KEY, 'AIzaSyBe0onZmo-5vJk5ocHD682ZzRzf3d93UJ8'),
  authDomain:        safeEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, 'islaintelligence-78abb.firebaseapp.com'),
  projectId:         safeEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID, 'islaintelligence-78abb'),
  storageBucket:     safeEnv(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, 'islaintelligence-78abb.firebasestorage.app'),
  messagingSenderId: safeEnv(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, '230027769175'),
  appId:             safeEnv(import.meta.env.VITE_FIREBASE_APP_ID, '1:230027769175:web:1f7cb8877320aeb6bbba12'),
};

const app = initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
export const storage = getStorage(app);
