/**
 * ============================================================================
 * MUSHBIO CLIENT FIREBASE CONFIGURATION (BROWSER ENVIRONMENT ONLY)
 *
 * ARCHITECTURAL BOUNDARY RULES:
 * 1. This file contains public Firebase client configuration.
 * 2. Client configuration is NOT a secret credential.
 * 3. NEVER import the Firebase Admin SDK or service-account JSON here.
 * 4. Sensitive commerce operations (cart validation, order calculation, payments)
 *    must ALWAYS go through Cloud Functions backend endpoints.
 * ============================================================================
 */

// Replace placeholders with your Firebase project Web App configuration
export const firebaseClientConfig = {
  apiKey: "AIzaSy_MUSHBIO_CLIENT_API_KEY_PLACEHOLDER",
  authDomain: "mushbio-organics.firebaseapp.com",
  projectId: "mushbio-organics",
  storageBucket: "mushbio-organics.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890",
  measurementId: "G-MUSHBIO123"
};

/**
 * Emulator Connection Flags (Local Development)
 * When set to true, connects client SDK to local Firebase Emulator Suite.
 */
export const USE_EMULATORS = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

export const EMULATOR_CONFIG = {
  authHost: "http://localhost:9099",
  firestoreHost: "localhost",
  firestorePort: 8085,
  functionsHost: "http://localhost:5001",
  storageHost: "localhost",
  storagePort: 9199,
};
