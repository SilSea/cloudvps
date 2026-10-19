import Elysia, { t } from "elysia";
import { authController } from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/rbac.middleware";
import { rateLimit } from "../middlewares/rate-limit.middleware";

export const authRoutes = new Elysia({ prefix: "/auth" })
  // General rate limit for all auth endpoints (10 req/min per IP).
  .use(rateLimit({ limit: 10, windowSec: 60, keyPrefix: "auth" }))
  .post("/register", authController.register, {
    body: t.Object({
      email: t.String({ format: "email" }),
      password: t.String({ minLength: 8, maxLength: 100 }),
      first_name: t.String({ minLength: 1, maxLength: 150 }),
      last_name: t.String({ minLength: 1, maxLength: 150 }),
      phone: t.String({ pattern: "^[0-9]{10}$" }),
      address1: t.String({ minLength: 1 }),
      address2: t.Optional(t.String()),
      address3: t.String({ minLength: 1, maxLength: 100 }),
      address4: t.String({ minLength: 1, maxLength: 100 }),
      address5: t.String({ pattern: "^[0-9]{5}$" }),
      address6: t.String({ minLength: 1, maxLength: 50 }),
      policy_ids: t.Array(t.Number(), { minItems: 1 }),
    }),
    detail: { summary: "Register a new user account", tags: ["Auth"] },
  })
  // Login gets a stricter limit (5 req/15 min) in addition to the general limit,
  // matching SEC-1.5: 5 failed attempts per 15 minutes per IP.
  .group("", (app) =>
    app
      .use(rateLimit({ limit: 5, windowSec: 900, keyPrefix: "login" }))
      .post("/login", authController.login, {
        body: t.Object({
          email: t.String({ format: "email" }),
          password: t.String({ minLength: 1 }),
        }),
        detail: { summary: "Login with email and password", tags: ["Auth"] },
      })
  )
  .post("/refresh", authController.refresh, {
    body: t.Object({
      refresh_token: t.String({ minLength: 1 }),
    }),
    detail: { summary: "Refresh access token", tags: ["Auth"] },
  })
  .get("/verify/:token", authController.verifyEmail, {
    params: t.Object({ token: t.String() }),
    detail: { summary: "Verify email address", tags: ["Auth"] },
  })
  .guard({ beforeHandle: requireAuth as any }, (app) =>
    app
      .post("/logout", authController.logout, {
        detail: { summary: "Logout and invalidate refresh token", tags: ["Auth"] },
      })
      .get("/me", authController.me, {
        detail: { summary: "Get current user info", tags: ["Auth"] },
      })
  );
