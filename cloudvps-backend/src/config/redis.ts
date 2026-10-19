import Redis from "ioredis";
import { env } from "./env";
import { logger } from "../utils/logger";

// lazyConnect: true — the TCP connection is deferred until the first command,
// so the server can start even if Redis is temporarily unavailable at boot.
export const redis = new Redis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  lazyConnect: true,
});

redis.on("error", (err) => {
  logger.error("[Redis] Connection error", { error: err.message });
});

redis.on("connect", () => {
  logger.info("[Redis] Connected");
});
