/**
 * ============================================================================
 * MUSHBIO AUTHENTICATION & USER PROFILE SERVICE (PHASE 05)
 * ============================================================================
 */

import { userRepository, UserRepository } from "./repository";
import { UserProfileDto, UpdateProfileDto } from "./dto";
import { toUserProfileDto } from "./mapper";
import { UserDocument, UserRole, UserStatus } from "../types";
import { NotFoundError, ForbiddenError, BadRequestError } from "../utils/errors";
import { Timestamp } from "firebase-admin/firestore";
import { UpdateProfileSchema } from "./schemas";

export class AuthService {
  constructor(private repo: UserRepository = userRepository) {}

  /**
   * Get User Profile (Throws if user is suspended or deleted)
   */
  async getProfile(uid: string): Promise<UserProfileDto> {
    let userDoc = await this.repo.getUserById(uid);

    // Auto-initialize profile if created directly via Auth SDK but missing in Firestore
    if (!userDoc) {
      const authRecord = await this.repo.getAuthUser(uid).catch(() => null);
      if (!authRecord) {
        throw new NotFoundError("User account not found", "USER_NOT_FOUND");
      }
      userDoc = await this.ensureUserProfile(
        uid,
        authRecord.email || "",
        authRecord.displayName || "Customer",
        authRecord.photoURL,
        authRecord.phoneNumber,
        authRecord.emailVerified
      );
    }

    if (userDoc.status === "SUSPENDED") {
      throw new ForbiddenError(
        "Your account has been suspended. Please contact support.",
        "ACCOUNT_SUSPENDED"
      );
    }

    if (userDoc.status === "DELETED") {
      throw new ForbiddenError(
        "This account has been deleted.",
        "ACCOUNT_DELETED"
      );
    }

    return toUserProfileDto(userDoc);
  }

  /**
   * Update Editable Profile Fields
   */
  async updateProfile(uid: string, rawInput: UpdateProfileDto): Promise<UserProfileDto> {
    const parseResult = UpdateProfileSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new BadRequestError(
        parseResult.error.issues?.[0]?.message || "Invalid profile update parameters",
        "INVALID_PROFILE_UPDATE"
      );
    }

    const current = await this.repo.getUserById(uid);
    if (!current) {
      throw new NotFoundError("User profile not found", "PROFILE_NOT_FOUND");
    }

    if (current.status === "SUSPENDED") {
      throw new ForbiddenError("Suspended accounts cannot modify profiles", "ACCOUNT_SUSPENDED");
    }

    if (current.status === "DELETED") {
      throw new ForbiddenError("Deleted accounts cannot modify profiles", "ACCOUNT_DELETED");
    }

    const updated = await this.repo.updateUserProfile(uid, parseResult.data);
    return toUserProfileDto(updated);
  }

  /**
   * Ensure User Profile Exists (Default role: CUSTOMER, status: ACTIVE)
   */
  async ensureUserProfile(
    uid: string,
    email: string,
    displayName: string,
    photoURL?: string,
    phone?: string,
    emailVerified = false
  ): Promise<UserDocument> {
    const existing = await this.repo.getUserById(uid);
    if (existing) {
      return existing;
    }

    const now = Timestamp.now();
    const newProfile: UserDocument = {
      uid,
      email: email.toLowerCase().trim(),
      displayName: displayName.trim() || "Customer",
      photoURL,
      phone,
      role: "CUSTOMER",
      status: "ACTIVE",
      emailVerified,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    await this.repo.createUserProfile(newProfile);
    return newProfile;
  }

  /**
   * Set User Role (Server/Admin only)
   */
  async setUserRole(uid: string, role: UserRole): Promise<void> {
    await this.repo.setUserRole(uid, role);
  }

  /**
   * Set User Status (Server/Admin only)
   */
  async setUserStatus(uid: string, status: UserStatus): Promise<void> {
    await this.repo.setUserStatus(uid, status);
  }

  /**
   * Update Last Login Timestamp
   */
  async recordLogin(uid: string): Promise<void> {
    await this.repo.updateUserProfile(uid, {
      lastLoginAt: Timestamp.now(),
    });
  }
}

export const authService = new AuthService();
