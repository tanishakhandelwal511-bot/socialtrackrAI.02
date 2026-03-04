import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Only initialize if we have a valid-looking API key
const isConfigured = firebaseConfig.apiKey && 
                   !firebaseConfig.apiKey.includes('placeholder') && 
                   firebaseConfig.apiKey.length > 10;

let app;
if (isConfigured) {
  try {
    console.log(`Initializing Firebase with API Key starting with: ${firebaseConfig.apiKey?.substring(0, 4)}...`);
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    console.log("Firebase initialized successfully.");
  } catch (e) {
    console.error("Firebase initialization failed:", e);
  }
} else {
  console.warn("Firebase not configured or invalid API key provided. Key found:", firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 4)}...` : 'none');
}

// Export services (they might be null if not configured, which we handle in main.tsx)
export const auth = app ? getAuth(app) : ({} as any);
export const db = app ? getFirestore(app) : ({} as any);
export const googleProvider = new GoogleAuthProvider();
