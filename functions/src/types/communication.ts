/**
 * ============================================================================
 * MUSHBIO FIRESTORE DATA MODEL — CONTACT & NEWSLETTER (PHASE 02)
 *
 * Collections:
 *   - contactMessages/{messageId}
 *   - newsletterSubscribers/{subscriberId}
 * ============================================================================
 */

import { FirestoreTimestamp } from "./common";

export type ContactMessageStatus = "NEW" | "IN_PROGRESS" | "RESOLVED" | "SPAM";
export type NewsletterStatus = "SUBSCRIBED" | "UNSUBSCRIBED";

export interface ContactMessageDocument {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  status: ContactMessageStatus;
  createdAt: FirestoreTimestamp;
  processedAt?: FirestoreTimestamp;
  assignedToUid?: string;
  internalNotes?: string;
}

export interface NewsletterSubscriberDocument {
  id: string;
  email: string;
  normalizedEmail: string; // Trimmed lowercase
  status: NewsletterStatus;
  source: string; // e.g. "footer_form", "checkout_optin", "popup"
  subscribedAt: FirestoreTimestamp;
  unsubscribedAt?: FirestoreTimestamp;
}
