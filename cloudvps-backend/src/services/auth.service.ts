import { prisma } from "../config/database";
import { redis } from "../config/redis";
import { hashPassword, verifyPassword } from "../utils/hash";
import { jwtUtils } from "../utils/jwt";
import { logger } from "../utils/logger";
import { emailService } from "./email.service";
import type { AuthUser, RoleName } from "../types";

// Refresh token TTL must match the JWT expiry set in jwtUtils.signRefresh (7 days).
const RT_TTL_SEC = 7 * 24 * 60 * 60;

// Redis key for a user's refresh token. One slot per user enforces single-session.
const rtKey = (userId: number) => `rt:${userId}`;

interface RegisterData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone: string;
  address1: string;
  address2?: string;
  address3: string;
  address4: string;
  address5: string;
  address6: string;
  policy_ids: number[];
}

export const authService = {
  async register(data: RegisterData) {
    const existing = await prisma.users.findUnique({ where: { email: data.email } });
    if (existing) throw new Error("EMAIL_TAKEN");

    // Require consent for every currently active policy. If new policies are
    // published between the frontend fetch and the submit, the user must re-accept.
    const activePolicies = await prisma.policies.findMany({
      where: { status: true },
      select: { id: true },
    });
    const activePolicyIds = activePolicies.map((p) => p.id);
    const missing = activePolicyIds.filter((id) => !data.policy_ids.includes(id));
    if (missing.length > 0) throw new Error("MISSING_POLICY_CONSENT");

    const usersRole = await prisma.roles.findFirst({ where: { role_name: "users" } });
    if (!usersRole) throw new Error("ROLE_NOT_FOUND");

    const hashed = await hashPassword(data.password);

    // Wrap user + profile + consents in a single transaction so a partial failure
    // doesn't leave an account without a profile or without required consents.
    const user = await prisma.$transaction(async (tx) => {
      return tx.users.create({
        data: {
          email: data.email,
          password: hashed,
          role_id: usersRole.id,
          users_info: {
            create: {
              first_name: data.first_name,
              last_name: data.last_name,
              phone: data.phone,
              address1: data.address1,
              address2: data.address2,
              address3: data.address3,
              address4: data.address4,
              address5: data.address5,
              address6: data.address6,
            },
          },
          consents: {
            create: activePolicyIds.map((pid) => ({ policies_id: pid })),
          },
        },
      });
    });

    const verifyToken = await jwtUtils.signEmailVerify({ sub: user.id, email: user.email });
    try {
      await emailService.sendVerification(user.email, verifyToken);
    } catch (err) {
      // Email failure must not roll back a completed registration.
      // The user can request a resend; the account exists and is pending verification.
      logger.error("Failed to send verification email", {
        userId: user.id,
        email: user.email,
        error: String(err),
      });
    }

    logger.auth("register", { userId: user.id, email: user.email });
    return { message: "Registration successful. Please verify your email." };
  },

  async login(data: { email: string; password: string; ip?: string }) {
    const user = await prisma.users.findUnique({
      where: { email: data.email },
      include: { role: { select: { role_name: true } } },
    });

    // Return the same error for "no user" and "wrong password" to prevent
    // user-enumeration attacks.
    if (!user || !user.password) {
      logger.auth("login_failed", { email: data.email, reason: "user_not_found", ip: data.ip });
      throw new Error("INVALID_CREDENTIALS");
    }
    if (!user.status) {
      logger.auth("login_failed", { email: data.email, reason: "account_disabled", ip: data.ip });
      throw new Error("ACCOUNT_DISABLED");
    }

    const valid = await verifyPassword(data.password, user.password);
    if (!valid) {
      logger.auth("login_failed", { email: data.email, reason: "wrong_password", ip: data.ip });
      throw new Error("INVALID_CREDENTIALS");
    }

    const role = user.role.role_name as RoleName;
    const tokenPayload = { sub: user.id, email: user.email, role };

    // Issue both tokens in parallel to reduce latency.
    const [accessToken, refreshToken] = await Promise.all([
      jwtUtils.signAccess(tokenPayload),
      jwtUtils.signRefresh(tokenPayload),
    ]);

    // Overwrite any previous refresh token — enforces single active session per user.
    await redis.setex(rtKey(user.id), RT_TTL_SEC, refreshToken);

    // Check for active policies not yet accepted (REQ-4.5). Frontend should prompt
    // re-acceptance when this array is non-empty before allowing further actions.
    const activePolicies = await prisma.policies.findMany({ where: { status: true }, select: { id: true } });
    const accepted = await prisma.consents.findMany({
      where: { users_id: user.id, policies_id: { in: activePolicies.map((p) => p.id) } },
      select: { policies_id: true },
    });
    const acceptedIds = new Set(accepted.map((c) => c.policies_id));
    const pendingPolicyIds = activePolicies.map((p) => p.id).filter((id) => !acceptedIds.has(id));

    logger.auth("login_success", { userId: user.id, ip: data.ip });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role,
        is_verify: user.is_verify,
      },
      pending_policy_ids: pendingPolicyIds,
    };
  },

  async refreshToken(token: string) {
    let payload;
    try {
      payload = await jwtUtils.verifyRefresh(token);
    } catch {
      throw new Error("INVALID_TOKEN");
    }

    // Compare against the token stored in Redis. If it doesn't match, the token
    // was already rotated or the user logged out — reject to prevent reuse.
    const stored = await redis.get(rtKey(payload.sub));
    if (!stored || stored !== token) throw new Error("INVALID_TOKEN");

    const newAccess = await jwtUtils.signAccess({
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
    });

    return { access_token: newAccess };
  },

  async logout(userId: number, accessToken: string) {
    // Invalidate refresh token immediately.
    await redis.del(rtKey(userId));

    // AUTH-SEC-1: add the access token to a Redis blocklist so it cannot be
    // reused within its remaining 15-min window even after logout. TTL matches
    // whatever is left on the token so the key expires on its own.
    try {
      const payload = await jwtUtils.verifyAccess(accessToken).catch(() => null);
      if (payload?.exp) {
        const ttl = payload.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await redis.set(`token_block:${accessToken}`, "1", "EX", ttl);
        }
      }
    } catch {
      // Non-fatal: if blocklist write fails, the token will naturally expire.
    }

    logger.auth("logout", { userId });
  },

  async verifyEmail(token: string) {
    let payload: any;
    try {
      payload = await jwtUtils.verifyAccess(token);
    } catch {
      throw new Error("INVALID_TOKEN");
    }

    // The `type` claim distinguishes email-verify tokens from regular access tokens,
    // both of which are signed with the same accessSecret.
    if (payload.type !== "email_verify") throw new Error("INVALID_TOKEN");

    await prisma.users.update({
      where: { id: payload.sub },
      data: { is_verify: true },
    });

    logger.auth("email_verified", { userId: payload.sub });
    return { message: "Email verified successfully." };
  },

  async getMe(userId: number): Promise<AuthUser> {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: { role: { select: { role_name: true } } },
    });
    if (!user) throw new Error("USER_NOT_FOUND");

    return {
      id: user.id,
      email: user.email,
      role: user.role.role_name as RoleName,
      status: user.status,
      is_verify: user.is_verify,
    };
  },
};
