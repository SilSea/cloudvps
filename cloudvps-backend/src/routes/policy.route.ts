import Elysia, { t } from "elysia";
import { policyController } from "../controllers/policy.controller";

import { requireAuth, requireRoles } from "../middlewares/rbac.middleware";

const idParam = t.Object({ id: t.String() });

export const policyRoutes = new Elysia({ prefix: "/policies" })
  // Public
  .get("/active", policyController.getActive, {
    detail: { summary: "Get all active policies", tags: ["Policies"] },
  })
  // Authenticated — consent endpoints
  .guard({ beforeHandle: requireAuth as any }, (app) =>
    app
      .post("/consents", policyController.acceptConsent, {
        body: t.Object({ policy_id: t.Number() }),
        detail: { summary: "Accept a policy", tags: ["Policies"] },
      })
      .get("/consents/me", policyController.getMyConsents, {
        detail: { summary: "Get own consent history", tags: ["Policies"] },
      })
  )
  // Admin only
  .guard({ beforeHandle: requireRoles("admin") as any }, (app) =>
    app
      .get("/", policyController.getAll, {
        detail: { summary: "List all policies with versions", tags: ["Policies"] },
      })
      .post("/", policyController.create, {
        body: t.Object({
          policie_title: t.String({ minLength: 1, maxLength: 150 }),
          policies_detail: t.String({ minLength: 1 }),
          policies_type: t.Union([t.Literal("PDPA"), t.Literal("TERMSERVICE")]),
          version: t.String({ minLength: 1, maxLength: 10 }),
        }),
        detail: { summary: "Create a new policy version", tags: ["Policies"] },
      })
      .put("/:id", policyController.update, {
        params: idParam,
        body: t.Object({
          policie_title: t.Optional(t.String({ minLength: 1, maxLength: 150 })),
          policies_detail: t.Optional(t.String({ minLength: 1 })),
          version: t.Optional(t.String({ minLength: 1, maxLength: 10 })),
        }),
        detail: { summary: "Update policy content", tags: ["Policies"] },
      })
      .patch("/:id/status", policyController.toggleStatus, {
        params: idParam,
        detail: { summary: "Toggle policy status", tags: ["Policies"] },
      })
  );
