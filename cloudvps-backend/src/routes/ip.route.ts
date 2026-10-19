import Elysia, { t } from "elysia";
import { ipController } from "../controllers/ip.controller";
import { requireRoles } from "../middlewares/rbac.middleware";

const idParam = t.Object({ id: t.String() });
const IPV4_PATTERN = "^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$";
const ipv4Field = t.String({ minLength: 7, maxLength: 15, pattern: IPV4_PATTERN });

export const ipRoutes = new Elysia({ prefix: "/ip-pools" })
  .guard({ beforeHandle: requireRoles("admin") as any }, (app) =>
    app
      .get("/", ipController.list, {
        query: t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
        detail: { summary: "List all IP pools", tags: ["IP Pools"] },
      })
      .post("/", ipController.create, {
        body: t.Object({
          ip: t.String({ minLength: 7, maxLength: 45, pattern: "^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^[0-9a-fA-F:]+$" }),
          type: t.Union([t.Literal("PUBLIC"), t.Literal("PRIVATE")]),
        }),
        detail: { summary: "Add single IP to pool", tags: ["IP Pools"] },
      })
      .post("/range", ipController.createRange, {
        body: t.Object({
          ip_start: ipv4Field,
          ip_end: ipv4Field,
          type: t.Union([t.Literal("PUBLIC"), t.Literal("PRIVATE")]),
        }),
        detail: { summary: "Bulk add IP range to pool (max 256)", tags: ["IP Pools"] },
      })
      .patch("/:id", ipController.update, {
        params: idParam,
        body: t.Object({
          ip: t.Optional(t.String({ minLength: 7, maxLength: 45, pattern: "^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^[0-9a-fA-F:]+$" })),
          type: t.Optional(t.Union([t.Literal("PUBLIC"), t.Literal("PRIVATE")])),
        }),
        detail: { summary: "Update IP pool entry", tags: ["IP Pools"] },
      })
      .patch("/:id/status", ipController.toggleStatus, {
        params: idParam,
        detail: { summary: "Toggle IP pool entry active/inactive", tags: ["IP Pools"] },
      })
  );
