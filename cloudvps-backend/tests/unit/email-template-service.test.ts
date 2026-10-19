import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock state ────────────────────────────────────────────────────────────────
let _tplRecord:    any = null;
let _tplList:      any[] = [];
let _upsertResult: any = null;
let _updateResult: any = null;

const findUniqueFn   = mock(async () => _tplRecord);
const findManyFn     = mock(async () => _tplList);
const upsertFn       = mock(async () => _upsertResult);
const updateFn       = mock(async () => _updateResult);
const redisGetFn     = mock(async () => null);
const redisSetexFn   = mock(async () => "OK");
const redisDelFn     = mock(async () => 1);
const auditRecordFn  = mock((..._: any[]) => {});
const loggerInfoFn   = mock((..._: any[]) => {});

mock.module("../../src/config/database", () => ({
  prisma: {
    email_templates: {
      findUnique: findUniqueFn,
      findMany:   findManyFn,
      upsert:     upsertFn,
      update:     updateFn,
    },
  },
}));

mock.module("../../src/config/redis", () => ({
  redis: { get: redisGetFn, setex: redisSetexFn, del: redisDelFn },
}));

mock.module("../../src/services/audit.service", () => ({
  auditService: { record: auditRecordFn },
}));

mock.module("../../src/utils/logger", () => ({
  logger: {
    info:    loggerInfoFn,
    warn:    mock(() => {}),
    error:   mock(() => {}),
    auth:    mock(() => {}),
    payment: mock(() => {}),
    vps:     mock(() => {}),
    admin:   mock(() => {}),
  },
}));

const { emailTemplateService, renderTemplate, DEFAULT_TEMPLATES } =
  await import("../../src/services/email-template.service");

describe("renderTemplate()", () => {
  it("TPL-1: interpolates all provided variables", () => {
    const result = renderTemplate(
      { subject: "Hello {{name}}", body_html: "<p>Dear {{name}}, your VPS {{vps_name}} is ready</p>" },
      { name: "Alice", vps_name: "VPS-01" }
    );
    expect(result.subject).toBe("Hello Alice");
    expect(result.body_html).toBe("<p>Dear Alice, your VPS VPS-01 is ready</p>");
  });

  it("TPL-2: leaves unmatched placeholders intact", () => {
    const result = renderTemplate(
      { subject: "{{greeting}} {{name}}", body_html: "{{body}}" },
      { greeting: "Hi" }
    );
    expect(result.subject).toBe("Hi {{name}}");
    expect(result.body_html).toBe("{{body}}");
  });

  it("TPL-3: subject with no placeholders passes through unchanged", () => {
    const result = renderTemplate(
      { subject: "Static subject", body_html: "Static body" },
      { name: "Alice" }
    );
    expect(result.subject).toBe("Static subject");
  });

  it("TPL-4: multiple occurrences of same variable all replaced", () => {
    const result = renderTemplate(
      { subject: "{{x}} {{x}}", body_html: "{{x}}" },
      { x: "FOO" }
    );
    expect(result.subject).toBe("FOO FOO");
    expect(result.body_html).toBe("FOO");
  });
});

describe("emailTemplateService.getTemplate()", () => {
  beforeEach(() => {
    _tplRecord = null;
    redisGetFn.mockClear();
    redisSetexFn.mockClear();
    findUniqueFn.mockClear();
  });

  it("TPL-5: returns DB template and caches it when record is active", async () => {
    _tplRecord = { subject: "DB Subject", body_html: "<p>DB</p>", is_active: true };
    const result = await emailTemplateService.getTemplate("VERIFICATION");
    expect(result.subject).toBe("DB Subject");
    expect(result.from_db).toBe(true);
    expect(redisSetexFn).toHaveBeenCalledTimes(1);
  });

  it("TPL-6: returns cached template without hitting DB on cache hit", async () => {
    redisGetFn.mockResolvedValueOnce(
      JSON.stringify({ subject: "Cached", body_html: "<p>from cache</p>" })
    );
    const result = await emailTemplateService.getTemplate("WELCOME");
    expect(result.subject).toBe("Cached");
    expect(findUniqueFn).not.toHaveBeenCalled();
  });

  it("TPL-7: falls back to hardcoded default when DB record is null", async () => {
    _tplRecord = null;
    const result = await emailTemplateService.getTemplate("FORCE_DELETED");
    expect(result.from_db).toBe(false);
    expect(result.subject).toBe(DEFAULT_TEMPLATES.FORCE_DELETED.subject);
  });

  it("TPL-8: falls back to default when DB record is_active=false", async () => {
    _tplRecord = { subject: "Inactive", body_html: "<p>x</p>", is_active: false };
    const result = await emailTemplateService.getTemplate("EXPIRED");
    expect(result.from_db).toBe(false);
    expect(result.subject).toBe(DEFAULT_TEMPLATES.EXPIRED.subject);
  });

  it("TPL-9: invalid JSON in Redis cache falls through to DB", async () => {
    redisGetFn.mockResolvedValueOnce("{{not-json}}");
    _tplRecord = { subject: "DB", body_html: "<p>DB</p>", is_active: true };
    const result = await emailTemplateService.getTemplate("WELCOME");
    expect(result.from_db).toBe(true);
    expect(result.subject).toBe("DB");
  });
});

