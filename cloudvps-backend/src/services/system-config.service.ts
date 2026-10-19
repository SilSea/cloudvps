import { prisma } from "../config/database";
import { redis } from "../config/redis";

const CACHE_TTL_SEC = 60;
const CACHE_PREFIX = "syscfg:";
const NULL_SENTINEL = "__NULL__";

export const systemConfigService = {
  // Returns DB value if set, null if unset (caller falls back to env var).
  // Both null and non-null values are cached in Redis (using sentinel for null)
  // to prevent repeated DB hits when config keys are unset.
  async get(key: string): Promise<string | null> {
    const cached = await redis.get(`${CACHE_PREFIX}${key}`).catch(() => null);
    if (cached !== null) return cached === NULL_SENTINEL ? null : cached;

    const row = await prisma.system_configs.findUnique({ where: { key } });
    const value = row?.value ?? null;

    const cacheValue = value !== null ? value : NULL_SENTINEL;
    await redis.set(`${CACHE_PREFIX}${key}`, cacheValue, "EX", CACHE_TTL_SEC).catch(() => {});

    return value;
  },

  // Updates value in DB, invalidates Redis cache. Pass null to reset to env fallback.
  async set(key: string, value: string | null, actorId: number): Promise<void> {
    await prisma.system_configs.update({
      where: { key },
      data: { value, updated_by: actorId },
    });
    await redis.del(`${CACHE_PREFIX}${key}`).catch(() => {});
  },

  // Returns all config entries. Secret values are masked as "***".
  async list() {
    const rows = await prisma.system_configs.findMany({
      orderBy: [{ category: "asc" }, { key: "asc" }],
      include: { updater: { select: { id: true, email: true } } },
    });
    return rows.map((r) => ({
      ...r,
      value: r.is_secret && r.value !== null ? "***" : r.value,
    }));
  },

  // Flush cache-only Redis keys (rate limits, syscfg, user status, provision locks).
  // Deliberately skips rt:* (refresh tokens) and token_block:* (blocklist).
  async flushCache(): Promise<{ deleted: number; patterns: string[] }> {
    const patterns = ["rl:*", "syscfg:*", "user_status:*", "provision_lock:*"];
    let deleted = 0;
    for (const pattern of patterns) {
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = next;
        if (keys.length) {
          await redis.del(...keys);
          deleted += keys.length;
        }
      } while (cursor !== "0");
    }
    return { deleted, patterns };
  },

  // Returns single config entry. Secret value masked.
  async getOne(key: string) {
    const row = await prisma.system_configs.findUnique({
      where: { key },
      include: { updater: { select: { id: true, email: true } } },
    });
    if (!row) return null;
    return {
      ...row,
      value: row.is_secret && row.value !== null ? "***" : row.value,
    };
  },
};
