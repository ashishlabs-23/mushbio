/**
 * ============================================================================
 * MUSHBIO ADDRESS BOOK CONTROLLER (PHASE 06)
 * ============================================================================
 */

import { Request, Response } from "express";
import { addressService } from "./service";
import { handleFunctionError, UnauthorizedError } from "../utils/errors";

export class AddressController {
  /**
   * GET /api/v1/me/addresses
   */
  async listAddresses(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");

      const result = await addressService.listAddresses(req.auth.uid);
      res.status(200).json(result);
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * POST /api/v1/me/addresses
   */
  async createAddress(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");

      const created = await addressService.createAddress(req.auth.uid, req.body);
      res.status(201).json({
        data: created,
      });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * GET /api/v1/me/addresses/:addressId
   */
  async getAddressById(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");
      const addressId = String(req.params.addressId);

      const address = await addressService.getAddressById(req.auth.uid, addressId);
      res.status(200).json({
        data: address,
      });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * PATCH /api/v1/me/addresses/:addressId
   */
  async updateAddress(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");
      const addressId = String(req.params.addressId);

      const updated = await addressService.updateAddress(req.auth.uid, addressId, req.body);
      res.status(200).json({
        data: updated,
      });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * POST /api/v1/me/addresses/:addressId/default
   */
  async setDefaultAddress(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");
      const addressId = String(req.params.addressId);

      const updated = await addressService.setDefaultAddress(req.auth.uid, addressId);
      res.status(200).json({
        data: updated,
      });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * DELETE /api/v1/me/addresses/:addressId
   */
  async deleteAddress(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");
      const addressId = String(req.params.addressId);

      const result = await addressService.deleteAddress(req.auth.uid, addressId);
      res.status(200).json(result);
    } catch (err) {
      handleFunctionError(err, res);
    }
  }
}

export const addressController = new AddressController();
