import Elysia, { t } from "elysia";
import { upgradeController } from "../controllers/upgrade.controller";
import { requireAuth } from "../middlewares/rbac.middleware";
import { rateLimit } from "../middlewares/rate-limit.middleware";

const idParam = t.Object({ id: t.String() });
const paginationQuery = t.Object({
  page:  t.Optional(t.String()),
  limit: t.Optional(t.String()),
});

export const upgradeRoutes = new Elysia({ prefix: "/vps" })
  .guard({ beforeHandle: requireAuth as any }, (app) =>
    app
      .get("/:id/upgrade/history", upgradeController.getHistory, {
        params: idParam,
        query: paginationQuery,
        detail: { summary: "Get upgrade history for a VPS", tags: ["Upgrade"] },
      })
      .guard({}, (inner) =>
        inner
          .use(rateLimit({ limit: 5, windowSec: 60, keyPrefix: "upgrade" }) as any)
          .post("/:id/upgrade/package", upgradeController.createPackageUpgrade, {
            params: idParam,
            body: t.Object({ package_id: t.Number() }),
            detail: { summary: "Switch VPS to a different package (pro-rate charge)", tags: ["Upgrade"] },
          })
          .post("/:id/upgrade/custom", upgradeController.createCustomUpgrade, {
            params: idParam,
            body: t.Object({
              cores:      t.Optional(t.Number()),
              memory_gib: t.Optional(t.Number()),
              disk_gb:    t.Optional(t.Number()),
            }),
            detail: { summary: "Custom resource upgrade (unit-price charge)", tags: ["Upgrade"] },
          })
      )
  );
