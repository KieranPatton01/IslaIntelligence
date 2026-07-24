/**
 * firebase.js — Firebase app initialisation
 * All config values come from Vite environment variables (injected at build time).
 * Safe to expose in the browser — Firestore/Storage Security Rules protect the data.
 */
import { initializeApp } from 'firebase/app';
import { getAuth }        from 'firebase/auth';
import { getFirestore }   from 'firebase/firestore';
import { getStorage }     from 'firebase/storage';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || 'AIzaSyBe0onZmo-5vJk5ocHD682ZzRzf3d93UJ8',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || 'islaintelligence.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || 'islaintelligence',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || 'islaintelligence.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID  || '1063462947936',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || '1:1063462947936:web:86e409c91ee30ce6f671ca',
};

const app = initializeApp(firebaseConfig);

export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);
