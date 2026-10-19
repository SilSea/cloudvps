import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock state ────────────────────────────────────────────────────────────────
let _existingUser:   any = null;
let _usersRole:      any = { id: 2, role_name: "users" };
let _activePolicies: any[] = [{ id: 1 }, { id: 2 }];
let _createdUser:    any = null;
let _txUser:         any = null;

const usersFindUniqueFn  = mock(async () => _existingUser);
const rolesFindFirstFn   = mock(async () => _usersRole);
const policiesFindManyFn = mock(async () => _activePolicies);
const txCreateFn         = mock(async () => _txUser);
const transactionFn      = mock(async (fn: any) => fn({ users: { create: txCreateFn } }));
const hashPasswordFn     = mock(async () => "hashed_pw");
const sendWelcomeFn      = mock(async () => {});
const auditRecordFn      = mock((..._: any[]) => {});
const loggerAdminFn      = mock((..._: any[]) => {});
const loggerErrorFn      = mock((..._: any[]) => {});

mock.module("../../src/config/database", () => ({
  prisma: {
    users:    { findUnique: usersFindUniqueFn },
    roles:    { findFirst: rolesFindFirstFn },
    policies: { findMany: policiesFindManyFn },
    $transaction: transactionFn,
  },
}));

mock.module("../../src/utils/hash", () => ({
  hashPassword:   hashPasswordFn,
  verifyPassword: mock(async () => true),
}));

mock.module("../../src/services/email.service", () => ({
  emailService: { sendWelcome: sendWelcomeFn },
}));

mock.module("../../src/services/audit.service", () => ({
  auditService: { record: auditRecordFn },
}));

mock.module("../../src/utils/logger", () => ({
  logger: {
    info:    mock(() => {}),
    warn:    mock(() => {}),
    error:   loggerErrorFn,
    auth:    mock(() => {}),
    payment: mock(() => {}),
    vps:     mock(() => {}),
    admin:   loggerAdminFn,
  },
}));

// redis needed by user.controller.ts changeEmail path
mock.module("../../src/config/redis", () => ({
  redis: { del: mock(async () => 1), set: mock(async () => "OK") },
}));

mock.module("../../src/utils/jwt", () => ({
  jwtUtils: { signEmailVerify: mock(async () => "token") },
}));

const { userController } = await import("../../src/controllers/user.controller");

// ── Helpers ────────────────────────────────────────────────────────────────────
const baseBody = () => ({
  email:      "new@example.com",
  first_name: "New",
  last_name:  "User",
  phone:      "0812345678",
  address1:   "123 Test St",
  address2:   undefined,
  address3:   "District",
  address4:   "City",
  address5:   "10100",
  address6:   "Thailand",
});

const makeCtx = (overrides: any = {}) => ({
  user:    { id: 1, role: "admin" },
  body:    baseBody(),
  set:     { status: 200 },
  request: { headers: { get: () => null } },
  ...overrides,
});

