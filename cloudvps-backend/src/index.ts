import Elysia from "elysia";
import cors from "@elysiajs/cors";
import swagger from "@elysiajs/swagger";
import { join } from "node:path";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { authMiddleware } from "./middlewares/auth.middleware";
import { authRoutes } from "./routes/auth.route";
import { userRoutes } from "./routes/user.route";
import { policyRoutes } from "./routes/policy.route";
import { packageRoutes } from "./routes/package.route";
import { promotionRoutes } from "./routes/promotion.route";
import { orderRoutes } from "./routes/order.route";
import { transactionRoutes } from "./routes/transaction.route";
import { vpsRoutes } from "./routes/vps.route";
import { ipRoutes } from "./routes/ip.route";
import { systemConfigRoutes } from "./routes/system-config.route";
import { auditRoutes } from "./routes/audit.route";
import { broadcastRoutes } from "./routes/broadcast.route";
import { upgradeRoutes } from "./routes/upgrade.route";
import { natRoutes } from "./routes/nat.route";
import { emailTemplateRoutes } from "./routes/email-template.route";
import { ticketRoutes } from "./routes/ticket.route";
import { systemRoutes } from "./routes/system.route";
import { terminalRoutes } from "./routes/terminal.route";
import { startExpiryJobs } from "./jobs/expiry.job";
import { prisma } from "./config/database";
import { redis } from "./config/redis";
import { proxmoxService } from "./services/proxmox.service";

const app = new Elysia()
  .use(
    cors({
      origin: env.corsOrigin,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    })
  )
  .use(
    swagger({
      documentation: {
        info: {
          title: "CloudVPS API",
          version: "1.0.0",
          description: "CloudVPS VPS Cloud Rental Service API",
        },
        tags: [
          { name: "Auth", description: "Authentication & session management" },
          { name: "Users", description: "User account management" },
          { name: "Policies", description: "PDPA & Terms of Service management" },
          { name: "Packages", description: "VPS packages, OS templates, VM specs" },
          { name: "Promotions", description: "Promotion codes management" },
          { name: "Orders", description: "Order management" },
          { name: "Transactions", description: "Payment & transaction management" },
          { name: "VPS", description: "VPS provisioning and management" },
          { name: "IP Pools", description: "IP pool management (Admin only)" },
          { name: "System Config", description: "Runtime system configuration (Admin/Support)" },
          { name: "Audit Logs", description: "Admin action audit log (Admin only)" },
          { name: "Broadcasts", description: "Email broadcast to user groups (Admin only)" },
          { name: "Port Rules", description: "NAT port forwarding rules for Private IP VPS" },
          { name: "Email Templates", description: "Email template management (Admin only)" },
          { name: "Support Tickets", description: "In-app support ticket system" },
          { name: "System", description: "System capacity snapshot (Admin/Support)" },
          { name: "Terminal", description: "VPS web terminal via noVNC WebSocket proxy" },
        ],
        components: {
          securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          },
        },
      },
      path: "/docs",
    })
  )
  // Global error handler — registered BEFORE routes so Elysia validation errors
  // (which default to 422) are intercepted and returned as 400 Bad Request.
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      return new Response(
        JSON.stringify({ success: false, message: "Validation error", detail: error.message }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (code === "PARSE") {
      set.status = 400;
      return { success: false, message: "Invalid request body" };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { success: false, message: "Route not found" };
    }
    logger.error("Unhandled error", { code, message: error instanceof Error ? error.message : String(error) });
    set.status = 500;
    return { success: false, message: "Internal server error" };
  })
  .get("/health", async ({ set }) => {
    const ts = new Date().toISOString();

    const [db, redisResult, proxmox] = await Promise.all([
      (async () => {
        const t = Date.now();
        try {
          await prisma.$queryRaw`SELECT 1`;
          return { status: "ok" as const, latencyMs: Date.now() - t };
        } catch {
          return { status: "error" as const, latencyMs: Date.now() - t };
        }
      })(),
      (async () => {
        const t = Date.now();
        try {
          await redis.ping();
          return { status: "ok" as const, latencyMs: Date.now() - t };
        } catch {
          return { status: "error" as const, latencyMs: Date.now() - t };
        }
      })(),
      proxmoxService.ping().then((r) => ({
        status: r.ok ? ("ok" as const) : ("error" as const),
        latencyMs: r.latencyMs,
      })),
    ]);

    const allOk = db.status === "ok" && redisResult.status === "ok" && proxmox.status === "ok";
    if (!allOk) set.status = 503;

    return {
      status: allOk ? "ok" : "degraded",
      ts,
      services: { db, redis: redisResult, proxmox },
    };
  })
  // Serve uploaded files — path traversal blocked by rejecting any ".." segment.
  .get("/uploads/*", async ({ params, set }) => {
    const wildcard = (params as any)["*"] as string;
    if (wildcard.includes("..")) {
      set.status = 403;
      return { success: false, message: "Forbidden." };
    }
    const filePath = join(process.cwd(), "uploads", wildcard);
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      set.status = 404;
      return { success: false, message: "File not found." };
    }
    return file;
  })
  // Mount authMiddleware at root level so derive() context is shared across
  // ALL route groups — avoids Elysia named-plugin dedup breaking context injection.
  .use(authMiddleware)
  .group("/api", (app) =>
    app
      .use(authRoutes)
      .use(userRoutes)
      .use(policyRoutes)
      .use(packageRoutes)
      .use(promotionRoutes)
      .use(orderRoutes)
      .use(transactionRoutes)
      .use(vpsRoutes)
      .use(ipRoutes)
      .use(systemConfigRoutes)
      .use(auditRoutes)
      .use(broadcastRoutes)
      .use(upgradeRoutes)
      .use(natRoutes)
      .use(emailTemplateRoutes)
      .use(ticketRoutes)
      .use(systemRoutes)
      .use(terminalRoutes)
  )
  .listen(env.port);

startExpiryJobs();
logger.info(`CloudVPS API started`, { port: env.port, url: `http://localhost:${env.port}` });
logger.info(`Swagger docs`, { url: `http://localhost:${env.port}/docs` });

export type App = typeof app;
