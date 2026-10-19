import Elysia, { t } from "elysia";
import { natController } from "../controllers/nat.controller";
import { requireRoles } from "../middlewares/rbac.middleware";

const IPV4_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;
const idParam = t.Object({ id: t.String() });
const ruleParam = t.Object({ id: t.String(), ruleId: t.String() });

export const natRoutes = new Elysia({ prefix: "/vps" })
  // Read — users, support, admin
  .guard({ beforeHandle: requireRoles("users", "support", "admin") as any }, (app) =>
    app.get("/:id/port-rules", natController.listRules, {
      params: idParam,
      detail: { summary: "List NAT port rules for a VPS", tags: ["Port Rules"] },
    })
  )
  // Write — users (own VPS), admin (any VPS + system rules); support is read-only
  .guard({ beforeHandle: requireRoles("users", "admin") as any }, (app) =>
    app
      .post("/:id/port-rules", natController.addRule, {
        params: idParam,
        body: t.Object({
          privateIp: t.String({ pattern: IPV4_PATTERN.source }),
          privatePort: t.Number({ minimum: 1, maximum: 65535 }),
          protocol: t.Union([t.Literal("TCP"), t.Literal("UDP"), t.Literal("BOTH")]),
        }),
        detail: { summary: "Add a NAT port forwarding rule", tags: ["Port Rules"] },
      })
      .delete("/:id/port-rules/:ruleId", natController.deleteRule, {
        params: ruleParam,
        detail: { summary: "Delete a NAT port forwarding rule", tags: ["Port Rules"] },
      })
  );
