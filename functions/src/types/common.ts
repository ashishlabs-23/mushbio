/**
 * ============================================================================
 * MUSHBIO FIRESTORE DATA MODEL — COMMON TYPES (PHASE 02)
 * ============================================================================
 */

import { Timestamp, FieldValue } from "firebase-admin/firestore";

export type FirestoreTimestamp = Timestamp | FieldValue;

export interface TimestampFields {
  createdAt: FirestoreTimestamp;
  updatedAt: FirestoreTimestamp;
}

export type Currency = "INR";

export interface PaginationCursor {
  limit: number;
  startAfterDocId?: string;
  startAfterValue?: string | number | Timestamp;
  orderByField: string;
  orderDirection: "asc" | "desc";
}

export interface PaginatedResult<T> {
  items: T[];
  totalEstimate?: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface ApiResponse<T = unknown> {
  status: "success" | "error";
  data?: T;
  code?: string;
  message?: string;
  timestamp: string;
}
