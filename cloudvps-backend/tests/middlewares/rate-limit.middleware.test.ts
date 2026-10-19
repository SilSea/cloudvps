import { describe, it, expect, mock, beforeEach, beforeAll } from "bun:test";

// ── Mock state ─────────────────────────────────────────────────────────────────
let _incrCount = 0;
let _redisError: Error | null = null;

const redisIncrFn   = mock(async () => { if (_redisError) throw _redisError; return ++_incrCount; });
const redisExpireFn = mock(async () => 1);
const loggerErrorFn = mock((..._args: any[]) => {});

mock.module("../../src/config/redis", () => ({
  redis: {
    incr:   redisIncrFn,
    expire: redisExpireFn,
  },
}));

mock.module("../../src/utils/logger", () => ({
  logger: {
    error: loggerErrorFn,
    info:  mock(() => {}),
    warn:  mock(() => {}),
    auth:  mock(() => {}),
    vps:   mock(() => {}),
    admin: mock(() => {}),
  },
}));

import Elysia from "elysia";
const { rateLimit } = await import("../../src/middlewares/rate-limit.middleware");

// ── Helpers ────────────────────────────────────────────────────────────────────
const makeApp = (limit = 3, windowSec = 60, keyPrefix = "test") =>
  new Elysia()
    .use(rateLimit({ limit, windowSec, keyPrefix }))
    .get("/ping", () => "ok");

const makeReq = (ip?: string) =>
  new Request("http://localhost/ping", {
    headers: ip ? { "x-forwarded-for": ip } : {},
  });

// Ensure the bypass env var never affects unit tests even if set in .env
beforeAll(() => { process.env.RATE_LIMIT_DISABLED = ""; });

beforeEach(() => {
  _incrCount  = 0;
  _redisError = null;
  redisIncrFn.mockClear();
  redisExpireFn.mockClear();
  loggerErrorFn.mockClear();
});

// =============================================================================
// Redis key format
// =============================================================================
describe("key format", () => {
  it("RL-1: uses rl:{keyPrefix}:{clientIp} as Redis key", async () => {
    const app = makeApp(3, 60, "auth");
    await app.handle(makeReq("10.0.0.1"));
    expect(redisIncrFn).toHaveBeenCalledWith("rl:auth:10.0.0.1");
  });

  it("RL-2: falls back to 'unknown' when x-forwarded-for header is absent", async () => {
    const app = makeApp();
    await app.handle(makeReq());
    expect(redisIncrFn).toHaveBeenCalledWith("rl:test:unknown");
  });

  it("RL-3: takes only the first IP from comma-separated x-forwarded-for", async () => {
    const app = makeApp();
    await app.handle(makeReq("203.0.113.5, 10.0.0.1, 172.16.0.2"));
    expect(redisIncrFn).toHaveBeenCalledWith("rl:test:203.0.113.5");
  });
});

// =============================================================================
// Counter / TTL logic
// =============================================================================
describe("counter and TTL", () => {
  it("RL-4: calls expire with correct windowSec on first request (count === 1)", async () => {
    const app = makeApp(5, 120, "api");
    await app.handle(makeReq("1.2.3.4"));
    expect(redisExpireFn).toHaveBeenCalledWith("rl:api:1.2.3.4", 120);
  });

  it("RL-5: does not call expire on subsequent requests within the window", async () => {
    const app = makeApp(5, 60, "api");
    // Simulate counter already at 2 (not first request)
    _incrCount = 1; // next incr returns 2
    await app.handle(makeReq("1.2.3.4"));
    expect(redisExpireFn).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Allow / block
// =============================================================================
describe("allow and block", () => {
  it("RL-6: allows request when count is within limit — returns 200", async () => {
    const app = makeApp(3, 60, "test");
    const res = await app.handle(makeReq("5.5.5.5"));
    expect(res.status).toBe(200);
  });

  it("RL-7: blocks request when count exceeds limit — returns 429", async () => {
    _incrCount = 3; // next incr returns 4, which exceeds limit=3
    const app = makeApp(3, 60, "test");
    const res = await app.handle(makeReq("5.5.5.5"));
    expect(res.status).toBe(429);
  });

  it("RL-8: 429 response body has success:false and message", async () => {
    _incrCount = 3;
    const app = makeApp(3, 60, "test");
    const res = await app.handle(makeReq("5.5.5.5"));
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(typeof body.message).toBe("string");
  });

  it("RL-9: allows exactly at the limit (count === limit)", async () => {
    _incrCount = 2; // next incr returns 3, equal to limit=3 → allowed
    const app = makeApp(3, 60, "test");
    const res = await app.handle(makeReq("5.5.5.5"));
    expect(res.status).toBe(200);
  });
});

// =============================================================================
// Fail-open on Redis error
// =============================================================================
describe("Redis error — fail open", () => {
  it("RL-10: allows request when Redis throws (fail open)", async () => {
    _redisError = new Error("ECONNREFUSED");
    const app = makeApp(3, 60, "test");
    const res = await app.handle(makeReq("9.9.9.9"));
    expect(res.status).toBe(200);
  });

  it("RL-11: logs error when Redis throws", async () => {
    _redisError = new Error("Redis down");
    const app = makeApp(3, 60, "test");
    await app.handle(makeReq("9.9.9.9"));
    expect(loggerErrorFn).toHaveBeenCalledWith(
      "Rate limit: Redis error, failing open",
      expect.objectContaining({ error: expect.stringContaining("Redis down") })
    );
  });
});

// =============================================================================
// Isolation: different keyPrefix scopes are independent
// =============================================================================
describe("keyPrefix isolation", () => {
  it("RL-12: two instances with different prefixes use separate Redis keys", async () => {
    const appA = makeApp(1, 60, "scopeA");
    const appB = makeApp(1, 60, "scopeB");

    // First request to each — both should be counted at counter=1
    await appA.handle(makeReq("1.1.1.1"));
    redisIncrFn.mockClear();
    await appB.handle(makeReq("1.1.1.1"));

    expect(redisIncrFn).toHaveBeenCalledWith("rl:scopeB:1.1.1.1");
    const calls = redisIncrFn.mock.calls.map((c: any) => c[0]);
    expect(calls).not.toContain("rl:scopeA:1.1.1.1");
  });
});
