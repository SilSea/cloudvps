// Auth controller — maps service errors (string codes) to HTTP status codes
// and response shapes. Business logic lives in authService, not here.

import { authService } from "../services/auth.service";

export const authController = {
  async register({ body, set }: any) {
    try {
      const result = await authService.register(body);
      set.status = 201;
      return { success: true, ...result };
    } catch (err: any) {
      if (err.message === "EMAIL_TAKEN") {
        set.status = 409;
        return { success: false, message: "Email already registered." };
      }
      if (err.message === "MISSING_POLICY_CONSENT") {
        set.status = 400;
        return { success: false, message: "You must accept all active policies." };
      }
      if (err.message === "ROLE_NOT_FOUND") {
        // The "users" role must be seeded before any registration can succeed.
        set.status = 500;
        return { success: false, message: "Server configuration error." };
      }
      throw err;
    }
  },

  async login({ body, request, set }: any) {
    try {
      // Extract client IP for audit logging; may be undefined behind no proxy.
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? undefined;
      const result = await authService.login({ ...body, ip });
      return { success: true, data: result };
    } catch (err: any) {
      if (err.message === "INVALID_CREDENTIALS") {
        set.status = 401;
        return { success: false, message: "Invalid email or password." };
      }
      if (err.message === "ACCOUNT_DISABLED") {
        set.status = 403;
        return { success: false, message: "Your account has been disabled." };
      }
      throw err;
    }
  },

  async refresh({ body, set }: any) {
    try {
      const result = await authService.refreshToken(body.refresh_token);
      return { success: true, data: result };
    } catch {
      set.status = 401;
      return { success: false, message: "Invalid or expired refresh token." };
    }
  },

  async logout({ user, headers }: any) {
    const token = (headers.authorization as string | undefined)?.slice(7) ?? "";
    await authService.logout(user.id, token);
    return { success: true, message: "Logged out successfully." };
  },

  async verifyEmail({ params, set }: any) {
    try {
      const result = await authService.verifyEmail(params.token);
      return { success: true, ...result };
    } catch {
      set.status = 400;
      return { success: false, message: "Invalid or expired verification token." };
    }
  },

  async me({ user, set }: any) {
    try {
      const result = await authService.getMe(user.id);
      return { success: true, data: result };
    } catch {
      set.status = 404;
      return { success: false, message: "User not found." };
    }
  },
};
