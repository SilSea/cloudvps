import Elysia, { t } from "elysia";
import { orderController } from "../controllers/order.controller";
import { requireAuth, requireRoles } from "../middlewares/rbac.middleware";

const idParam = t.Object({ id: t.String() });

export const orderRoutes = new Elysia({ prefix: "/orders" })
  .guard({ beforeHandle: requireAuth as any }, (app) =>
    app
      .post("/", orderController.create, {
        body: t.Object({
          package_id: t.Number({ minimum: 1 }),
          promo_code: t.Optional(t.String({ minLength: 1, maxLength: 150 })),
          force: t.Optional(t.Boolean()),
        }),
        detail: { summary: "Create a new order", tags: ["Orders"] },
      })
      .get("/", orderController.list, {
        query: t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
        detail: { summary: "List orders (own for USER, all for ADMIN/SUPPORT)", tags: ["Orders"] },
      })
      .get("/:id", orderController.getById, {
        params: idParam,
        detail: { summary: "Get order details", tags: ["Orders"] },
      })
      .patch("/:id/cancel", orderController.cancel, {
        params: idParam,
        detail: { summary: "Cancel a pending order", tags: ["Orders"] },
      })
  );
