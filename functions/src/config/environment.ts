/**
 * ============================================================================
 * MUSHBIO SERVER ENVIRONMENT CONFIGURATION
 *
 * Centralized, type-safe environment and secret access.
 * Fallbacks and validations ensure no unhandled crashes from missing configs.
 * ============================================================================
 */

export interface EnvironmentConfig {
  nodeEnv: "development" | "production" | "test";
  isProduction: boolean;
  isEmulator: boolean;
  appName: string;
  appUrl: string;
  razorpay: {
    keyId: string;
    keySecret: string;
    webhookSecret: string;
  };
  geocoding: {
    /** Provider: "nominatim" (OpenStreetMap, free, no API key) */
    provider: string;
    /** User-Agent header required by Nominatim usage policy */
    userAgent: string;
    /** Per-user minimum interval between reverse-geocode requests (ms) */
    rateLimitMs: number;
  };
  email: {

    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
  };
}

export const config: EnvironmentConfig = {
  nodeEnv: (process.env.NODE_ENV as "development" | "production" | "test") || "development",
  isProduction: process.env.NODE_ENV === "production",
  isEmulator: Boolean(process.env.FUNCTIONS_EMULATOR || process.env.FIREBASE_EMULATOR_HUB),
  appName: process.env.APP_NAME || "MushBio",
  appUrl: process.env.APP_URL || "http://localhost:8080",
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || "",
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  },
  geocoding: {
    provider: "nominatim",
    userAgent: process.env.GEOCODING_USER_AGENT || "MushBio/1.0 (orders@mushbio.com)",
    rateLimitMs: parseInt(process.env.GEOCODING_RATE_LIMIT_MS || "5000", 10),
  },
  email: {

    host: process.env.SMTP_HOST || "localhost",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.EMAIL_FROM || "MushBio <orders@mushbio.com>",
  },
};
