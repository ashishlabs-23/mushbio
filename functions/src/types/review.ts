/**
 * ============================================================================
 * MUSHBIO FIRESTORE DATA MODEL — REVIEWS & RATINGS (PHASE 02)
 *
 * Collection: reviews/{reviewId}
 * ============================================================================
 */

import { TimestampFields } from "./common";

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ReviewDocument extends TimestampFields {
  id: string;
  productId: string;
  userId: string;
  orderId?: string;
  authorNameSnapshot: string;
  rating: number; // 1 to 5 stars
  title: string;
  content: string;
  status: ReviewStatus;
  verifiedPurchase: boolean;
  images?: string[];
  helpfulCount?: number;
}
