import Elysia, { t } from "elysia";
import { broadcastController } from "../controllers/broadcast.controller";
import { requireRoles } from "../middlewares/rbac.middleware";
import { rateLimit } from "../middlewares/rate-limit.middleware";

const paginationQuery = t.Object({
  page:  t.Optional(t.String()),
  limit: t.Optional(t.String()),
});

export const broadcastRoutes = new Elysia({ prefix: "/broadcasts" })
  .guard({ beforeHandle: requireRoles("admin") as any }, (app) =>
    app
      .get("/", broadcastController.list, {
        query: paginationQuery,
        detail: { summary: "List broadcast history (ADMIN only)", tags: ["Broadcasts"] },
      })
      .get("/:id", broadcastController.getById, {
        params: t.Object({ id: t.Numeric() }),
        detail: { summary: "Get broadcast by ID (ADMIN only)", tags: ["Broadcasts"] },
      })
      .use(rateLimit({ limit: 5, windowSec: 3600, keyPrefix: "broadcast" }) as any)
      .post("/", broadcastController.send, {
        body: t.Object({
          subject: t.String({ minLength: 1, maxLength: 200 }),
          body:    t.String({ minLength: 1 }),
          type:    t.Union([
            t.Literal("MAINTENANCE"),
            t.Literal("EMERGENCY"),
            t.Literal("ANNOUNCEMENT"),
          ]),
          target:  t.Union([
            t.Literal("ALL"),
            t.Literal("ACTIVE_VPS"),
            t.Literal("EXPIRING_SOON"),
          ]),
        }),
        detail: { summary: "Send broadcast email to target group (ADMIN only, 5/hr)", tags: ["Broadcasts"] },
      })
  );
