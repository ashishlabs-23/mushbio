/**
 * ============================================================================
 * MUSHBIO REVERSE GEOCODING SERVICE (PHASE 10A)
 *
 * Provider: Nominatim (OpenStreetMap) — free, no API key required.
 * Usage policy: max 1 request/second, User-Agent header required.
 *
 * Privacy:
 *   - Coordinates are NEVER logged exactly; only "reverse_geocode_requested" is logged.
 *   - GPS is collected only on explicit user action (no background tracking).
 *   - Per-user cooldown: 5 seconds (in-process Map, suitable for Cloud Functions).
 *   - Coordinate cache: rounded to 3 decimal places (~100m grid) for cache key only.
 *     The actual stored delivery coordinates are the user's original precise values.
 *
 * ============================================================================
 */

import { ReverseGeocodeInput, ReverseGeocodeResult } from "./schemas";
import { safeLogger } from "../utils/logger";

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/reverse";

// In-process rate limiter: userId -> last request timestamp (ms)
const userLastRequest = new Map<string, number>();

// Coordinate cache: rounded key -> result (cache up to 200 entries)
const geocodeCache = new Map<string, ReverseGeocodeResult>();
const MAX_CACHE_SIZE = 200;
const COORDINATE_ROUND_PRECISION = 3; // ~100m grid

// Per-user cooldown in milliseconds
const RATE_LIMIT_MS = 5000;

/**
 * Round coordinate to N decimal places for cache key only.
 * Never use rounded values as stored delivery coordinates.
 */
function roundCoord(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

function buildCacheKey(lat: number, lng: number): string {
  return `${roundCoord(lat, COORDINATE_ROUND_PRECISION)},${roundCoord(lng, COORDINATE_ROUND_PRECISION)}`;
}

/**
 * Normalize Nominatim response to our internal format.
 * Handles Indian address field quirks.
 */
function normalizeNominatimResponse(
  data: Record<string, any>,
  lat: number,
  lng: number
): ReverseGeocodeResult {
  const addr = data.address || {};

  // Build line1 from available granular fields
  const parts: string[] = [];
  if (addr.house_number) parts.push(addr.house_number);
  if (addr.road || addr.pedestrian || addr.footway) {
    parts.push(addr.road || addr.pedestrian || addr.footway);
  }
  if (addr.neighbourhood || addr.suburb) {
    parts.push(addr.neighbourhood || addr.suburb);
  }
  const line1 = parts.join(", ") || data.display_name?.split(",")[0] || "Unknown Street";

  // Line2: village, quarter, locality
  const line2Parts: string[] = [];
  if (addr.village || addr.town || addr.hamlet) {
    line2Parts.push(addr.village || addr.town || addr.hamlet);
  }
  if (addr.county || addr.district) {
    line2Parts.push(addr.county || addr.district);
  }
  const line2 = line2Parts.join(", ") || undefined;

  // City: city > town > village > suburb
  const city =
    addr.city || addr.town || addr.village || addr.suburb || addr.county || "Unknown City";

  // State
  const state = addr.state || addr.region || "Unknown State";

  // Postal code
  const postalCode = addr.postcode || "";

  // Country code (ISO 3166-1 alpha-2, uppercase)
  const country = (addr.country_code || "IN").toUpperCase();

  // Formatted address (human-readable)
  const formattedAddress = data.display_name || `${line1}, ${city}, ${state} ${postalCode}, ${country}`;

  return {
    formattedAddress,
    line1,
    line2,
    city,
    state,
    postalCode,
    country,
    latitude: lat,
    longitude: lng,
  };
}

export class ReverseGeocodeService {
  private userAgent: string;

  constructor(userAgent = "MushBio/1.0 (orders@mushbio.com)") {
    this.userAgent = userAgent;
  }

  /**
   * Reverse geocode latitude/longitude to a postal address.
   *
   * @param userId - Used for per-user rate limiting
   * @param input  - Validated coordinates
   */
  async reverseGeocode(
    userId: string,
    input: ReverseGeocodeInput
  ): Promise<ReverseGeocodeResult> {
    const { latitude, longitude } = input;

    // 1. Per-user rate limit check
    const now = Date.now();
    const lastRequest = userLastRequest.get(userId) || 0;
    if (now - lastRequest < RATE_LIMIT_MS) {
      const waitSec = ((RATE_LIMIT_MS - (now - lastRequest)) / 1000).toFixed(1);
      throw new Error(`RATE_LIMIT_EXCEEDED: Please wait ${waitSec}s before requesting location again`);
    }
    userLastRequest.set(userId, now);

    // 2. Check coordinate cache (rounded grid key)
    const cacheKey = buildCacheKey(latitude, longitude);
    const cached = geocodeCache.get(cacheKey);
    if (cached) {
      safeLogger.debug("reverse_geocode_cache_hit", { cacheKey });
      // Return cached result but with the user's actual precise coordinates
      return { ...cached, latitude, longitude };
    }

    // 3. Log without precise coordinates (privacy)
    safeLogger.info("reverse_geocode_requested", { locationSource: "GPS" });

    // 4. Call Nominatim
    const url = new URL(NOMINATIM_BASE_URL);
    url.searchParams.set("lat", latitude.toString());
    url.searchParams.set("lon", longitude.toString());
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "User-Agent": this.userAgent,
          "Accept-Language": "en",
        },
      });
    } catch (networkErr) {
      safeLogger.error("reverse_geocode_network_error", { error: String(networkErr) });
      throw new Error("GEOCODE_NETWORK_ERROR: Unable to reach geocoding service");
    }

    if (!response.ok) {
      safeLogger.error("reverse_geocode_provider_error", { status: response.status });
      throw new Error(`GEOCODE_PROVIDER_ERROR: Geocoding service returned ${response.status}`);
    }

    const data = await response.json();

    if (!data || !data.address) {
      throw new Error("GEOCODE_NO_RESULT: No address found for these coordinates");
    }

    const result = normalizeNominatimResponse(data, latitude, longitude);

    // 5. Cache the result (evict if full)
    if (geocodeCache.size >= MAX_CACHE_SIZE) {
      const firstKey = geocodeCache.keys().next().value;
      if (firstKey) geocodeCache.delete(firstKey);
    }
    geocodeCache.set(cacheKey, result);

    return result;
  }
}

export const reverseGeocodeService = new ReverseGeocodeService();
