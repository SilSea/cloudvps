import { mock, describe, it, expect, beforeEach } from "bun:test";

const mockFindUnique = mock(() => Promise.resolve(null));
const mockAuditRecord = mock(() => {});
const mockChangeVmPassword = mock(() => Promise.resolve());
const mockSendVpsPasswordOtp = mock(() => Promise.resolve());
const mockSendVpsPasswordChanged = mock(() => Promise.resolve());
const mockRedisGet = mock(() => Promise.resolve(null));
const mockRedisSet = mock(() => Promise.resolve("OK"));
const mockRedisDel = mock(() => Promise.resolve(1));
const mockRedisIncr = mock(() => Promise.resolve(1));
const mockRedisExpire = mock(() => Promise.resolve(1));

mock.module("../../src/config/database", () => ({
  prisma: { vps: { findUnique: mockFindUnique } },
}));
mock.module("../../src/services/audit.service", () => ({
  auditService: { record: mockAuditRecord },
}));
mock.module("../../src/services/proxmox.service", () => ({
  proxmoxService: { changeVmPassword: mockChangeVmPassword },
  parseMemoryMiB: () => 1024,
}));
mock.module("../../src/services/email.service", () => ({
  emailService: {
    sendVpsPasswordOtp: mockSendVpsPasswordOtp,
    sendVpsPasswordChanged: mockSendVpsPasswordChanged,
    sendVpsProvisioned: mock(() => Promise.resolve()),
  },
}));
mock.module("../../src/config/redis", () => ({
  redis: {
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
    incr: mockRedisIncr,
    expire: mockRedisExpire,
  },
}));
mock.module("../../src/services/system-config.service", () => ({
  systemConfigService: { get: mock(() => Promise.resolve("ubuntu")) },
}));
mock.module("../../src/utils/logger", () => ({
  logger: {
    info:    mock(() => {}),
    warn:    mock(() => {}),
    error:   mock(() => {}),
    auth:    mock(() => {}),
    payment: mock(() => {}),
    vps:     mock(() => {}),
    admin:   mock(() => {}),
  },
}));

const sampleVps = {
  id: 1,
  vmid: 200,
  name: "qc-1",
  deleted_at: null,
  order: {
    users_id: 42,
    user: { email: "user@test.com" },
    package: { os: { os_name: "Ubuntu" } },
  },
};

describe("vpsService.requestPasswordChange", () => {
  let vpsService: typeof import("../../src/services/vps.service").vpsService;

  beforeEach(async () => {
    mockFindUnique.mockReset();
    mockRedisSet.mockReset();
    mockRedisDel.mockReset();
    mockSendVpsPasswordOtp.mockReset();
    mockSendVpsPasswordOtp.mockResolvedValue(undefined);
    mockRedisSet.mockResolvedValue("OK");
    mockRedisDel.mockResolvedValue(1);

    const mod = await import("../../src/services/vps.service");
    vpsService = mod.vpsService;
  });

  it("returns NOT_FOUND when VPS does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const r = await vpsService.requestPasswordChange(1, 42, "users");
    expect(r).toEqual({ error: "NOT_FOUND" });
  });

  it("returns FORBIDDEN when non-owner user requests", async () => {
    mockFindUnique.mockResolvedValue(sampleVps);
    const r = await vpsService.requestPasswordChange(1, 99, "users");
    expect(r).toEqual({ error: "FORBIDDEN" });
  });

  it("sends OTP email and returns success for valid owner", async () => {
    mockFindUnique.mockResolvedValue(sampleVps);
    const r = await vpsService.requestPasswordChange(1, 42, "users");
    expect("data" in r).toBe(true);
    expect(mockSendVpsPasswordOtp).toHaveBeenCalledTimes(1);
    expect(mockSendVpsPasswordOtp.mock.calls[0][0]).toBe("user@test.com");
    expect(mockSendVpsPasswordOtp.mock.calls[0][1]).toBe("qc-1");
    // OTP should be 6 digits
    const otp = mockSendVpsPasswordOtp.mock.calls[0][2] as string;
    expect(/^\d{6}$/.test(otp)).toBe(true);
  });

  it("admin can request OTP for any VPS", async () => {
    mockFindUnique.mockResolvedValue(sampleVps);
    const r = await vpsService.requestPasswordChange(1, 1, "admin");
    expect("data" in r).toBe(true);
  });

  it("returns EMAIL_FAILED when email throws", async () => {
    mockFindUnique.mockResolvedValue(sampleVps);
    mockSendVpsPasswordOtp.mockRejectedValue(new Error("SMTP error"));
    const r = await vpsService.requestPasswordChange(1, 42, "users");
    expect(r).toEqual({ error: "EMAIL_FAILED" });
  });
});

