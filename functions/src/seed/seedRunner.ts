/**
 * ============================================================================
 * MUSHBIO FIRESTORE SEED RUNNER
 *
 * Populates Firestore Emulator or Development environment with seed data.
 * Usage: npm --prefix functions run seed
 * ============================================================================
 */

import { db } from "../config/firebaseAdmin";
import {
  SEED_CATEGORIES,
  SEED_PRODUCTS,
  SEED_COUPONS,
  SEED_BLOGS,
  SEED_REVIEWS,
} from "./seedData";
import { safeLogger } from "../utils/logger";

export async function runFirestoreSeed(): Promise<void> {
  safeLogger.info("Starting MushBio Firestore Seed...");

  const batch = db.batch();

  // 1. Categories
  for (const cat of SEED_CATEGORIES) {
    const ref = db.collection("categories").doc(cat.id);
    batch.set(ref, cat);
  }

  // 2. Products, Variants & Inventory
  for (const item of SEED_PRODUCTS) {
    const prodRef = db.collection("products").doc(item.product.id);
    batch.set(prodRef, item.product);

    for (const v of item.variants) {
      const vRef = prodRef.collection("variants").doc(v.id);
      batch.set(vRef, v);
    }

    for (const inv of item.inventory) {
      const invRef = db.collection("inventory").doc(inv.variantId);
      batch.set(invRef, inv);
    }
  }

  // 3. Coupons
  for (const cpn of SEED_COUPONS) {
    const cpnRef = db.collection("coupons").doc(cpn.id);
    batch.set(cpnRef, cpn);
  }

  // 4. Blog Posts
  for (const blog of SEED_BLOGS) {
    const blogRef = db.collection("blogPosts").doc(blog.id);
    batch.set(blogRef, blog);
  }

  // 5. Reviews
  for (const rev of SEED_REVIEWS) {
    const revRef = db.collection("reviews").doc(rev.id);
    batch.set(revRef, rev);
  }

  await batch.commit();
  safeLogger.info("MushBio Firestore Seed completed successfully!", {
    categories: SEED_CATEGORIES.length,
    products: SEED_PRODUCTS.length,
    coupons: SEED_COUPONS.length,
    blogs: SEED_BLOGS.length,
    reviews: SEED_REVIEWS.length,
  });
}

// Allow standalone CLI execution
if (require.main === module) {
  runFirestoreSeed()
    .then(() => {
      console.log("Seed completed.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
