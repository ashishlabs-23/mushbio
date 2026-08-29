/**
 * ============================================================================
 * MUSHBIO ADDRESS BOOK SERVICE (PHASE 06)
 *
 * Implements address CRUD, default promotion, address limits, and atomic
 * profile synchronization.
 * ============================================================================
 */

import { addressRepository, AddressRepository } from "./repository";
import { AddressDto, AddressListDto } from "./dto";
import { CreateAddressSchema, UpdateAddressSchema, CreateAddressInput, UpdateAddressInput } from "./schemas";
import { toAddressDto } from "./mapper";
import { UserAddress } from "../types";
import { NotFoundError, BadRequestError, ConflictError } from "../utils/errors";
import { Timestamp } from "firebase-admin/firestore";

export const MAX_ADDRESSES_PER_USER = 10;

export class AddressService {
  constructor(private repo: AddressRepository = addressRepository) {}

  /**
   * 1. List all addresses for user (Default address first, then newest)
   */
  async listAddresses(userId: string): Promise<AddressListDto> {
    const addresses = await this.repo.getAddresses(userId);

    // Sort: Default address first, then by updatedAt/createdAt DESC
    addresses.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      const aTime = (a.updatedAt as any)?.toMillis?.() || 0;
      const bTime = (b.updatedAt as any)?.toMillis?.() || 0;
      return bTime - aTime;
    });

    const defaultAddr = addresses.find((a) => a.isDefault);

    return {
      data: addresses.map(toAddressDto),
      total: addresses.length,
      defaultAddressId: defaultAddr?.id,
    };
  }

  /**
   * 2. Get single address by ID
   */
  async getAddressById(userId: string, addressId: string): Promise<AddressDto> {
    const address = await this.repo.getAddressById(userId, addressId);
    if (!address) {
      throw new NotFoundError(
        `Address with ID '${addressId}' not found`,
        "ADDRESS_NOT_FOUND"
      );
    }
    return toAddressDto(address);
  }

  /**
   * 3. Create new address (Enforces limit of 10 & auto-default for 1st address)
   */
  async createAddress(userId: string, rawInput: CreateAddressInput): Promise<AddressDto> {
    const input = CreateAddressSchema.parse(rawInput);
    const existingAddresses = await this.repo.getAddresses(userId);

    // Enforce maximum address limit (10)
    if (existingAddresses.length >= MAX_ADDRESSES_PER_USER) {
      throw new ConflictError(
        `Maximum limit of ${MAX_ADDRESSES_PER_USER} addresses reached. Please delete an existing address to add a new one.`,
        "ADDRESS_LIMIT_REACHED"
      );
    }

    // First address automatically becomes default
    const isFirstAddress = existingAddresses.length === 0;
    const shouldBeDefault = isFirstAddress || !!input.isDefault;

    const addressId = `addr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Timestamp.now();

    const newAddress: UserAddress = {
      id: addressId,
      label: input.label,
      recipientName: input.recipientName,
      phone: input.phone,
      line1: input.line1,
      line2: input.line2,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country || "IN",
      isDefault: shouldBeDefault,
      // GPS fields (Phase 10A) — server assigns locationCapturedAt
      ...(input.latitude !== undefined && { latitude: input.latitude }),
      ...(input.longitude !== undefined && { longitude: input.longitude }),
      ...(input.accuracyMeters !== undefined && { accuracyMeters: input.accuracyMeters }),
      ...(input.locationSource && { locationSource: input.locationSource }),
      ...(input.deliveryInstructions && { deliveryInstructions: input.deliveryInstructions }),
      // Only assign locationCapturedAt if GPS data is provided
      ...((input.latitude !== undefined || input.locationSource === "GPS") && { locationCapturedAt: now }),
      createdAt: now,
      updatedAt: now,
    };

    if (shouldBeDefault) {
      // Transactional default creation & profile synchronization
      await this.repo.runTransaction(async (tx) => {
        // Unset previous defaults if any
        for (const existing of existingAddresses) {
          if (existing.isDefault) {
            const existingRef = this.repo.getAddressRef(userId, existing.id);
            tx.update(existingRef, { isDefault: false, updatedAt: now });
          }
        }

        const newAddrRef = this.repo.getAddressRef(userId, addressId);
        tx.set(newAddrRef, newAddress);

        const userRef = this.repo.getUserRef(userId);
        tx.update(userRef, { defaultShippingAddressId: addressId, updatedAt: now });
      });
    } else {
      await this.repo.runTransaction(async (tx) => {
        const newAddrRef = this.repo.getAddressRef(userId, addressId);
        tx.set(newAddrRef, newAddress);
      });
    }

    return toAddressDto(newAddress);
  }

  /**
   * 4. Update existing address
   */
  async updateAddress(userId: string, addressId: string, rawInput: UpdateAddressInput): Promise<AddressDto> {
    const input = UpdateAddressSchema.parse(rawInput);
    const existing = await this.repo.getAddressById(userId, addressId);

    if (!existing) {
      throw new NotFoundError(
        `Address with ID '${addressId}' not found`,
        "ADDRESS_NOT_FOUND"
      );
    }

    const now = Timestamp.now();

    // Prevent un-defaulting if it's currently the default without setting a new one
    if (existing.isDefault && input.isDefault === false) {
      throw new BadRequestError(
        "Cannot remove default status. Please designate another address as default instead.",
        "DEFAULT_ADDRESS_REQUIRED"
      );
    }

    const becomesDefault = input.isDefault === true && !existing.isDefault;

    if (becomesDefault) {
      await this.repo.runTransaction(async (tx) => {
        const allAddresses = await this.repo.getAddresses(userId);

        for (const addr of allAddresses) {
          if (addr.id !== addressId && addr.isDefault) {
            const ref = this.repo.getAddressRef(userId, addr.id);
            tx.update(ref, { isDefault: false, updatedAt: now });
          }
        }

        const gpsLocationChanged =
          input.latitude !== undefined || input.longitude !== undefined || input.locationSource === "GPS";
        const targetRef = this.repo.getAddressRef(userId, addressId);
        const updatedDoc = {
          ...existing,
          ...input,
          isDefault: true,
          updatedAt: now,
          ...(gpsLocationChanged && { locationCapturedAt: now }),
        };
        tx.update(targetRef, updatedDoc);

        const userRef = this.repo.getUserRef(userId);
        tx.update(userRef, { defaultShippingAddressId: addressId, updatedAt: now });
      });
    } else {
      await this.repo.runTransaction(async (tx) => {
        const targetRef = this.repo.getAddressRef(userId, addressId);
        const gpsLocationChanged =
          input.latitude !== undefined || input.longitude !== undefined || input.locationSource === "GPS";
        const updatedDoc = {
          ...input,
          updatedAt: now,
          // Server re-assigns locationCapturedAt when GPS data is updated
          ...(gpsLocationChanged && { locationCapturedAt: now }),
        };
        tx.update(targetRef, updatedDoc);
      });
    }

    const updated = await this.repo.getAddressById(userId, addressId);
    return toAddressDto(updated!);
  }

  /**
   * 5. Set address as Default
   */
  async setDefaultAddress(userId: string, addressId: string): Promise<AddressDto> {
    const now = Timestamp.now();

    await this.repo.runTransaction(async (tx) => {
      const targetRef = this.repo.getAddressRef(userId, addressId);
      const targetSnap = await tx.get(targetRef);

      if (!targetSnap.exists) {
        throw new NotFoundError(
          `Address with ID '${addressId}' not found`,
          "ADDRESS_NOT_FOUND"
        );
      }

      const allAddresses = await this.repo.getAddresses(userId);

      // Unset previous defaults
      for (const addr of allAddresses) {
        if (addr.id !== addressId && addr.isDefault) {
          const ref = this.repo.getAddressRef(userId, addr.id);
          tx.update(ref, { isDefault: false, updatedAt: now });
        }
      }

      tx.update(targetRef, { isDefault: true, updatedAt: now });

      const userRef = this.repo.getUserRef(userId);
      tx.update(userRef, { defaultShippingAddressId: addressId, updatedAt: now });
    });

    const updated = await this.repo.getAddressById(userId, addressId);
    return toAddressDto(updated!);
  }

  /**
   * 6. Delete address (Promotes next replacement if deleting default)
   */
  async deleteAddress(userId: string, addressId: string): Promise<{ success: boolean; newDefaultAddressId?: string }> {
    const now = Timestamp.now();
    let replacementId: string | undefined;

    await this.repo.runTransaction(async (tx) => {
      const targetRef = this.repo.getAddressRef(userId, addressId);
      const targetSnap = await tx.get(targetRef);

      if (!targetSnap.exists) {
        throw new NotFoundError(
          `Address with ID '${addressId}' not found`,
          "ADDRESS_NOT_FOUND"
        );
      }

      const targetData = targetSnap.data() as UserAddress;
      const allAddresses = await this.repo.getAddresses(userId);
      const remaining = allAddresses.filter((a) => a.id !== addressId);

      tx.delete(targetRef);

      if (targetData.isDefault) {
        if (remaining.length > 0) {
          // Promote most recently updated remaining address as default
          remaining.sort((a, b) => {
            const aTime = (a.updatedAt as any)?.toMillis?.() || 0;
            const bTime = (b.updatedAt as any)?.toMillis?.() || 0;
            return bTime - aTime;
          });

          const promoted = remaining[0];
          replacementId = promoted.id;

          const promotedRef = this.repo.getAddressRef(userId, promoted.id);
          tx.update(promotedRef, { isDefault: true, updatedAt: now });

          const userRef = this.repo.getUserRef(userId);
          tx.update(userRef, { defaultShippingAddressId: promoted.id, updatedAt: now });
        } else {
          // No addresses remain -> clear default address in profile
          const userRef = this.repo.getUserRef(userId);
          tx.update(userRef, { defaultShippingAddressId: null, updatedAt: now });
        }
      }
    });

    return {
      success: true,
      newDefaultAddressId: replacementId,
    };
  }
}

export const addressService = new AddressService();
