// User controller — handles both self-service endpoints (/me) and admin
// endpoints (list / get by id / update / toggle status / change role / create).

import { prisma } from "../config/database";
import { redis } from "../config/redis";
import { hashPassword, verifyPassword } from "../utils/hash";
import { jwtUtils } from "../utils/jwt";
import { emailService } from "../services/email.service";
import { auditService } from "../services/audit.service";
import { logger } from "../utils/logger";

// Secure random password generator — uses Web Crypto API (not Math.random).
// Characters chosen to avoid ambiguous glyphs (0/O, l/1/I) for readability.
const PASSWORD_CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateSecurePassword(length = 16): string {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join("");
}

export const userController = {
  // Returns the full profile including personal info (users_info).
  async getMe({ user, set }: any) {
    const data = await prisma.users.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        status: true,
        is_verify: true,
        created_at: true,
        role: { select: { role_name: true } },
        users_info: true,
      },
    });
    if (!data) {
      set.status = 404;
      return { success: false, message: "User not found." };
    }
    return { success: true, data };
  },

  // Partial update of personal info — only allowed fields are passed to Prisma.
  async updateMe({ user, body, set }: any) {
    const { first_name, last_name, phone, address1, address2, address3, address4, address5, address6 } = body;
    const data = Object.fromEntries(
      Object.entries({ first_name, last_name, phone, address1, address2, address3, address4, address5, address6 })
        .filter(([, v]) => v !== undefined)
    );
    try {
      const updated = await prisma.users_info.update({ where: { user_id: user.id }, data });
      return { success: true, data: updated };
    } catch {
      set.status = 404;
      return { success: false, message: "Profile not found." };
    }
  },

  async changePassword({ user, body, set }: any) {
    const u = await prisma.users.findUnique({ where: { id: user.id } });

    // OAuth-only accounts have no password hash; block the change gracefully.
    if (!u?.password) {
      set.status = 400;
      return { success: false, message: "Cannot change password for this account." };
    }

    const valid = await verifyPassword(body.current_password, u.password);
    if (!valid) {
      set.status = 401;
      return { success: false, message: "Current password is incorrect." };
    }

    const hashed = await hashPassword(body.new_password);
    await prisma.users.update({ where: { id: user.id }, data: { password: hashed } });
    return { success: true, message: "Password changed successfully." };
  },

  async changeEmail({ user, body, set }: any) {
    const existing = await prisma.users.findUnique({ where: { email: body.email } });
    if (existing) {
      set.status = 409;
      return { success: false, message: "Email already in use." };
    }

    // Mark email unverified so the user must click the new verification link.
    await prisma.users.update({
      where: { id: user.id },
      data: { email: body.email, is_verify: false },
    });

    // Invalidate the refresh token to force re-login after the email change,
    // preventing a stale token from being used with the old email claim.
    await redis.del(`rt:${user.id}`);

    const verifyToken = await jwtUtils.signEmailVerify({ sub: user.id, email: body.email });
    try {
      await emailService.sendVerification(body.email, verifyToken);
    } catch (err) {
      logger.error("Failed to send email change verification", { userId: user.id, email: body.email, error: String(err) });
    }

    return {
      success: true,
      message: "Email updated. Please verify your new email address. You have been logged out.",
    };
  },

  // --- Admin / Support: create user ---

  async createUser({ user: actor, body, set, request }: any) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim();

    // Reject duplicate email immediately.
    const existing = await prisma.users.findUnique({ where: { email: body.email } });
    if (existing) {
      set.status = 409;
      return { success: false, message: "Email already in use." };
    }

    const usersRole = await prisma.roles.findFirst({ where: { role_name: "users" } });
    if (!usersRole) {
      set.status = 500;
      return { success: false, message: "Default role not found." };
    }

    const plainPassword = body.password ?? generateSecurePassword();
    const hashed = await hashPassword(plainPassword);

    // Auto-accept all currently active policies on behalf of the new user.
    const activePolicies = await prisma.policies.findMany({
      where: { status: true },
      select: { id: true },
    });

    const newUser = await prisma.$transaction(async (tx) => {
      return tx.users.create({
        data: {
          email: body.email,
          password: hashed,
          role_id: usersRole.id,
          // Admin-created accounts are pre-verified — no email link required.
          is_verify: true,
          users_info: {
            create: {
              first_name: body.first_name,
              last_name:  body.last_name,
              phone:      body.phone,
              address1:   body.address1,
              address2:   body.address2,
              address3:   body.address3,
              address4:   body.address4,
              address5:   body.address5,
              address6:   body.address6,
            },
          },
          consents: {
            create: activePolicies.map((p) => ({ policies_id: p.id })),
          },
        },
        select: {
          id: true,
          email: true,
          is_verify: true,
          created_at: true,
          role: { select: { role_name: true } },
        },
      });
    });

    // Send welcome email with temporary credentials.
    // Non-fatal: account already exists even if email fails.
    try {
      await emailService.sendWelcome(newUser.email, plainPassword);
    } catch (err) {
      logger.error("Failed to send welcome email", {
        userId: newUser.id,
        email: newUser.email,
        error: String(err),
      });
    }

    auditService.record({
      actorId:      actor.id,
      actorRole:    actor.role,
      action:       "CREATE",
      entity:       "USER",
      entityId:     newUser.id,
      targetUserId: newUser.id,
      metadata:     { email: newUser.email, policies_accepted: activePolicies.length },
      ipAddress:    ip,
    });

    logger.admin("user_created_by_admin", { actorId: actor.id, userId: newUser.id, email: newUser.email });

    return {
      success: true,
      data: newUser,
      // Return whether we auto-generated the password so the caller knows
      // to relay credentials to the user out-of-band if email delivery failed.
      password_generated: !body.password,
    };
  },

  // --- Admin / Support endpoints below ---

  // Paginated user list. Capped at 100 per page to avoid large DB scans.
  async listUsers({ query }: any) {
    const page = Math.max(1, parseInt(query?.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query?.limit ?? "20", 10)));
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.users.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          status: true,
          is_verify: true,
          created_at: true,
          role: { select: { role_name: true } },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.users.count(),
    ]);

    return { success: true, data: { users, total, page, limit } };
  },

  async getUserById({ params, set }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      set.status = 400;
      return { success: false, message: "Invalid user ID." };
    }

    const user = await prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        status: true,
        is_verify: true,
        created_at: true,
        role: { select: { role_name: true } },
        users_info: true,
      },
    });
    if (!user) {
      set.status = 404;
      return { success: false, message: "User not found." };
    }
    return { success: true, data: user };
  },

  async updateUser({ params, body, set }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      set.status = 400;
      return { success: false, message: "Invalid user ID." };
    }

    const { first_name, last_name, phone, address1, address2, address3, address4, address5, address6 } = body;
    const data = Object.fromEntries(
      Object.entries({ first_name, last_name, phone, address1, address2, address3, address4, address5, address6 })
        .filter(([, v]) => v !== undefined)
    );
    try {
      const updated = await prisma.users_info.update({ where: { user_id: id }, data });
      return { success: true, data: updated };
    } catch {
      set.status = 404;
      return { success: false, message: "User or profile not found." };
    }
  },

  // Flips the user's `status` boolean. Disabled users cannot log in.
  async toggleUserStatus({ user, params, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      set.status = 400;
      return { success: false, message: "Invalid user ID." };
    }

    const u = await prisma.users.findUnique({ where: { id }, select: { status: true } });
    if (!u) {
      set.status = 404;
      return { success: false, message: "User not found." };
    }

    const updated = await prisma.users.update({
      where: { id },
      data: { status: !u.status },
      select: { id: true, email: true, status: true },
    });

    // Invalidate the status cache immediately so the next request re-checks DB.
    await redis.del(`user_status:${id}`);

    auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: updated.status ? "ENABLE" : "DISABLE",
      entity: "USER",
      entityId: id,
      targetUserId: id,
      metadata: { previous_status: u.status },
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0].trim(),
    });

    return { success: true, data: updated };
  },

  async changeUserRole({ user, params, body, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      set.status = 400;
      return { success: false, message: "Invalid user ID." };
    }

    // Fetch current role for audit metadata (before/after comparison).
    const currentUser = await prisma.users.findUnique({
      where: { id },
      include: { role: { select: { role_name: true } } },
    });
    if (!currentUser) {
      set.status = 404;
      return { success: false, message: "User not found." };
    }

    const role = await prisma.roles.findFirst({ where: { role_name: body.role_name } });
    if (!role) {
      set.status = 400;
      return { success: false, message: "Invalid role name." };
    }

    const updated = await prisma.users.update({
      where: { id },
      data: { role_id: role.id },
      select: { id: true, email: true, role: { select: { role_name: true } } },
    });

    auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: "ROLE_CHANGE",
      entity: "USER",
      entityId: id,
      targetUserId: id,
      metadata: { from: currentUser.role.role_name, to: body.role_name },
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0].trim(),
    });

    return { success: true, data: updated };
  },
};
