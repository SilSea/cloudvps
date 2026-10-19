import Elysia from "elysia";
import { jwtUtils } from "../utils/jwt";
import { redis } from "../config/redis";
import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import type { AuthUser } from "../types";

// Named plugin ("cloudvps.auth-middleware") so Elysia deduplicates it when
// the plugin is `.use()`d in multiple route groups — only one instance runs.
export const authMiddleware = new Elysia({ name: "cloudvps.auth-middleware" }).derive(
  { as: "global" },
  async ({ headers }) => {
    const auth = headers.authorization;

    // No Bearer token → inject null so RBAC guards can return 401.
    // Do NOT throw here; some routes (e.g. /register, /login) are public.
    if (!auth?.startsWith("Bearer ")) {
      return { user: null as AuthUser | null };
    }

    const token = auth.slice(7);

    // Step 1: verify JWT signature — any failure here means invalid token.
    let payload: any;
    try {
      payload = await jwtUtils.verifyAccess(token);
    } catch (err) {
      logger.error("Auth middleware: JWT verify failed", { error: String(err) });
      return { user: null as AuthUser | null };
    }

    // Reject tokens with type !== "access" (e.g. email-verify tokens).
    if (payload.type !== "access") return { user: null as AuthUser | null };

    // AUTH-SEC-1: reject tokens that were explicitly invalidated on logout.
    try {
      const blocked = await redis.get(`token_block:${token}`);
      if (blocked) return { user: null as AuthUser | null };
    } catch {
      // Non-fatal: if Redis is unreachable, fall through — JWT expiry is still enforced.
    }

    // Step 2: check user status via Redis cache (TTL 30s).
    // If Redis or DB is unreachable, fail open so a valid JWT still grants access.
    // A separate monitoring alert should fire on repeated errors here.
    let isActive = true;
    try {
      const cacheKey = `user_status:${payload.sub}`;
      const cached = await redis.get(cacheKey);

      if (cached !== null) {
        isActive = cached === "1";
      } else {
        const dbUser = await prisma.users.findUnique({
          where: { id: payload.sub },
          select: { status: true },
        });
        if (!dbUser) return { user: null as AuthUser | null };
        isActive = dbUser.status;
        await redis.set(cacheKey, isActive ? "1" : "0", "EX", 30);
      }
    } catch (err) {
      logger.error("Auth middleware: status check failed, failing open", {
        userId: payload.sub,
        error: String(err),
      });
    }

    if (!isActive) {
      return { user: null as AuthUser | null };
    }

    return {
      user: {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        status: true,
        is_verify: true,
      } as AuthUser,
    };
  }
);

