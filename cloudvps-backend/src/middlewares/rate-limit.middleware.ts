import Elysia from "elysia";
import { redis } from "../config/redis";
import { logger } from "../utils/logger";

interface RateLimitOptions {
  limit: number;      // Max requests allowed within the window
  windowSec: number;  // Window duration in seconds
  keyPrefix: string;  // Namespace to isolate counters for different route groups
}

// Factory that returns an Elysia plugin scoped to a keyPrefix.
// The plugin name includes the prefix so multiple instances can coexist without
// Elysia's deduplication logic merging them into one.
export const rateLimit = ({ limit, windowSec, keyPrefix }: RateLimitOptions) =>
  new Elysia({ name: `cloudvps.rate-limit.${keyPrefix}` })
    .derive({ as: "global" }, ({ request }) => ({
      // Prefer X-Forwarded-For (set by a reverse proxy) over the direct socket IP.
      clientIp:
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown",
    }))
    .onBeforeHandle({ as: "global" }, async ({ clientIp, set }) => {
      if (process.env.RATE_LIMIT_DISABLED === "1") return;
      const key = `rl:${keyPrefix}:${clientIp}`;
      try {
        // INCR is atomic. On the very first request (count === 1) we set the TTL,
        // which starts the sliding window. Subsequent requests within the window
        // just increment the counter without resetting the TTL.
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, windowSec);

        if (count > limit) {
          set.status = 429;
          return { success: false, message: "Too many requests. Please try again later." };
        }
      } catch (err) {
        logger.error("Rate limit: Redis error, failing open", { key, error: String(err) });
      }
    });
