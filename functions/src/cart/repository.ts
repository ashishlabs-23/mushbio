/**
 * ============================================================================
 * MUSHBIO CART FIRESTORE REPOSITORY (PHASE 07)
 *
 * Database operations for carts collection and items subcollection.
 * ============================================================================
 */

import { db } from "../config/firebaseAdmin";
import { CartDocument, CartItemDocument } from "../types";
import { DocumentReference } from "firebase-admin/firestore";

export class CartRepository {
  private cartsCol = db.collection("carts");

  getCartRef(cartId: string): DocumentReference {
    return this.cartsCol.doc(cartId);
  }

  getItemRef(cartId: string, itemId: string): DocumentReference {
    return this.cartsCol.doc(cartId).collection("items").doc(itemId);
  }

  /**
   * Get active cart for authenticated user
   */
  async getActiveCartByUser(userId: string): Promise<CartDocument | null> {
    const snap = await this.cartsCol
      .where("userId", "==", userId)
      .where("status", "==", "ACTIVE")
      .limit(1)
      .get();

    if (snap.empty) return null;
    return { ...(snap.docs[0].data() as CartDocument), id: snap.docs[0].id };
  }

  /**
   * Get active cart for guest session
   */
  async getActiveCartByGuest(guestId: string): Promise<CartDocument | null> {
    const snap = await this.cartsCol
      .where("guestId", "==", guestId)
      .where("status", "==", "ACTIVE")
      .limit(1)
      .get();

    if (snap.empty) return null;
    return { ...(snap.docs[0].data() as CartDocument), id: snap.docs[0].id };
  }

  /**
   * Get cart by ID
   */
  async getCartById(cartId: string): Promise<CartDocument | null> {
    const snap = await this.cartsCol.doc(cartId).get();
    if (!snap.exists) return null;
    return { ...(snap.data() as CartDocument), id: snap.id };
  }

  /**
   * Get all items in a cart
   */
  async getCartItems(cartId: string): Promise<CartItemDocument[]> {
    const snap = await this.cartsCol.doc(cartId).collection("items").get();
    return snap.docs.map((doc) => ({ ...(doc.data() as CartItemDocument), id: doc.id }));
  }

  /**
   * Find specific item by variantId in cart
   */
  async getCartItemByVariant(cartId: string, variantId: string): Promise<CartItemDocument | null> {
    const snap = await this.cartsCol
      .doc(cartId)
      .collection("items")
      .where("variantId", "==", variantId)
      .limit(1)
      .get();

    if (snap.empty) return null;
    return { ...(snap.docs[0].data() as CartItemDocument), id: snap.docs[0].id };
  }

  /**
   * Create new cart document
   */
  async createCart(cart: CartDocument): Promise<void> {
    await this.cartsCol.doc(cart.id).set(cart);
  }

  /**
   * Save / Set cart item
   */
  async setCartItem(cartId: string, item: CartItemDocument): Promise<void> {
    await this.cartsCol.doc(cartId).collection("items").doc(item.id).set(item);
  }

  /**
   * Delete specific cart item
   */
  async deleteCartItem(cartId: string, itemId: string): Promise<void> {
    await this.cartsCol.doc(cartId).collection("items").doc(itemId).delete();
  }

  /**
   * Clear all items in cart
   */
  async clearCartItems(cartId: string): Promise<void> {
    const snap = await this.cartsCol.doc(cartId).collection("items").get();
    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
  }

  /**
   * Update cart fields
   */
  async updateCart(cartId: string, fields: Partial<CartDocument>): Promise<void> {
    await this.cartsCol.doc(cartId).update(fields);
  }

  /**
   * Run Firestore transaction
   */
  async runTransaction<T>(updateFunction: (tx: FirebaseFirestore.Transaction) => Promise<T>): Promise<T> {
    return db.runTransaction(updateFunction);
  }
}

export const cartRepository = new CartRepository();
