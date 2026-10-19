import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock state ────────────────────────────────────────────────────────────────
let _sendMailError: Error | null = null;

const sendMailFn = mock(async (opts: any) => {
  if (_sendMailError) throw _sendMailError;
  return { messageId: "test-id" };
});

mock.module("nodemailer", () => ({
  default: {
    createTransport: () => ({ sendMail: sendMailFn }),
  },
  createTransport: () => ({ sendMail: sendMailFn }),
}));

mock.module("../../src/config/env", () => ({
  env: {
    appUrl: "http://localhost:3000",
    email: { host: "smtp.test.com", port: 587, user: "test@cloudvps.com", pass: "testpass" },
    redis: { host: "localhost", port: 6379, password: "" },
  },
}));

mock.module("../../src/config/redis", () => ({
  redis: { get: mock(async () => null), setex: mock(async () => "OK"), del: mock(async () => 1) },
}));

mock.module("../../src/config/database", () => ({
  prisma: {
    email_templates: {
      findUnique: mock(async () => null),
      findMany:   mock(async () => []),
      upsert:     mock(async () => ({})),
      update:     mock(async () => ({})),
    },
  },
}));

mock.module("../../src/services/audit.service", () => ({
  auditService: { record: mock(() => {}) },
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

const { emailService } = await import("../../src/services/email.service");

describe("emailService", () => {
  beforeEach(() => {
    _sendMailError = null;
    sendMailFn.mockClear();
  });

  // ── sendVerification() ─────────────────────────────────────────────────────
  describe("sendVerification()", () => {
    it("EMAIL-1: sends email with verification URL containing the token", async () => {
      await emailService.sendVerification("user@example.com", "tok123");
      expect(sendMailFn).toHaveBeenCalledTimes(1);
      const opts = sendMailFn.mock.calls[0][0];
      expect(opts.to).toBe("user@example.com");
      expect(opts.html).toContain("tok123");
      expect(opts.html).toContain("http://localhost:3000");
    });

    it("EMAIL-2: subject is verification-related", async () => {
      await emailService.sendVerification("user@example.com", "tok123");
      const opts = sendMailFn.mock.calls[0][0];
      expect(opts.subject.toLowerCase()).toContain("verify");
    });

    it("EMAIL-3: throws when SMTP fails", async () => {
      _sendMailError = new Error("SMTP connection refused");
      await expect(emailService.sendVerification("user@example.com", "tok")).rejects.toThrow("SMTP connection refused");
    });
  });

  // ── sendExpiryWarning() ───────────────────────────────────────────────────
  describe("sendExpiryWarning()", () => {
    it("EMAIL-4: sends 7-day warning with correct subject and VPS name in body", async () => {
      await emailService.sendExpiryWarning("user@example.com", "My-VPS-01", 7);
      const opts = sendMailFn.mock.calls[0][0];
      expect(opts.to).toBe("user@example.com");
      expect(opts.subject).toContain("7");
      expect(opts.html).toContain("My-VPS-01");
    });

    it("EMAIL-5: sends 1-day warning with subject mentioning 1 day", async () => {
      await emailService.sendExpiryWarning("user@example.com", "My-VPS-01", 1);
      const opts = sendMailFn.mock.calls[0][0];
      expect(opts.subject).toContain("1 วัน");
    });

    it("EMAIL-6: throws when SMTP fails", async () => {
      _sendMailError = new Error("SMTP timeout");
      await expect(emailService.sendExpiryWarning("user@example.com", "VPS", 7)).rejects.toThrow();
    });
  });

  // ── sendExpired() ─────────────────────────────────────────────────────────
  describe("sendExpired()", () => {
    it("EMAIL-7: sends expired email with VPS name and grace date in body", async () => {
      const graceDate = new Date("2026-06-01");
      await emailService.sendExpired("user@example.com", "My-VPS-01", graceDate);
      const opts = sendMailFn.mock.calls[0][0];
      expect(opts.to).toBe("user@example.com");
      expect(opts.html).toContain("My-VPS-01");
      expect(opts.subject).toContain("My-VPS-01");
    });

    it("EMAIL-8: subject references the VPS name", async () => {
      await emailService.sendExpired("user@example.com", "VPS-XYZ", new Date());
      const opts = sendMailFn.mock.calls[0][0];
      expect(opts.subject).toContain("VPS-XYZ");
    });
  });

  // ── sendForceDeleted() ────────────────────────────────────────────────────
  describe("sendForceDeleted()", () => {
    it("EMAIL-9: sends force-deleted email with VPS name in subject and body", async () => {
      await emailService.sendForceDeleted("user@example.com", "My-VPS-01");
      const opts = sendMailFn.mock.calls[0][0];
      expect(opts.to).toBe("user@example.com");
      expect(opts.subject).toContain("My-VPS-01");
      expect(opts.html).toContain("My-VPS-01");
    });
  });

  // ── sendRaw() ─────────────────────────────────────────────────────────────
  describe("sendRaw()", () => {
    it("EMAIL-10: sends raw email with exact subject and html", async () => {
      await emailService.sendRaw("user@example.com", "Custom Subject", "<p>Hello</p>");
      const opts = sendMailFn.mock.calls[0][0];
      expect(opts.to).toBe("user@example.com");
      expect(opts.subject).toBe("Custom Subject");
      expect(opts.html).toBe("<p>Hello</p>");
    });

    it("EMAIL-11: uses sender from email config", async () => {
      await emailService.sendRaw("user@example.com", "Sub", "Body");
      const opts = sendMailFn.mock.calls[0][0];
      expect(opts.from).toContain("test@cloudvps.com");
    });
  });
});