describe("emailTemplateService.listTemplates()", () => {
  beforeEach(() => {
    _tplList = [];
    findManyFn.mockClear();
  });

  it("TPL-10: returns all 14 template types even when DB is empty", async () => {
    const results = await emailTemplateService.listTemplates();
    expect(results).toHaveLength(14);
    const types = results.map((r) => r.type);
    expect(types).toContain("VERIFICATION");
    expect(types).toContain("WELCOME");
    expect(types).toContain("BROADCAST_MAINTENANCE");
    expect(types).toContain("TICKET_REPLY");
    expect(types).toContain("TICKET_CLOSED");
    expect(types).toContain("VPS_PROVISIONED");
    expect(types).toContain("VPS_PASSWORD_OTP");
    expect(types).toContain("VPS_PASSWORD_CHANGED");
  });

  it("TPL-11: DB record overrides default values", async () => {
    _tplList = [
      {
        type: "WELCOME",
        subject: "Custom Welcome",
        body_html: "<p>custom</p>",
        is_active: true,
        updater: null,
        updated_at: new Date(),
      },
    ];
    const results = await emailTemplateService.listTemplates();
    const welcome = results.find((r) => r.type === "WELCOME");
    expect(welcome?.subject).toBe("Custom Welcome");
    expect(welcome?.from_db).toBe(true);
  });

  it("TPL-12: includes variables array for each type", async () => {
    const results = await emailTemplateService.listTemplates();
    const verif = results.find((r) => r.type === "VERIFICATION");
    expect(verif?.variables).toContain("verify_url");
    const welcome = results.find((r) => r.type === "WELCOME");
    expect(welcome?.variables).toContain("email");
    expect(welcome?.variables).toContain("password");
  });
});

describe("emailTemplateService.upsertTemplate()", () => {
  beforeEach(() => {
    _upsertResult = { id: 1, type: "WELCOME", subject: "S", body_html: "<p>B</p>", is_active: true, updater: null };
    upsertFn.mockClear();
    redisDelFn.mockClear();
    auditRecordFn.mockClear();
  });

  it("TPL-13: calls prisma upsert with correct data", async () => {
    await emailTemplateService.upsertTemplate(
      "WELCOME",
      { subject: "New Subject", body_html: "<p>New</p>", is_active: true },
      1, "admin"
    );
    expect(upsertFn).toHaveBeenCalledTimes(1);
    const call = upsertFn.mock.calls[0][0];
    expect(call.where).toEqual({ type: "WELCOME" });
    expect(call.create.subject).toBe("New Subject");
    expect(call.update.subject).toBe("New Subject");
  });

  it("TPL-14: invalidates Redis cache after upsert", async () => {
    await emailTemplateService.upsertTemplate(
      "VERIFICATION",
      { subject: "S", body_html: "<p>B</p>" },
      1, "admin"
    );
    expect(redisDelFn).toHaveBeenCalledWith("email_tpl:VERIFICATION");
  });

  it("TPL-15: records audit log after upsert", async () => {
    await emailTemplateService.upsertTemplate(
      "WELCOME",
      { subject: "S", body_html: "<p>B</p>" },
      42, "admin", "1.2.3.4"
    );
    expect(auditRecordFn).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 42,
        actorRole: "admin",
        action: "UPDATE",
        entity: "EMAIL_TEMPLATE",
      })
    );
  });
});

describe("emailTemplateService.toggleActive()", () => {
  beforeEach(() => {
    _tplRecord    = { id: 5, type: "WELCOME", is_active: true };
    _updateResult = { id: 5, type: "WELCOME", is_active: false };
    findUniqueFn.mockClear();
    updateFn.mockClear();
    redisDelFn.mockClear();
    auditRecordFn.mockClear();
  });

  it("TPL-16: throws TEMPLATE_NOT_FOUND when record does not exist", async () => {
    _tplRecord = null;
    await expect(
      emailTemplateService.toggleActive("WELCOME", false, 1, "admin")
    ).rejects.toThrow("TEMPLATE_NOT_FOUND");
  });

  it("TPL-17: calls update and invalidates cache on success", async () => {
    await emailTemplateService.toggleActive("WELCOME", false, 1, "admin");
    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(redisDelFn).toHaveBeenCalledWith("email_tpl:WELCOME");
  });

  it("TPL-18: records DISABLE audit action when toggling off", async () => {
    await emailTemplateService.toggleActive("WELCOME", false, 1, "admin");
    expect(auditRecordFn).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DISABLE" })
    );
  });

  it("TPL-19: records ENABLE audit action when toggling on", async () => {
    _updateResult = { id: 5, type: "WELCOME", is_active: true };
    await emailTemplateService.toggleActive("WELCOME", true, 1, "admin");
    expect(auditRecordFn).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ENABLE" })
    );
  });
});

describe("DEFAULT_TEMPLATES completeness", () => {
  const EXPECTED_TYPES = [
    "VERIFICATION", "EXPIRY_WARNING", "EXPIRED", "FORCE_DELETED",
    "AUTO_RENEWAL_REMINDER", "BROADCAST_MAINTENANCE", "BROADCAST_EMERGENCY",
    "BROADCAST_ANNOUNCEMENT", "WELCOME",
  ];

  for (const type of EXPECTED_TYPES) {
    it(`TPL-20-${type}: default template exists with subject and body_html`, () => {
      const tpl = (DEFAULT_TEMPLATES as any)[type];
      expect(tpl).toBeDefined();
      expect(typeof tpl.subject).toBe("string");
      expect(tpl.subject.length).toBeGreaterThan(0);
      expect(typeof tpl.body_html).toBe("string");
      expect(tpl.body_html.length).toBeGreaterThan(0);
    });
  }
});
