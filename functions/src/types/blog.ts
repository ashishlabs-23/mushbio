/**
 * ============================================================================
 * MUSHBIO FIRESTORE DATA MODEL — BLOG POSTS (PHASE 02)
 *
 * Collection: blogPosts/{postId}
 * ============================================================================
 */

import { TimestampFields, FirestoreTimestamp } from "./common";

export type BlogPostStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface BlogPostDocument extends TimestampFields {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string; // Markdown or HTML
  coverImage: string; // Storage path or CDN URL
  category: string; // e.g. "Recipes", "Health & Wellness", "Farm Stories"
  authorId: string;
  authorName: string;
  status: BlogPostStatus;
  featured: boolean;
  readingTimeMinutes: number;
  publishedAt?: FirestoreTimestamp;
  tags?: string[];
}
