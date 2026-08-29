/**
 * ============================================================================
 * MUSHBIO SHIPPING DOMAIN SERVICE (PHASE 09)
 * ============================================================================
 */

import { shippingCalculator, ShippingCalculator } from "./calculator";
import { ShippingCalculationDto, ShippingMethod } from "./dto";
import { UserAddress } from "../types";

export class ShippingService {
  constructor(private calc: ShippingCalculator = shippingCalculator) {}

  calculateShipping(
    subtotalAfterDiscount: number,
    method: ShippingMethod = "STANDARD",
    address?: UserAddress
  ): ShippingCalculationDto {
    return this.calc.calculate(subtotalAfterDiscount, method, address);
  }
}

export const shippingService = new ShippingService();
