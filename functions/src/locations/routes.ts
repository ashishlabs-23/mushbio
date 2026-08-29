/**
 * ============================================================================
 * MUSHBIO LOCATION ROUTES (PHASE 10A)
 *
 * POST /api/v1/locations/reverse-geocode
 *   Auth: requireAuth (GPS is only collected on authenticated user action)
 *   Validates coordinates server-side, calls Nominatim, returns normalized address.
 *   Provider secret: none needed (Nominatim is open).
 *   Rate limiting: 5s per-user cooldown (in-process).
 * ============================================================================
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../auth/middleware";
import { reverseGeocodeService } from "./service";
import { ReverseGeocodeSchema } from "./schemas";
import { handleFunctionError, BadRequestError } from "../utils/errors";
import { ZodError } from "zod";

export const locationRouter = Router();

locationRouter.post(
  "/reverse-geocode",
  requireAuth(),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const parseResult = ReverseGeocodeSchema.safeParse(req.body);
      if (!parseResult.success) {
        const fieldErrors = parseResult.error.flatten().fieldErrors;
        throw new BadRequestError(
          `Validation failed: ${JSON.stringify(fieldErrors)}`,
          "VALIDATION_ERROR"
        );
      }

      const input = parseResult.data;
      const userId = req.auth!.uid;

      let result;
      try {
        result = await reverseGeocodeService.reverseGeocode(userId, input);
      } catch (serviceErr: any) {
        const msg: string = serviceErr?.message || "";
        if (msg.startsWith("RATE_LIMIT_EXCEEDED:")) {
          res.status(429).json({ error: { code: "RATE_LIMIT_EXCEEDED", message: msg.replace("RATE_LIMIT_EXCEEDED: ", "") } });
          return;
        }
        if (msg.startsWith("GEOCODE_NO_RESULT:")) {
          res.status(422).json({ error: { code: "GEOCODE_NO_RESULT", message: "No address found for the provided coordinates. Please enter your address manually." } });
          return;
        }
        if (msg.startsWith("GEOCODE_NETWORK_ERROR:")) {
          res.status(503).json({ error: { code: "GEOCODE_UNAVAILABLE", message: "Location service temporarily unavailable. Please enter your address manually." } });
          return;
        }
        throw serviceErr;
      }

      res.status(200).json({ data: result });
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
        return;
      }
      handleFunctionError(err, res);
    }
  }
);
