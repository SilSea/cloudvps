import Elysia, { t } from "elysia";
import { userController } from "../controllers/user.controller";

import { requireAuth, requireRoles } from "../middlewares/rbac.middleware";

const userInfoBody = t.Object({
  first_name: t.Optional(t.String({ minLength: 1, maxLength: 150 })),
  last_name: t.Optional(t.String({ minLength: 1, maxLength: 150 })),
  phone: t.Optional(t.String({ pattern: "^[0-9]{10}$" })),
  address1: t.Optional(t.String({ minLength: 1 })),
  address2: t.Optional(t.String()),
  address3: t.Optional(t.String({ maxLength: 100 })),
  address4: t.Optional(t.String({ maxLength: 100 })),
  address5: t.Optional(t.String({ pattern: "^[0-9]{5}$" })),
  address6: t.Optional(t.String({ maxLength: 50 })),
});

const idParam = t.Object({ id: t.String() });

export const userRoutes = new Elysia({ prefix: "/users" })
  // All authenticated users
  .guard({ beforeHandle: requireAuth as any }, (app) =>
    app
      .get("/me", userController.getMe, {
        detail: { summary: "Get own profile with personal info", tags: ["Users"] },
      })
      .put("/me", userController.updateMe, {
        body: userInfoBody,
        detail: { summary: "Update own personal info", tags: ["Users"] },
      })
      .put("/me/password", userController.changePassword, {
        body: t.Object({
          current_password: t.String({ minLength: 1 }),
          new_password: t.String({ minLength: 8, maxLength: 100 }),
        }),
        detail: { summary: "Change own password", tags: ["Users"] },
      })
      .put("/me/email", userController.changeEmail, {
        body: t.Object({ email: t.String({ format: "email" }) }),
        detail: { summary: "Change own email address", tags: ["Users"] },
      })
  )
  // Admin + Support
  .guard({ beforeHandle: requireRoles("admin", "support") as any }, (app) =>
    app
      .post("/", userController.createUser, {
        body: t.Object({
          email:     t.String({ format: "email" }),
          password:  t.Optional(t.String({ minLength: 8, maxLength: 100 })),
          first_name: t.String({ minLength: 1, maxLength: 150 }),
          last_name:  t.String({ minLength: 1, maxLength: 150 }),
          phone:      t.String({ pattern: "^[0-9]{10}$" }),
          address1:   t.String({ minLength: 1 }),
          address2:   t.Optional(t.String()),
          address3:   t.String({ maxLength: 100 }),
          address4:   t.String({ maxLength: 100 }),
          address5:   t.String({ pattern: "^[0-9]{5}$" }),
          address6:   t.String({ maxLength: 50 }),
        }),
        detail: {
          summary: "Create user account (admin/support) — auto-accepts active policies",
          tags: ["Users"],
        },
      })
      .get("/", userController.listUsers, {
        query: t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
        detail: { summary: "List all users with pagination", tags: ["Users"] },
      })
      .get("/:id", userController.getUserById, {
        params: idParam,
        detail: { summary: "Get user by ID", tags: ["Users"] },
      })
      .put("/:id", userController.updateUser, {
        params: idParam,
        body: userInfoBody,
        detail: { summary: "Update user personal info", tags: ["Users"] },
      })
  )
  // Admin only
  .guard({ beforeHandle: requireRoles("admin") as any }, (app) =>
    app
      .patch("/:id/status", userController.toggleUserStatus, {
        params: idParam,
        detail: { summary: "Toggle user active status", tags: ["Users"] },
      })
      .patch("/:id/role", userController.changeUserRole, {
        params: idParam,
        body: t.Object({
          role_name: t.Union([t.Literal("admin"), t.Literal("support"), t.Literal("users")]),
        }),
        detail: { summary: "Change user role", tags: ["Users"] },
      })
  );
