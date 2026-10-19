import Elysia, { t } from "elysia";
import { auditController } from "../controllers/audit.controller";
import { requireRoles } from "../middlewares/rbac.middleware";

export const auditRoutes = new Elysia({ prefix: "/audit-logs" })
  .guard({ beforeHandle: requireRoles("admin") as any }, (app) =>
    app.get("/", auditController.list, {
      query: t.Object({
        page:           t.Optional(t.String()),
        limit:          t.Optional(t.String()),
        actor_id:       t.Optional(t.String()),
        target_user_id: t.Optional(t.String()),
        entity:         t.Optional(t.String()),
        action:         t.Optional(t.String()),
        from:           t.Optional(t.String()),
        to:             t.Optional(t.String()),
      }),
      detail: { summary: "List audit logs with filters (ADMIN only)", tags: ["Audit Logs"] },
    })
  );
