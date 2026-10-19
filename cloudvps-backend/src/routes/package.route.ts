import Elysia, { t } from "elysia";
import { packageController } from "../controllers/package.controller";

import { requireRoles } from "../middlewares/rbac.middleware";

const idParam = t.Object({ id: t.String() });

export const packageRoutes = new Elysia({ prefix: "/packages" })
  // Public — active packages listing
  .get("/", packageController.listActive, {
    query: t.Object({ category_id: t.Optional(t.String()) }),
    detail: { summary: "List all active packages", tags: ["Packages"] },
  })
  .get("/categories", packageController.listCategories, {
    detail: { summary: "List active package categories", tags: ["Packages"] },
  })
  .get("/:id", packageController.getById, {
    params: idParam,
    detail: { summary: "Get package details", tags: ["Packages"] },
  })
  // Admin only
  .guard({ beforeHandle: requireRoles("admin") as any }, (app) =>
    app
      .get("/categories/all", packageController.listCategoriesAdmin, {
        detail: { summary: "List all categories (including inactive)", tags: ["Packages"] },
      })
      .post("/categories", packageController.createCategory, {
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 100 }),
          description: t.Optional(t.String()),
        }),
        detail: { summary: "Create package category", tags: ["Packages"] },
      })
      .put("/categories/:id", packageController.updateCategory, {
        params: idParam,
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
          description: t.Optional(t.String()),
        }),
        detail: { summary: "Update package category", tags: ["Packages"] },
      })
      .patch("/categories/:id/status", packageController.toggleCategoryStatus, {
        params: idParam,
        detail: { summary: "Toggle category status", tags: ["Packages"] },
      })
      .post("/", packageController.create, {
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 100 }),
          description: t.String({ minLength: 1 }),
          price: t.Number({ minimum: 0.01 }),
          period: t.Number({ minimum: 1 }),
          os_id: t.Number({ minimum: 1 }),
          vm_id: t.Number({ minimum: 1 }),
          port_count: t.Optional(t.Number({ minimum: 1 })),
          category_id: t.Optional(t.Number({ minimum: 1 })),
        }),
        detail: { summary: "Create a new package", tags: ["Packages"] },
      })
      .put("/:id", packageController.update, {
        params: idParam,
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
          description: t.Optional(t.String({ minLength: 1 })),
          price: t.Optional(t.Number({ minimum: 0.01 })),
          period: t.Optional(t.Number({ minimum: 1 })),
          os_id: t.Optional(t.Number({ minimum: 1 })),
          vm_id: t.Optional(t.Number({ minimum: 1 })),
          port_count: t.Optional(t.Nullable(t.Number({ minimum: 1 }))),
          category_id: t.Optional(t.Nullable(t.Number({ minimum: 1 }))),
        }),
        detail: { summary: "Update a package", tags: ["Packages"] },
      })
      .patch("/:id/status", packageController.toggleStatus, {
        params: idParam,
        detail: { summary: "Toggle package status", tags: ["Packages"] },
      })
      // OS Templates
      .get("/os", packageController.listOs, {
        detail: { summary: "List OS templates", tags: ["Packages"] },
      })
      .post("/os", packageController.createOs, {
        body: t.Object({
          os_name: t.String({ minLength: 1, maxLength: 50 }),
          os_version: t.String({ minLength: 1, maxLength: 50 }),
          vmid: t.Number({ minimum: 1 }),
        }),
        detail: { summary: "Create OS template", tags: ["Packages"] },
      })
      .put("/os/:id", packageController.updateOs, {
        params: idParam,
        body: t.Object({
          os_name: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
          os_version: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
          vmid: t.Optional(t.Number({ minimum: 1 })),
        }),
        detail: { summary: "Update OS template", tags: ["Packages"] },
      })
      // VM Specs
      .get("/vm", packageController.listVm, {
        detail: { summary: "List VM specs", tags: ["Packages"] },
      })
      .post("/vm", packageController.createVm, {
        body: t.Object({
          core: t.Number({ minimum: 1 }),
          memory: t.String({ minLength: 1, maxLength: 10 }),
          size: t.String({ minLength: 1, maxLength: 10 }),
        }),
        detail: { summary: "Create VM spec", tags: ["Packages"] },
      })
      .put("/vm/:id", packageController.updateVm, {
        params: idParam,
        body: t.Object({
          core: t.Optional(t.Number({ minimum: 1 })),
          memory: t.Optional(t.String({ minLength: 1, maxLength: 10 })),
          size: t.Optional(t.String({ minLength: 1, maxLength: 10 })),
        }),
        detail: { summary: "Update VM spec", tags: ["Packages"] },
      })
  );
