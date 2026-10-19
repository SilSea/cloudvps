import Elysia from "elysia";
import { systemController } from "../controllers/system.controller";
import { requireRoles } from "../middlewares/rbac.middleware";

export const systemRoutes = new Elysia({ prefix: "/system" })
  .guard({ beforeHandle: requireRoles("admin", "support") as any }, (app) =>
    app.get("/capacity", systemController.getCapacity, {
      detail: {
        summary: "Get Proxmox node capacity snapshot",
        tags: ["System Config"],
        security: [{ bearerAuth: [] }],
      },
    })
  );
