import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock state ────────────────────────────────────────────────────────────────
let _dbUser:       any = null;
let _dbUserInfo:   any = null;
let _dbUpdated:    any = null;
let _dbRole:       any = null;

const usersFindUniqueFn  = mock(async () => _dbUser);
const usersUpdateFn      = mock(async () => _dbUpdated ?? _dbUser);
const usersCountFn       = mock(async () => 0);
const usersFindManyFn    = mock(async () => []);
const usersInfoUpdateFn  = mock(async () => _dbUserInfo);
const rolesFindFirstFn   = mock(async () => _dbRole);
const auditRecordFn      = mock((..._args: any[]) => {});
const redisDelFn         = mock(async () => 1);
const verifyPasswordFn   = mock(async () => true);
const hashPasswordFn     = mock(async () => "hashed_pw");
const signEmailVerifyFn  = mock(async () => "verify_token");
const sendVerificationFn = mock(async () => {});
const loggerErrorFn      = mock((..._args: any[]) => {});

mock.module("../../src/config/database", () => ({
  prisma: {
    users: {
      findUnique: usersFindUniqueFn,
      update:     usersUpdateFn,
      count:      usersCountFn,
      findMany:   usersFindManyFn,
    },
    users_info: {
      update: usersInfoUpdateFn,
    },
    roles: {
      findFirst: rolesFindFirstFn,
    },
  },
}));

mock.module("../../src/config/redis", () => ({
  redis: { del: redisDelFn, set: mock(async () => "OK") },
}));

mock.module("../../src/utils/hash", () => ({
  verifyPassword: verifyPasswordFn,
  hashPassword:   hashPasswordFn,
}));

mock.module("../../src/utils/jwt", () => ({
  jwtUtils: { signEmailVerify: signEmailVerifyFn },
}));

mock.module("../../src/services/email.service", () => ({
  emailService: { sendVerification: sendVerificationFn },
}));