describe("userController.createUser()", () => {
  beforeEach(() => {
    _existingUser   = null;
    _usersRole      = { id: 2, role_name: "users" };
    _activePolicies = [{ id: 1 }, { id: 2 }];
    _txUser = {
      id: 10, email: "new@example.com", is_verify: true, created_at: new Date(),
      role: { role_name: "users" },
    };
    usersFindUniqueFn.mockClear();
    rolesFindFirstFn.mockClear();
    policiesFindManyFn.mockClear();
    txCreateFn.mockClear();
    transactionFn.mockClear();
    hashPasswordFn.mockClear();
    sendWelcomeFn.mockClear();
    auditRecordFn.mockClear();
    loggerAdminFn.mockClear();
    loggerErrorFn.mockClear();
  });

  it("UC-1: rejects duplicate email with 409", async () => {
    _existingUser = { id: 5, email: "new@example.com" };
    const ctx = makeCtx();
    const result = await userController.createUser(ctx);
    expect(ctx.set.status).toBe(409);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Email already in use");
  });

  it("UC-2: returns 500 when users role not found", async () => {
    _usersRole = null;
    const ctx = makeCtx();
    const result = await userController.createUser(ctx);
    expect(ctx.set.status).toBe(500);
    expect(result.success).toBe(false);
  });

  it("UC-3: creates user with is_verify=true inside transaction", async () => {
    const ctx = makeCtx();
    await userController.createUser(ctx);
    const createCall = txCreateFn.mock.calls[0][0];
    expect(createCall.data.is_verify).toBe(true);
    expect(createCall.data.email).toBe("new@example.com");
  });

  it("UC-4: auto-accepts all active policies", async () => {
    _activePolicies = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const ctx = makeCtx();
    await userController.createUser(ctx);
    const createCall = txCreateFn.mock.calls[0][0];
    expect(createCall.data.consents.create).toHaveLength(3);
    expect(createCall.data.consents.create).toContainEqual({ policies_id: 1 });
    expect(createCall.data.consents.create).toContainEqual({ policies_id: 3 });
  });

  it("UC-5: uses auto-generated password when body.password is absent", async () => {
    const ctx = makeCtx({ body: { ...baseBody(), password: undefined } });
    const result = await userController.createUser(ctx);
    expect(result.password_generated).toBe(true);
    expect(hashPasswordFn).toHaveBeenCalledTimes(1);
    // Generated password must not be empty string
    const passArg = hashPasswordFn.mock.calls[0][0] as string;
    expect(passArg.length).toBeGreaterThanOrEqual(16);
  });

  it("UC-6: uses caller-supplied password when provided", async () => {
    const ctx = makeCtx({ body: { ...baseBody(), password: "MyPassw0rd!" } });
    const result = await userController.createUser(ctx);
    expect(result.password_generated).toBe(false);
    expect(hashPasswordFn.mock.calls[0][0]).toBe("MyPassw0rd!");
  });

  it("UC-7: sends welcome email after creation", async () => {
    const ctx = makeCtx();
    await userController.createUser(ctx);
    expect(sendWelcomeFn).toHaveBeenCalledTimes(1);
    expect(sendWelcomeFn.mock.calls[0][0]).toBe("new@example.com");
  });

  it("UC-8: success even when welcome email fails (non-fatal)", async () => {
    sendWelcomeFn.mockRejectedValueOnce(new Error("SMTP down"));
    const ctx = makeCtx();
    const result = await userController.createUser(ctx);
    expect(result.success).toBe(true);
    expect(loggerErrorFn).toHaveBeenCalledTimes(1);
  });

  it("UC-9: records audit log CREATE USER", async () => {
    const ctx = makeCtx({ user: { id: 99, role: "support" } });
    await userController.createUser(ctx);
    expect(auditRecordFn).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId:   99,
        actorRole: "support",
        action:    "CREATE",
        entity:    "USER",
      })
    );
  });

  it("UC-10: response includes new user data", async () => {
    const ctx = makeCtx();
    const result = await userController.createUser(ctx);
    expect(result.success).toBe(true);
    expect(result.data.email).toBe("new@example.com");
    expect(result.data.is_verify).toBe(true);
  });

  it("UC-11: hashes password before storing (never stores plaintext)", async () => {
    const ctx = makeCtx({ body: { ...baseBody(), password: "PlaintextPw1!" } });
    await userController.createUser(ctx);
    const createCall = txCreateFn.mock.calls[0][0];
    expect(createCall.data.password).toBe("hashed_pw");
    expect(createCall.data.password).not.toBe("PlaintextPw1!");
  });

  it("UC-12: works with zero active policies (no consent rows created)", async () => {
    _activePolicies = [];
    const ctx = makeCtx();
    const result = await userController.createUser(ctx);
    expect(result.success).toBe(true);
    const createCall = txCreateFn.mock.calls[0][0];
    expect(createCall.data.consents.create).toHaveLength(0);
  });
});
