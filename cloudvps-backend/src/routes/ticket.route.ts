import Elysia, { t } from "elysia";
import { ticketController } from "../controllers/ticket.controller";
import { requireAuth, requireRoles } from "../middlewares/rbac.middleware";

const idParam = t.Object({ id: t.String() });

const categoryBody = t.Object({
  name:        t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String()),
});

const createTicketBody = t.Object({
  title:       t.String({ minLength: 1, maxLength: 255 }),
  category_id: t.Number({ minimum: 1 }),
  message:     t.String({ minLength: 1 }),
});

const statusBody = t.Object({
  status: t.String(),
});

const assignBody = t.Object({
  assigned_to: t.Optional(t.Nullable(t.Number())),
});

const priorityBody = t.Object({
  priority: t.String(),
});

const messageBody = t.Object({
  message:     t.String({ minLength: 1 }),
  is_internal: t.Optional(t.String()),  // form sends "true"/"false"
  attachments: t.Optional(t.Files()),
});

const listQuery = t.Object({
  page:        t.Optional(t.String()),
  limit:       t.Optional(t.String()),
  status:      t.Optional(t.String()),
  priority:    t.Optional(t.String()),
  category_id: t.Optional(t.String()),
  user_id:     t.Optional(t.String()),
  assigned_to: t.Optional(t.String()),
});

export const ticketRoutes = new Elysia({ prefix: "/tickets" })
  // ── Public: active categories ─────────────────────────────────────────────
  .get("/categories", ticketController.listCategories, {
    detail: { summary: "List active ticket categories", tags: ["Support Tickets"] },
  })

  // ── Authenticated routes ──────────────────────────────────────────────────
  .guard({ beforeHandle: requireAuth as any }, (app) =>
    app
      // Tickets — mixed role (USER=own, ADMIN/SUPPORT=all)
      .post("/", ticketController.createTicket, {
        beforeHandle: requireRoles("users") as any,
        body: createTicketBody,
        detail: { summary: "Create a new support ticket (USER only)", tags: ["Support Tickets"] },
      })
      .get("/", ticketController.listTickets, {
        query: listQuery,
        detail: { summary: "List tickets (own for USER, all for ADMIN/SUPPORT)", tags: ["Support Tickets"] },
      })
      .get("/:id", ticketController.getTicketById, {
        params: idParam,
        detail: { summary: "Get ticket with messages", tags: ["Support Tickets"] },
      })
      .patch("/:id/status", ticketController.updateStatus, {
        params: idParam,
        body: statusBody,
        detail: { summary: "Update ticket status (USER=CLOSED own; ADMIN/SUPPORT=any)", tags: ["Support Tickets"] },
      })
      .post("/:id/messages", ticketController.addMessage, {
        params: idParam,
        body: messageBody,
        detail: {
          summary: "Add message or internal note to ticket (multipart/form-data)",
          description: "`attachments` optional: up to 3 image files (JPEG/PNG/WebP/GIF), each ≤5MB.",
          tags: ["Support Tickets"],
        },
      })

      // Admin + Support only
      .guard({ beforeHandle: requireRoles("admin", "support") as any }, (app) =>
        app
          .get("/categories/all", ticketController.listCategoriesAdmin, {
            detail: { summary: "List all ticket categories incl. inactive (ADMIN/SUPPORT)", tags: ["Support Tickets"] },
          })
          .patch("/:id/assign", ticketController.assignTicket, {
            params: idParam,
            body: assignBody,
            detail: { summary: "Assign ticket to staff (SUPPORT=self only, ADMIN=any)", tags: ["Support Tickets"] },
          })
          .patch("/:id/priority", ticketController.setPriority, {
            params: idParam,
            body: priorityBody,
            detail: { summary: "Set ticket priority", tags: ["Support Tickets"] },
          })
      )

      // Admin only
      .guard({ beforeHandle: requireRoles("admin") as any }, (app) =>
        app
          .post("/categories", ticketController.createCategory, {
            body: categoryBody,
            detail: { summary: "Create ticket category (ADMIN only)", tags: ["Support Tickets"] },
          })
          .put("/categories/:id", ticketController.updateCategory, {
            params: idParam,
            body: t.Object({
              name:        t.Optional(t.String({ minLength: 1, maxLength: 100 })),
              description: t.Optional(t.String()),
            }),
            detail: { summary: "Update ticket category (ADMIN only)", tags: ["Support Tickets"] },
          })
          .patch("/categories/:id/status", ticketController.toggleCategoryStatus, {
            params: idParam,
            detail: { summary: "Toggle ticket category status (ADMIN only)", tags: ["Support Tickets"] },
          })
      )
  );