describe("vpsService.confirmPasswordChange", () => {
  let vpsService: typeof import("../../src/services/vps.service").vpsService;

  beforeEach(async () => {
    mockFindUnique.mockReset();
    mockRedisGet.mockReset();
    mockRedisDel.mockReset();
    mockRedisIncr.mockReset();
    mockRedisExpire.mockReset();
    mockChangeVmPassword.mockReset();
    mockSendVpsPasswordChanged.mockReset();
    mockAuditRecord.mockReset();

    mockChangeVmPassword.mockResolvedValue(undefined);
    mockSendVpsPasswordChanged.mockResolvedValue(undefined);
    mockRedisIncr.mockResolvedValue(1);
    mockRedisExpire.mockResolvedValue(1);
    mockRedisDel.mockResolvedValue(1);

    const mod = await import("../../src/services/vps.service");
    vpsService = mod.vpsService;
  });

  it("returns INVALID_PASSWORD if password too short", async () => {
    const r = await vpsService.confirmPasswordChange(1, 42, "users", "123456", "short");
    expect(r).toEqual({ error: "INVALID_PASSWORD" });
  });

  it("returns INVALID_PASSWORD if password too long", async () => {
    const r = await vpsService.confirmPasswordChange(1, 42, "users", "123456", "a".repeat(65));
    expect(r).toEqual({ error: "INVALID_PASSWORD" });
  });

  it("returns INVALID_PASSWORD if password contains newline", async () => {
    const r = await vpsService.confirmPasswordChange(1, 42, "users", "123456", "pass\nword!");
    expect(r).toEqual({ error: "INVALID_PASSWORD" });
  });

  it("returns NOT_FOUND when VPS does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const r = await vpsService.confirmPasswordChange(1, 42, "users", "123456", "ValidPass1");
    expect(r).toEqual({ error: "NOT_FOUND" });
  });

  it("returns OTP_EXPIRED when no OTP in Redis", async () => {
    mockFindUnique.mockResolvedValue(sampleVps);
    mockRedisGet.mockImplementation((key: string) =>
      key.includes("tries") ? Promise.resolve("0") : Promise.resolve(null)
    );
    const r = await vpsService.confirmPasswordChange(1, 42, "users", "123456", "ValidPass1");
    expect(r).toEqual({ error: "OTP_EXPIRED" });
  });

  it("returns OTP_INVALID and increments tries on wrong OTP", async () => {
    mockFindUnique.mockResolvedValue(sampleVps);
    // Pre-hash a known OTP "999999" and store that as the Redis value
    const wrongOtpHash = await (async () => {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("999999"));
      return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
    })();
    mockRedisGet.mockImplementation((key: string) =>
      key.includes("tries") ? Promise.resolve("0") : Promise.resolve(wrongOtpHash)
    );
    const r = await vpsService.confirmPasswordChange(1, 42, "users", "000000", "ValidPass1");
    expect(r).toEqual({ error: "OTP_INVALID" });
    expect(mockRedisIncr).toHaveBeenCalledTimes(1);
  });

  it("returns OTP_MAX_TRIES when attempts exhausted", async () => {
    mockFindUnique.mockResolvedValue(sampleVps);
    mockRedisGet.mockImplementation((key: string) =>
      key.includes("tries") ? Promise.resolve("5") : Promise.resolve("somehash")
    );
    const r = await vpsService.confirmPasswordChange(1, 42, "users", "123456", "ValidPass1");
    expect(r).toEqual({ error: "OTP_MAX_TRIES" });
  });

  it("changes password and records audit on valid OTP", async () => {
    mockFindUnique.mockResolvedValue(sampleVps);
    const otp = "123456";
    const hash = await (async () => {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otp));
      return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
    })();
    mockRedisGet.mockImplementation((key: string) =>
      key.includes("tries") ? Promise.resolve("0") : Promise.resolve(hash)
    );
    const r = await vpsService.confirmPasswordChange(1, 42, "users", otp, "NewSecurePass1");
    expect("data" in r).toBe(true);
    expect(mockChangeVmPassword).toHaveBeenCalledTimes(1);
    expect(mockChangeVmPassword.mock.calls[0][1]).toBe("ubuntu"); // defaultUser
    expect(mockChangeVmPassword.mock.calls[0][2]).toBe("NewSecurePass1");
    expect(mockChangeVmPassword.mock.calls[0][3]).toBe("linux"); // osType
    expect(mockAuditRecord).toHaveBeenCalledTimes(1);
    const audit = mockAuditRecord.mock.calls[0][0] as any;
    expect(audit.action).toBe("UPDATE");
    expect(audit.entity).toBe("VPS_TERMINAL");
    expect(audit.metadata?.action).toBe("password_change");
  });

  it("passes osType=windows for Windows VPS so the guest-agent command differs from Linux", async () => {
    const windowsVps = {
      ...sampleVps,
      order: { ...sampleVps.order, package: { os: { os_name: "Windows Server 2022" } } },
    };
    mockFindUnique.mockResolvedValue(windowsVps);
    const otp = "123456";
    const hash = await (async () => {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otp));
      return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
    })();
    mockRedisGet.mockImplementation((key: string) =>
      key.includes("tries") ? Promise.resolve("0") : Promise.resolve(hash)
    );
    const r = await vpsService.confirmPasswordChange(1, 42, "users", otp, "NewSecurePass1");
    expect("data" in r).toBe(true);
    expect(mockChangeVmPassword.mock.calls[0][3]).toBe("windows"); // osType
  });

  it("returns AGENT_ERROR when changeVmPassword throws", async () => {
    mockFindUnique.mockResolvedValue(sampleVps);
    const otp = "123456";
    const hash = await (async () => {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otp));
      return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
    })();
    mockRedisGet.mockImplementation((key: string) =>
      key.includes("tries") ? Promise.resolve("0") : Promise.resolve(hash)
    );
    mockChangeVmPassword.mockRejectedValue(new Error("QEMU guest agent not running"));
    const r = await vpsService.confirmPasswordChange(1, 42, "users", otp, "NewSecurePass1");
    expect(r).toEqual({ error: "AGENT_ERROR", detail: "QEMU guest agent not running" });
  });
});
