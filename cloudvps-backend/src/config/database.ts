import { PrismaClient } from "@prisma/client";

// Store the instance on globalThis so Bun's hot-reload doesn't create a new
// PrismaClient (and open a new connection pool) on every file change.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    // Log SQL queries in development to aid debugging; only errors in production.
    log: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
