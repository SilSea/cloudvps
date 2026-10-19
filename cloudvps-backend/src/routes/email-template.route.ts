import Elysia, { t } from "elysia";
import { emailTemplateController } from "../controllers/email-template.controller";
import { requireRoles } from "../middlewares/rbac.middleware";

const typeParam = t.Object({ type: t.String() });

const updateBody = t.Object({
  subject:   t.String({ minLength: 1, maxLength: 255 }),
  body_html: t.String({ minLength: 1 }),
  is_active: t.Optional(t.Boolean()),
});

const toggleBody = t.Object({
  is_active: t.Boolean(),
});

export const emailTemplateRoutes = new Elysia({ prefix: "/email-templates" })
  .guard({ beforeHandle: requireRoles("admin") as any }, (app) =>
    app
      .get("/", emailTemplateController.list, {
        detail: { summary: "List all email templates", tags: ["Email Templates"] },
      })
      .get("/:type", emailTemplateController.getOne, {
        params: typeParam,
        detail: { summary: "Get email template by type", tags: ["Email Templates"] },
      })
      .put("/:type", emailTemplateController.update, {
        params: typeParam,
        body: updateBody,
        detail: { summary: "Create or update email template", tags: ["Email Templates"] },
      })
      .patch("/:type/status", emailTemplateController.toggleActive, {
        params: typeParam,
        body: toggleBody,
        detail: { summary: "Toggle email template active status", tags: ["Email Templates"] },
      })
  );
