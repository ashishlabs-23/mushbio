/**
 * ============================================================================
 * MUSHBIO AUTHENTICATION & AUTHORIZATION MIDDLEWARES (PHASE 05)
 * ============================================================================
 */

import { Request, Response, NextFunction } from "express";
import { userRepository, UserRepository } from "./repository";
import { AuthContext } from "./dto";
import { UserRole, UserDocument } from "../types";
import { UnauthorizedError, ForbiddenError, handleFunctionError } from "../utils/errors";
import { safeLogger } from "../utils/logger";

// Extend Express Request type to carry authenticated user context
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      userProfile?: UserDocument;
    }
  }
}

/**
 * Extracts Bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.split("Bearer ")[1]?.trim() || null;
}

/**
 * Require Valid Firebase Auth ID Token
 */
export function requireAuth(repo: UserRepository = userRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        throw new UnauthorizedError(
          "Authentication required. Missing or malformed Authorization Bearer header.",
          "AUTH_REQUIRED"
        );
      }

      const decoded = await repo.verifyIdToken(token).catch((err) => {
        safeLogger.warn("Token verification failed", { error: err?.message });
        if (err?.code === "auth/id-token-expired") {
          throw new UnauthorizedError("Authentication token expired", "TOKEN_EXPIRED");
        }
        throw new UnauthorizedError("Invalid authentication token", "INVALID_TOKEN");
      });

      req.auth = {
        uid: decoded.uid,
        email: decoded.email,
        role: (decoded.role as UserRole) || "CUSTOMER",
        emailVerified: !!decoded.email_verified,
      };

      next();
    } catch (err) {
      handleFunctionError(err, res);
    }
  };
}

/**
 * Optional Auth Context Middleware (Permits anonymous, attaches identity if valid)
 */
export function optionalAuth(repo: UserRepository = userRepository) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractBearerToken(req);
      if (token) {
        const decoded = await repo.verifyIdToken(token).catch(() => null);
        if (decoded) {
          req.auth = {
            uid: decoded.uid,
            email: decoded.email,
            role: (decoded.role as UserRole) || "CUSTOMER",
            emailVerified: !!decoded.email_verified,
          };
        }
      }
    } catch {
      // Ignored for optional auth
    }
    next();
  };
}

/**
 * Enforce Active Account Status (Rejects SUSPENDED or DELETED accounts)
 */
export function requireActiveAccount(repo: UserRepository = userRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth?.uid) {
        throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");
      }

      const profile = await repo.getUserById(req.auth.uid);
      if (profile) {
        if (profile.status === "SUSPENDED") {
          throw new ForbiddenError("Your account has been suspended.", "ACCOUNT_SUSPENDED");
        }
        if (profile.status === "DELETED") {
          throw new ForbiddenError("This account has been deleted.", "ACCOUNT_DELETED");
        }
        req.userProfile = profile;
      }

      next();
    } catch (err) {
      handleFunctionError(err, res);
    }
  };
}

/**
 * Role-Based Access Control (RBAC) Guard
 */
export function requireRole(allowedRoles: UserRole | UserRole[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.auth) {
        throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");
      }

      const userRole = req.auth.role || "CUSTOMER";
      if (!roles.includes(userRole)) {
        throw new ForbiddenError(
          `Insufficient permissions. Required role: ${roles.join(" or ")}`,
          "FORBIDDEN"
        );
      }

      next();
    } catch (err) {
      handleFunctionError(err, res);
    }
  };
}
