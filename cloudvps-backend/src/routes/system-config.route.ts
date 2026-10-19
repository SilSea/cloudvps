import Elysia, { t } from "elysia";
import { requireAuth } from "../middlewares/rbac.middleware";
import { systemConfigController } from "../controllers/system-config.controller";
import { requireRoles } from "../middlewares/rbac.middleware";

const keyParam = t.Object({ key: t.String() });

export const systemConfigRoutes = new Elysia({ prefix: "/system-configs" })
  // All authenticated users can read unit pricing (used for client-side upgrade cost preview)
  .guard({ beforeHandle: requireAuth as any }, (app) =>
    app.guard({ beforeHandle: requireRoles("users", "support", "admin") as any }, (inner) =>
      inner
        .get("/pricing", systemConfigController.getPricing, {
          detail: { summary: "Get unit pricing for custom upgrade cost preview", tags: ["System Config"] },
        })
        .get("/payment-info", systemConfigController.getPaymentInfo, {
          detail: { summary: "Get payment info (PromptPay ID) for checkout display", tags: ["System Config"] },
        })
    )
  )
  // Admin and Support can read configs (secrets masked)
  .guard({ beforeHandle: requireRoles("admin", "support") as any }, (app) =>
    app
      .get("/", systemConfigController.list, {
        detail: { summary: "List all system configs (secrets masked)", tags: ["System Config"] },
      })
      .get("/:key", systemConfigController.getOne, {
        params: keyParam,
        detail: { summary: "Get single config by key", tags: ["System Config"] },
      })

      // Admin only: update config values + cache management
      .guard({ beforeHandle: requireRoles("admin") as any }, (inner) =>
        inner
          .put("/:key", systemConfigController.update, {
            params: keyParam,
            body: t.Object({
              value: t.Union([t.String({ minLength: 1 }), t.Null()]),
            }),
            detail: { summary: "Update config value (null = reset to env fallback)", tags: ["System Config"] },
          })
          .delete("/cache/flush", systemConfigController.flushCache, {
            detail: { summary: "Flush Redis cache keys (rate limits, syscfg, user_status, provision locks)", tags: ["System Config"] },
          })
      )
  );
