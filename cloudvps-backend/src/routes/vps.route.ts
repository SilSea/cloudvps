import Elysia, { t } from "elysia";
import { vpsController } from "../controllers/vps.controller";
import { requireAuth, requireRoles } from "../middlewares/rbac.middleware";
import { rateLimit } from "../middlewares/rate-limit.middleware";

const idParam = t.Object({ id: t.String() });
const paginationQuery = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
});

export const vpsRoutes = new Elysia({ prefix: "/vps" })
  .guard({ beforeHandle: requireAuth as any }, (app) =>
    app
      // ── Read endpoints (no rate limit) ────────────────────────────────────────
      .get("/", vpsController.list, {
        query: paginationQuery,
        detail: { summary: "List VPS (own for USER, all for ADMIN/SUPPORT)", tags: ["VPS"] },
      })
      .get("/:id", vpsController.getById, {
        params: idParam,
        detail: { summary: "Get VPS details", tags: ["VPS"] },
      })
      .get("/:id/status", vpsController.liveStatus, {
        params: idParam,
        detail: { summary: "Get live VPS status from Proxmox (CPU, RAM, uptime)", tags: ["VPS"] },
      })

      // ── Action endpoints (rate limited: 10 req/min per IP) ───────────────────
      .guard({}, (inner) =>
        inner
          .use(rateLimit({ limit: 10, windowSec: 60, keyPrefix: "vps" }) as any)
          .post("/:id/start", vpsController.start, {
            params: idParam,
            detail: { summary: "Start VPS", tags: ["VPS"] },
          })
          .post("/:id/stop", vpsController.stop, {
            params: idParam,
            detail: { summary: "Stop VPS", tags: ["VPS"] },
          })
          .post("/:id/reboot", vpsController.reboot, {
            params: idParam,
            detail: { summary: "Reboot VPS", tags: ["VPS"] },
          })
          .post("/:id/reset", vpsController.reset, {
            params: idParam,
            detail: { summary: "Force reset VPS (ACPI hard reset)", tags: ["VPS"] },
          })
          .post("/:id/change-password/request", vpsController.requestPasswordChange, {
            params: idParam,
            detail: { summary: "Request OTP to change VPS OS password (sent to registered email)", tags: ["VPS"] },
          })
          .post("/:id/change-password/confirm", vpsController.confirmPasswordChange, {
            params: idParam,
            body: t.Object({ otp: t.String(), new_password: t.String() }),
            detail: { summary: "Confirm OTP and change VPS OS password via guest agent", tags: ["VPS"] },
          })
          .post("/:id/renew", vpsController.renewVps, {
            params: idParam,
            body: t.Object({ promo_code: t.Optional(t.String()) }),
            detail: { summary: "Create renewal order for existing VPS", tags: ["VPS"] },
          })
          .patch("/:id/auto-renew", vpsController.toggleAutoRenew, {
            params: idParam,
            body: t.Object({
              auto_renew: t.Boolean(),
              locked_promo_id: t.Optional(t.Nullable(t.Number())),
            }),
            detail: { summary: "Toggle auto-renew and lock a promo code for automatic renewal", tags: ["VPS"] },
          })
      )

      // ── Admin/Support only ────────────────────────────────────────────────────
      .guard({ beforeHandle: requireRoles("admin", "support") as any }, (app) =>
        app
          .get("/queue", vpsController.getQueue, {
            detail: { summary: "List pending/failed provisioning queue", tags: ["VPS"] },
          })
          .use(rateLimit({ limit: 10, windowSec: 60, keyPrefix: "vps_provision" }) as any)
          .post("/provision/:orderId", vpsController.provision, {
            params: t.Object({ orderId: t.String() }),
            detail: { summary: "Manual retry provisioning for an order", tags: ["VPS"] },
          })
      )

      // ── Admin only ────────────────────────────────────────────────────────────
      .guard({ beforeHandle: requireRoles("admin") as any }, (app) =>
        app
          .delete("/:id", vpsController.forceDelete, {
            params: t.Object({ id: t.Numeric() }),
            detail: { summary: "Force delete VPS immediately, bypassing grace period (ADMIN only)", tags: ["VPS"] },
          })
      )
  );
