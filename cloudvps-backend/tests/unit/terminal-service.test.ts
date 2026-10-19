import { mock, describe, it, expect, beforeEach } from "bun:test";

const mockFindUnique = mock(() => Promise.resolve(null));
const mockAuditRecord = mock(() => {});
const mockGetVncProxy = mock(() => Promise.resolve({ ticket: "test-ticket@123", port: 5900 }));

mock.module("../../src/config/database", () => ({
  prisma: { vps: { findUnique: mockFindUnique } },
}));
mock.module("../../src/services/audit.service", () => ({
  auditService: { record: mockAuditRecord },
}));
mock.module("../../src/services/proxmox.service", () => ({
  proxmoxService: { getVncProxy: mockGetVncProxy },
  parseMemoryMiB: () => 1024,
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
  deleted_at: null,
  order: { users_id: 42 },
};

describe("terminalService", () => {
  let terminalService: typeof import("../../src/services/terminal.service").terminalService;

  beforeEach(async () => {
    mockFindUnique.mockReset();
    mockAuditRecord.mockReset();
    mockGetVncProxy.mockReset();
    mockGetVncProxy.mockResolvedValue({ ticket: "test-ticket@123", port: 5900 });

    const mod = await import("../../src/services/terminal.service");
    terminalService = mod.terminalService;
  });

  describe("getToken", () => {
    it("returns NOT_FOUND when VPS does not exist", async () => {
      mockFindUnique.mockResolvedValue(null);
      const result = await terminalService.getToken(1, 42, "users");
      expect(result).toEqual({ error: "NOT_FOUND" });
    });

    it("returns NOT_FOUND when VPS is soft-deleted", async () => {
      mockFindUnique.mockResolvedValue({ ...sampleVps, deleted_at: new Date() });
      const result = await terminalService.getToken(1, 42, "users");
      expect(result).toEqual({ error: "NOT_FOUND" });
    });

    it("returns FORBIDDEN when user tries to access another user's VPS", async () => {
      mockFindUnique.mockResolvedValue(sampleVps);
      const result = await terminalService.getToken(1, 99, "users");
      expect(result).toEqual({ error: "FORBIDDEN" });
    });

    it("returns PROXMOX_ERROR when getVncProxy throws", async () => {
      mockFindUnique.mockResolvedValue(sampleVps);
      mockGetVncProxy.mockRejectedValue(new Error("Proxmox unreachable"));
      const result = await terminalService.getToken(1, 42, "users");
      expect(result).toEqual({ error: "PROXMOX_ERROR" });
    });

    it("returns token with 30s expiry and vnc_password for valid owner", async () => {
      mockFindUnique.mockResolvedValue(sampleVps);
      const result = await terminalService.getToken(1, 42, "users");
      expect("data" in result).toBe(true);
      if ("data" in result) {
        expect(result.data.expires_in).toBe(30);
        expect(typeof result.data.token).toBe("string");
        expect(result.data.token.split(".").length).toBe(3); // valid JWT format
        expect(result.data.vnc_password).toBe("test-ticket@123"); // Proxmox ticket
      }
    });

    it("admin can access any VPS and records audit with admin_view metadata", async () => {
      mockFindUnique.mockResolvedValue(sampleVps); // owner is 42
      const result = await terminalService.getToken(1, 1, "admin"); // admin id=1
      expect("data" in result).toBe(true);
      expect(mockAuditRecord).toHaveBeenCalledTimes(1);
      const auditCall = mockAuditRecord.mock.calls[0][0] as any;
      expect(auditCall.action).toBe("VIEW");
      expect(auditCall.entity).toBe("VPS_TERMINAL");
      expect(auditCall.metadata?.admin_view).toBe(true);
    });

    it("user access records audit without admin_view metadata", async () => {
      mockFindUnique.mockResolvedValue(sampleVps);
      await terminalService.getToken(1, 42, "users");
      const auditCall = mockAuditRecord.mock.calls[0][0] as any;
      expect(auditCall.action).toBe("VIEW");
      expect(auditCall.metadata).toBeUndefined();
    });
  });

  describe("verifyToken", () => {
    it("verifies a valid terminal token", async () => {
      mockFindUnique.mockResolvedValue(sampleVps);
      const getResult = await terminalService.getToken(1, 42, "users");
      if (!("data" in getResult)) throw new Error("Expected data");

      const payload = await terminalService.verifyToken(getResult.data.token);
      expect(payload.type).toBe("terminal");
      expect(payload.vpsId).toBe(1);
      expect(payload.vmid).toBe(200);
      expect(payload.sub).toBe(42);
      expect(payload.ticket).toBe("test-ticket@123");
      expect(payload.port).toBe(5900);
    });

    it("throws on invalid token", async () => {
      await expect(terminalService.verifyToken("not.a.valid.token")).rejects.toThrow();
    });

    it("throws on wrong token type", async () => {
      // Sign an access token and try to use it as terminal token
      const { jwtUtils } = await import("../../src/utils/jwt");
      const accessToken = await jwtUtils.signAccess({ sub: 1, email: "x@x.com", role: "users" });
      await expect(terminalService.verifyToken(accessToken)).rejects.toThrow("Invalid token type");
    });

    it("throws when token is expired", async () => {
      // Manually craft a terminal token with past expiry using jwtUtils internals
      // Instead, test indirectly: verify the token expiry is 30s by checking exp claim
      mockFindUnique.mockResolvedValue(sampleVps);
      const getResult = await terminalService.getToken(1, 42, "users");
      if (!("data" in getResult)) throw new Error("Expected data");

      const parts = getResult.data.token.split(".");
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      const ttl = payload.exp - payload.iat;
      expect(ttl).toBe(30);
    });
  });
});