mock.module("../../src/services/audit.service", () => ({
  auditService: { record: auditRecordFn },
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

const { userController } = await import("../../src/controllers/user.controller");

const asMock = (fn: unknown) => fn as ReturnType<typeof mock<() => unknown>>;

const baseUser = {
  id: 1, email: "user@example.com", status: true, is_verify: true,
  password: "hashed_pw",
  role: { role_name: "users" },
  users_info: { first_name: "Test", last_name: "User", phone: "0812345678" },
};

const adminActor = { id: 99, email: "admin@example.com", role: "admin" };

const makeSet = () => ({ status: undefined as any });
const makeRequest = (ip = "127.0.0.1") => ({
  headers: { get: (h: string) => h === "x-forwarded-for" ? ip : null },
});

beforeEach(() => {
  _dbUser      = null;
  _dbUserInfo  = null;
  _dbUpdated   = null;
  _dbRole      = null;
  usersFindUniqueFn.mockClear();
  usersUpdateFn.mockClear();
  usersInfoUpdateFn.mockClear();
  rolesFindFirstFn.mockClear();
  auditRecordFn.mockClear();
  redisDelFn.mockClear();
  verifyPasswordFn.mockClear();
  hashPasswordFn.mockClear();
  sendVerificationFn.mockClear();
  loggerErrorFn.mockClear();
});

// =============================================================================
// getMe
// =============================================================================
describe("userController.getMe", () => {
  it("USR-1: returns 404 when user not found", async () => {
    const set = makeSet();
    await userController.getMe({ user: { id: 1 }, set });
    expect(set.status).toBe(404);
  });

  it("USR-2: returns user data on success", async () => {
    _dbUser = baseUser;
    usersFindUniqueFn.mockResolvedValueOnce(baseUser);
    const result = await userController.getMe({ user: { id: 1 }, set: makeSet() }) as any;
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});

// =============================================================================
// changePassword
// =============================================================================
describe("userController.changePassword", () => {
  it("USR-3: returns 400 when user has no password (OAuth-only account)", async () => {
    usersFindUniqueFn.mockResolvedValueOnce({ ...baseUser, password: null });
    const set = makeSet();
    const result = await userController.changePassword({
      user: { id: 1 }, body: { current_password: "old", new_password: "new" }, set,
    }) as any;
    expect(set.status).toBe(400);
    expect(result.success).toBe(false);
  });

  it("USR-4: returns 401 when current password is wrong", async () => {
    usersFindUniqueFn.mockResolvedValueOnce(baseUser);
    asMock(verifyPasswordFn).mockResolvedValueOnce(false);
    const set = makeSet();
    const result = await userController.changePassword({
      user: { id: 1 }, body: { current_password: "wrong", new_password: "new" }, set,
    }) as any;
    expect(set.status).toBe(401);
    expect(result.success).toBe(false);
  });

  it("USR-5: hashes new password and updates user on success", async () => {
    usersFindUniqueFn.mockResolvedValueOnce(baseUser);
    const result = await userController.changePassword({
      user: { id: 1 }, body: { current_password: "correct", new_password: "NewPass123!" }, set: makeSet(),
    }) as any;
    expect(asMock(hashPasswordFn)).toHaveBeenCalledWith("NewPass123!");
    expect(asMock(usersUpdateFn)).toHaveBeenCalledWith(
      expect.objectContaining({ data: { password: "hashed_pw" } })
    );
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// changeEmail
// =============================================================================
describe("userController.changeEmail", () => {
  it("USR-6: returns 409 when email already in use", async () => {
    usersFindUniqueFn.mockResolvedValueOnce({ id: 2, email: "taken@example.com" });
    const set = makeSet();
    const result = await userController.changeEmail({
      user: { id: 1 }, body: { email: "taken@example.com" }, set,
    }) as any;
    expect(set.status).toBe(409);
    expect(result.success).toBe(false);
  });

  it("USR-7: invalidates refresh token on email change", async () => {
    usersFindUniqueFn.mockResolvedValueOnce(null); // email not taken
    await userController.changeEmail({
      user: { id: 1 }, body: { email: "new@example.com" }, set: makeSet(),
    });
    expect(asMock(redisDelFn)).toHaveBeenCalledWith("rt:1");
  });

  it("USR-8: marks user as unverified and updates email in DB", async () => {
    usersFindUniqueFn.mockResolvedValueOnce(null);
    await userController.changeEmail({
      user: { id: 1 }, body: { email: "new@example.com" }, set: makeSet(),
    });
    expect(asMock(usersUpdateFn)).toHaveBeenCalledWith(
      expect.objectContaining({ data: { email: "new@example.com", is_verify: false } })
    );
  });

  it("USR-9: sends verification email to new address", async () => {
    usersFindUniqueFn.mockResolvedValueOnce(null);
    await userController.changeEmail({
      user: { id: 1 }, body: { email: "new@example.com" }, set: makeSet(),
    });
    expect(asMock(sendVerificationFn)).toHaveBeenCalledWith("new@example.com", "verify_token");
  });

  it("USR-10: does not throw when verification email fails", async () => {
    usersFindUniqueFn.mockResolvedValueOnce(null);
    asMock(sendVerificationFn).mockRejectedValueOnce(new Error("SMTP down"));
    await expect(userController.changeEmail({
      user: { id: 1 }, body: { email: "new@example.com" }, set: makeSet(),
    })).resolves.toBeDefined();
    expect(asMock(loggerErrorFn)).toHaveBeenCalled();
  });
});

// =============================================================================
// toggleUserStatus
// =============================================================================
describe("userController.toggleUserStatus", () => {
  it("USR-11: returns 400 for non-numeric ID", async () => {
    const set = makeSet();
    await userController.toggleUserStatus({
      user: adminActor, params: { id: "abc" }, set, request: makeRequest(),
    });
    expect(set.status).toBe(400);
  });

  it("USR-12: returns 404 when target user not found", async () => {
    const set = makeSet();
    await userController.toggleUserStatus({
      user: adminActor, params: { id: "99" }, set, request: makeRequest(),
    });
    expect(set.status).toBe(404);
  });

  it("USR-13: toggles status from true to false and invalidates Redis cache", async () => {
    usersFindUniqueFn.mockResolvedValueOnce({ status: true });
    _dbUpdated = { id: 5, email: "u@example.com", status: false };
    await userController.toggleUserStatus({
      user: adminActor, params: { id: "5" }, set: makeSet(), request: makeRequest(),
    });
    expect(asMock(usersUpdateFn)).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: false } })
    );
    expect(asMock(redisDelFn)).toHaveBeenCalledWith("user_status:5");
  });

  it("USR-14: records audit log for status toggle", async () => {
    usersFindUniqueFn.mockResolvedValueOnce({ status: true });
    _dbUpdated = { id: 5, email: "u@example.com", status: false };
    await userController.toggleUserStatus({
      user: adminActor, params: { id: "5" }, set: makeSet(), request: makeRequest(),
    });
    expect(auditRecordFn).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DISABLE", entity: "USER", entityId: 5, actorId: 99 })
    );
  });

  it("USR-15: records ENABLE action when toggling status to true", async () => {
    usersFindUniqueFn.mockResolvedValueOnce({ status: false });
    _dbUpdated = { id: 5, email: "u@example.com", status: true };
    await userController.toggleUserStatus({
      user: adminActor, params: { id: "5" }, set: makeSet(), request: makeRequest(),
    });
    expect(auditRecordFn).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ENABLE" })
    );
  });
});

// =============================================================================
// changeUserRole
// =============================================================================
describe("userController.changeUserRole", () => {
  it("USR-16: returns 400 for non-numeric ID", async () => {
    const set = makeSet();
    await userController.changeUserRole({
      user: adminActor, params: { id: "abc" }, body: { role_name: "support" }, set, request: makeRequest(),
    });
    expect(set.status).toBe(400);
  });

  it("USR-17: returns 404 when target user not found", async () => {
    const set = makeSet();
    await userController.changeUserRole({
      user: adminActor, params: { id: "99" }, body: { role_name: "support" }, set, request: makeRequest(),
    });
    expect(set.status).toBe(404);
  });

  it("USR-18: returns 400 when role_name is invalid", async () => {
    usersFindUniqueFn.mockResolvedValueOnce({
      id: 5, role: { role_name: "users" },
    });
    rolesFindFirstFn.mockResolvedValueOnce(null);
    const set = makeSet();
    const result = await userController.changeUserRole({
      user: adminActor, params: { id: "5" }, body: { role_name: "superadmin" }, set, request: makeRequest(),
    }) as any;
    expect(set.status).toBe(400);
    expect(result.success).toBe(false);
  });

  it("USR-19: updates role and records audit log with from/to metadata", async () => {
    usersFindUniqueFn.mockResolvedValueOnce({
      id: 5, role: { role_name: "users" },
    });
    rolesFindFirstFn.mockResolvedValueOnce({ id: 2, role_name: "support" });
    _dbUpdated = { id: 5, email: "u@example.com", role: { role_name: "support" } };
    await userController.changeUserRole({
      user: adminActor, params: { id: "5" }, body: { role_name: "support" }, set: makeSet(), request: makeRequest(),
    });
    expect(auditRecordFn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ROLE_CHANGE",
        entity: "USER",
        entityId: 5,
        metadata: expect.objectContaining({ from: "users", to: "support" }),
      })
    );
  });
});

// =============================================================================
// listUsers / getUserById
// =============================================================================
describe("userController.listUsers", () => {
  it("USR-20: returns paginated user list", async () => {
    usersFindManyFn.mockResolvedValueOnce([{ id: 1, email: "a@example.com" }]);
    usersCountFn.mockResolvedValueOnce(1);
    const result = await userController.listUsers({ query: { page: "1", limit: "10" } }) as any;
    expect(result.success).toBe(true);
    expect(result.data.users).toHaveLength(1);
    expect(result.data.total).toBe(1);
  });
});

describe("userController.getUserById", () => {
  it("USR-21: returns 400 for non-numeric ID", async () => {
    const set = makeSet();
    await userController.getUserById({ params: { id: "abc" }, set });
    expect(set.status).toBe(400);
  });

  it("USR-22: returns 404 when user not found", async () => {
    const set = makeSet();
    await userController.getUserById({ params: { id: "999" }, set });
    expect(set.status).toBe(404);
  });

  it("USR-23: returns user data when found", async () => {
    usersFindUniqueFn.mockResolvedValueOnce(baseUser);
    const result = await userController.getUserById({ params: { id: "1" }, set: makeSet() }) as any;
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});
