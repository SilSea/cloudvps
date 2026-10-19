import Elysia, { t } from "elysia";
import { promotionController } from "../controllers/promotion.controller";

import { requireAuth, requireRoles } from "../middlewares/rbac.middleware";

const idParam = t.Object({ id: t.String() });

export const promotionRoutes = new Elysia({ prefix: "/promotions" })
  // Authenticated — validate promo code (users checking before ordering)
  .guard({ beforeHandle: requireAuth as any }, (app) =>
    app.post("/validate", promotionController.validate, {
      body: t.Object({ code: t.String({ minLength: 1 }) }),
      detail: { summary: "Validate a promotion code", tags: ["Promotions"] },
    })
  )
  // Admin only
  .guard({ beforeHandle: requireRoles("admin") as any }, (app) =>
    app
      .get("/", promotionController.list, {
        detail: { summary: "List all promotion codes", tags: ["Promotions"] },
      })
      .post("/", promotionController.create, {
        body: t.Object({
          code_name: t.String({ minLength: 1, maxLength: 150 }),
          description: t.String({ minLength: 1 }),
          type: t.Union([t.Literal("DISCOUNT"), t.Literal("PERCENT")]),
          discount: t.Number({ minimum: 0.01 }),
          expired_at: t.Optional(t.String()),
          max_uses: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
          max_uses_per_user: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
        }),
        detail: { summary: "Create a promotion code", tags: ["Promotions"] },
      })
      .put("/:id", promotionController.update, {
        params: idParam,
        body: t.Object({
          code_name: t.Optional(t.String({ minLength: 1, maxLength: 150 })),
          description: t.Optional(t.String({ minLength: 1 })),
          type: t.Optional(t.Union([t.Literal("DISCOUNT"), t.Literal("PERCENT")])),
          discount: t.Optional(t.Number({ minimum: 0.01 })),
          expired_at: t.Optional(t.Union([t.String(), t.Null()])),
          max_uses: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
          max_uses_per_user: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))),
        }),
        detail: { summary: "Update a promotion code", tags: ["Promotions"] },
      })
      .patch("/:id/status", promotionController.toggleStatus, {
        params: idParam,
        detail: { summary: "Toggle promotion status", tags: ["Promotions"] },
      })
  );
