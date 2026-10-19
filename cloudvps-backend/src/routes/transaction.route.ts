import Elysia, { t } from "elysia";
import { transactionController } from "../controllers/transaction.controller";
import { requireAuth, requireRoles } from "../middlewares/rbac.middleware";
import { rateLimit } from "../middlewares/rate-limit.middleware";

const idParam = t.Object({ id: t.String() });

export const transactionRoutes = new Elysia({ prefix: "/transactions" })
  .guard({ beforeHandle: requireAuth as any }, (app) =>
    app
      // Payment submission is rate-limited to 5 req/min per SEC-G9
      .use(rateLimit({ limit: 5, windowSec: 60, keyPrefix: "payment" }))
      .post("/", transactionController.submit, {
        body: t.Object({
          order_id: t.Numeric({ minimum: 1 }),
          payment_method: t.Union([
            t.Literal("TRUEMONEY"),
            t.Literal("SLIP"),
            t.Literal("PROMPTPAY"),
          ]),
          voucher_code: t.Optional(t.String({ minLength: 1 })),
          slip_file: t.Optional(t.File()),
          slip_image: t.Optional(t.String({ minLength: 1 })),
        }),
        detail: {
          summary: "Submit payment for an order (multipart/form-data)",
          description: "TRUEMONEY: requires `voucher_code`. SLIP: requires `slip_file` (image ≤5MB). PROMPTPAY: `slip_file` optional.",
          tags: ["Transactions"],
        },
      })
      .get("/", transactionController.list, {
        query: t.Object({
          page: t.Optional(t.String()),
          limit: t.Optional(t.String()),
        }),
        detail: { summary: "List transactions (own for USER, all for ADMIN/SUPPORT)", tags: ["Transactions"] },
      })
  )
  .guard({ beforeHandle: requireRoles("admin", "support") as any }, (app) =>
    app
      .patch("/:id/approve", transactionController.approve, {
        params: idParam,
        detail: { summary: "Approve a PromptPay transaction", tags: ["Transactions"] },
      })
      .patch("/:id/reject", transactionController.reject, {
        params: idParam,
        body: t.Object({
          reason: t.Optional(t.String({ maxLength: 500 })),
        }),
        detail: { summary: "Reject a PromptPay transaction", tags: ["Transactions"] },
      })
  );
