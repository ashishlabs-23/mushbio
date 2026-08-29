/**
 * ============================================================================
 * MUSHBIO SERVER-SIDE ERROR HANDLING & RESPONSE FORMATTER
 *
 * Provides typed domain errors and safe serialization that never leaks
 * stack traces, database metadata, or internal secrets to callers.
 * ============================================================================
 */

import { safeLogger } from "./logger";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, errorCode = "INTERNAL_ERROR", isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Invalid request payload or parameters", errorCode = "BAD_REQUEST") {
    super(message, 400, errorCode);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required", errorCode = "UNAUTHORIZED") {
    super(message, 401, errorCode);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access forbidden", errorCode = "FORBIDDEN") {
    super(message, 403, errorCode);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Requested resource not found", errorCode = "NOT_FOUND") {
    super(message, 404, errorCode);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict detected", errorCode = "CONFLICT") {
    super(message, 409, errorCode);
  }
}

export class InternalServerError extends AppError {
  constructor(message = "An unexpected server error occurred", errorCode = "INTERNAL_SERVER_ERROR") {
    super(message, 500, errorCode);
  }
}

export function handleFunctionError(err: unknown, res: any): void {
  if (err instanceof AppError && err.isOperational) {
    safeLogger.warn(`Operational error: ${err.message}`, {
      statusCode: err.statusCode,
      errorCode: err.errorCode,
    });
    res.status(err.statusCode).json({
      status: "error",
      code: err.errorCode,
      message: err.message,
    });
    return;
  }

  // Catch unexpected unhandled exceptions (scrub internal details from response)
  safeLogger.error("Unhandled server exception", err);
  res.status(500).json({
    status: "error",
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected server error occurred. Please try again later.",
  });
}
