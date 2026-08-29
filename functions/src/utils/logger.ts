/**
 * ============================================================================
 * MUSHBIO STRUCTURED & SAFE CLOUD FUNCTIONS LOGGER
 *
 * Automatically scrubs sensitive fields (passwords, tokens, API keys, cards)
 * before emitting structured JSON logs to Cloud Logging / Firebase Console.
 * ============================================================================
 */

import * as logger from "firebase-functions/logger";

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "authorization",
  "secret",
  "apikey",
  "api_key",
  "keysecret",
  "webhooksecret",
  "creditcard",
  "cardnumber",
  "cvv",
  "cookie",
]);

function sanitizeData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map(sanitizeData);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null) {
      sanitized[key] = sanitizeData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export const safeLogger = {
  info(message: string, meta?: Record<string, unknown>): void {
    logger.info(message, meta ? (sanitizeData(meta) as Record<string, unknown>) : {});
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    logger.warn(message, meta ? (sanitizeData(meta) as Record<string, unknown>) : {});
  },
  error(message: string, err?: unknown, meta?: Record<string, unknown>): void {
    const errorDetails = err instanceof Error ? { name: err.name, message: err.message } : { error: err };
    logger.error(message, {
      ...errorDetails,
      ...(meta ? (sanitizeData(meta) as Record<string, unknown>) : {}),
    });
  },
  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== "production") {
      logger.debug(message, meta ? (sanitizeData(meta) as Record<string, unknown>) : {});
    }
  },
};
