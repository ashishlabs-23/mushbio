/**
 * ============================================================================
 * MUSHBIO ORDER NUMBER GENERATOR (PHASE 08)
 *
 * Generates human-friendly, unique, collision-resistant order references.
 * Format: MB-YYYY-XXXXXX (e.g. MB-2026-7K4F2Q)
 * ============================================================================
 */

export function generateOrderNumber(year: number = new Date().getFullYear()): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Crockford Base32 (no 0, 1, I, O to prevent visual confusion)
  let randomPart = "";
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * chars.length);
    randomPart += chars[idx];
  }
  return `MB-${year}-${randomPart}`;
}
