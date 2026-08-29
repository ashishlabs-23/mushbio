/**
 * ============================================================================
 * MUSHBIO ADDRESS BOOK ROUTER (PHASE 06)
 *
 * Mounts:
 *   GET    /api/v1/me/addresses
 *   POST   /api/v1/me/addresses
 *   GET    /api/v1/me/addresses/:addressId
 *   PATCH  /api/v1/me/addresses/:addressId
 *   DELETE /api/v1/me/addresses/:addressId
 *   POST   /api/v1/me/addresses/:addressId/default
 * ============================================================================
 */

import { Router } from "express";
import { addressController } from "./controller";
import { requireAuth, requireActiveAccount } from "../auth/middleware";

export const addressRouter = Router();

// Apply auth + active account requirements to all address routes
addressRouter.use(requireAuth(), requireActiveAccount());

addressRouter.get("/me/addresses", (req, res) => addressController.listAddresses(req, res));
addressRouter.post("/me/addresses", (req, res) => addressController.createAddress(req, res));
addressRouter.get("/me/addresses/:addressId", (req, res) => addressController.getAddressById(req, res));
addressRouter.patch("/me/addresses/:addressId", (req, res) => addressController.updateAddress(req, res));
addressRouter.post("/me/addresses/:addressId/default", (req, res) => addressController.setDefaultAddress(req, res));
addressRouter.delete("/me/addresses/:addressId", (req, res) => addressController.deleteAddress(req, res));
