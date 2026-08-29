/**
 * ============================================================================
 * MUSHBIO FIREBASE ADMIN SDK INITIALIZATION (SERVER-SIDE ONLY)
 *
 * CRITICAL ARCHITECTURAL BOUNDARY:
 * This file and the Firebase Admin SDK must NEVER be imported or bundled into
 * client-side/browser code. It runs with elevated privileges in Cloud Functions.
 * ============================================================================
 */

import { initializeApp, getApps, getApp, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";
import { getStorage, Storage } from "firebase-admin/storage";

// Singleton initialization for Cloud Functions environment
const app: App = getApps().length === 0 ? initializeApp() : getApp();

export const adminApp = app;
export const db: Firestore = getFirestore(app);
export const auth: Auth = getAuth(app);
export const storage: Storage = getStorage(app);

// Configure Firestore settings for low latency
db.settings({
  ignoreUndefinedProperties: true,
});
