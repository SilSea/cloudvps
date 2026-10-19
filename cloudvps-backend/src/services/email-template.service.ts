import { prisma } from "../config/database";
import { redis } from "../config/redis";
import { auditService } from "./audit.service";
import { logger } from "../utils/logger";
import type { EmailTemplateType } from "@prisma/client";

// Redis TTL for cached templates — 5 minutes. Short enough that admin updates
// take effect quickly; long enough to avoid hitting DB on every email send.
const TEMPLATE_CACHE_TTL = 300;
const cacheKey = (type: EmailTemplateType) => `email_tpl:${type}`;

// Variable metadata for each template type — documents what {{vars}} are available.
const TEMPLATE_VARIABLES: Record<EmailTemplateType, string[]> = {
  VERIFICATION:            ["verify_url"],
  EXPIRY_WARNING:          ["vps_name", "days_left"],
  EXPIRED:                 ["vps_name", "grace_until"],
  FORCE_DELETED:           ["vps_name"],
  AUTO_RENEWAL_REMINDER:   ["vps_name"],
  BROADCAST_MAINTENANCE:   ["subject", "body"],
  BROADCAST_EMERGENCY:     ["subject", "body"],
  BROADCAST_ANNOUNCEMENT:  ["subject", "body"],
  WELCOME:                 ["email", "password", "login_url"],
  TICKET_REPLY:            ["ticket_ref", "ticket_title", "reply_preview"],
  TICKET_CLOSED:           ["ticket_ref", "ticket_title"],
  VPS_PROVISIONED:         ["vps_name", "ip", "username", "password"],
  VPS_PASSWORD_OTP:        ["vps_name", "otp"],
  VPS_PASSWORD_CHANGED:    ["vps_name", "changed_at"],
};

// Default hardcoded templates used as fallback when DB record is missing or inactive.
// These match the inline HTML previously embedded in email.service.ts.
export const DEFAULT_TEMPLATES: Record<EmailTemplateType, { subject: string; body_html: string }> = {
  VERIFICATION: {
    subject: "Verify your CloudVPS account",
    body_html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
  <h2>Welcome to CloudVPS!</h2>
  <p>Click the button below to verify your email address:</p>
  <a href="{{verify_url}}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Verify Email</a>
  <p style="margin-top:16px;color:#666;font-size:13px">Or copy this link:<br/><a href="{{verify_url}}">{{verify_url}}</a></p>
  <p style="color:#999;font-size:12px">This link expires in 24 hours.</p>
</div>`,
  },
  EXPIRY_WARNING: {
    subject: "[CloudVPS] VPS \"{{vps_name}}\" จะหมดอายุใน {{days_left}} วัน",
    body_html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
  <h2>แจ้งเตือน: VPS ใกล้หมดอายุ</h2>
  <p>VPS <strong>{{vps_name}}</strong> ของคุณจะหมดอายุใน <strong>{{days_left}} วัน</strong></p>
  <p>กรุณาต่ออายุก่อนหมดอายุ มิฉะนั้น VM จะถูกหยุดและลบภายใน 7 วันหลังหมดอายุ</p>
  <p style="color:#999;font-size:12px">CloudVPS — VPS Cloud Service</p>
</div>`,
  },
  EXPIRED: {
    subject: "[CloudVPS] VPS \"{{vps_name}}\" หมดอายุแล้ว — ต่ออายุก่อน {{grace_until}}",
    body_html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
  <h2>VPS หมดอายุแล้ว</h2>
  <p>VPS <strong>{{vps_name}}</strong> ของคุณหมดอายุแล้ว VM ถูกหยุดเรียบร้อย</p>
  <p>คุณมีเวลาถึง <strong>{{grace_until}}</strong> ในการต่ออายุ หากไม่ต่ออายุ VM และข้อมูลจะถูกลบถาวร</p>
  <p style="color:#999;font-size:12px">CloudVPS — VPS Cloud Service</p>
</div>`,
  },
  FORCE_DELETED: {
    subject: "[CloudVPS] VPS \"{{vps_name}}\" ถูกลบโดยผู้ดูแลระบบ",
    body_html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
  <h2 style="color:#c62828">VPS ถูกลบโดยผู้ดูแลระบบ</h2>
  <p>VPS <strong>{{vps_name}}</strong> ของคุณถูกลบโดยผู้ดูแลระบบแล้ว</p>
  <p>หากคุณมีข้อสงสัย กรุณาติดต่อทีมสนับสนุน</p>
  <p style="color:#999;font-size:12px">CloudVPS — VPS Cloud Service</p>
</div>`,
  },
  AUTO_RENEWAL_REMINDER: {
    subject: "[CloudVPS] สร้าง order ต่ออายุ VPS \"{{vps_name}}\" อัตโนมัติแล้ว",
    body_html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
  <h2>ต่ออายุอัตโนมัติ</h2>
  <p>ระบบสร้าง order ต่ออายุสำหรับ VPS <strong>{{vps_name}}</strong> ให้อัตโนมัติเรียบร้อยแล้ว</p>
  <p>กรุณาชำระเงินเพื่อต่ออายุ VM ของคุณ มิฉะนั้น VM จะถูกหยุดเมื่อหมดอายุ</p>
  <p style="color:#999;font-size:12px">CloudVPS — VPS Cloud Service</p>
</div>`,
  },
  BROADCAST_MAINTENANCE: {
    subject: "{{subject}}",
    body_html: `<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <div style="background:#f59e0b;padding:16px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0">🔧 แจ้งการบำรุงรักษาระบบ</h2>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="white-space:pre-line">{{body}}</p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/>
    <p style="color:#999;font-size:12px">CloudVPS — VPS Cloud Service</p>
  </div>
</div>`,
  },
  BROADCAST_EMERGENCY: {
    subject: "{{subject}}",
    body_html: `<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <div style="background:#ef4444;padding:16px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0">🚨 แจ้งเหตุฉุกเฉิน</h2>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="white-space:pre-line">{{body}}</p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/>
    <p style="color:#999;font-size:12px">CloudVPS — VPS Cloud Service</p>
  </div>
</div>`,
  },
  BROADCAST_ANNOUNCEMENT: {
    subject: "{{subject}}",
    body_html: `<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <div style="background:#7c3aed;padding:16px;border-radius:8px 8px 0 0">
    <h2 style="color:#fff;margin:0">📢 ประกาศจาก CloudVPS</h2>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="white-space:pre-line">{{body}}</p>
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/>
    <p style="color:#999;font-size:12px">CloudVPS — VPS Cloud Service</p>
  </div>
</div>`,
  },
  WELCOME: {
    subject: "ยินดีต้อนรับสู่ CloudVPS — ข้อมูลบัญชีของคุณ",
    body_html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
  <h2>ยินดีต้อนรับสู่ CloudVPS!</h2>
  <p>บัญชีของคุณถูกสร้างโดยผู้ดูแลระบบเรียบร้อยแล้ว</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:8px;background:#f3f4f6;font-weight:bold;width:40%">Email</td><td style="padding:8px;border:1px solid #e5e7eb">{{email}}</td></tr>
    <tr><td style="padding:8px;background:#f3f4f6;font-weight:bold">Password</td><td style="padding:8px;border:1px solid #e5e7eb">{{password}}</td></tr>
  </table>
  <p style="color:#c62828;font-size:13px">⚠️ กรุณาเปลี่ยนรหัสผ่านทันทีหลังจาก login ครั้งแรก</p>
  <a href="{{login_url}}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:8px">เข้าสู่ระบบ</a>
  <p style="color:#999;font-size:12px;margin-top:24px">CloudVPS — VPS Cloud Service</p>
</div>`,
  },
  TICKET_REPLY: {
    subject: "[CloudVPS] มีการตอบกลับ Ticket {{ticket_ref}}",
    body_html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
  <h2>มีการตอบกลับ Support Ticket ของคุณ</h2>
  <p>Ticket: <strong>{{ticket_ref}}</strong> — {{ticket_title}}</p>
  <blockquote style="border-left:4px solid #7c3aed;padding:8px 16px;margin:16px 0;background:#f5f3ff;color:#374151">{{reply_preview}}</blockquote>
  <p style="color:#999;font-size:12px">CloudVPS — VPS Cloud Service</p>
</div>`,
  },
  TICKET_CLOSED: {
    subject: "[CloudVPS] Ticket {{ticket_ref}} ถูกปิดแล้ว",
    body_html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
  <h2>Support Ticket ของคุณถูกปิดแล้ว</h2>
  <p>Ticket: <strong>{{ticket_ref}}</strong> — {{ticket_title}}</p>
  <p>หากปัญหายังไม่ได้รับการแก้ไข กรุณาเปิด ticket ใหม่</p>
  <p style="color:#999;font-size:12px">CloudVPS — VPS Cloud Service</p>
</div>`,
  },
  VPS_PROVISIONED: {
    subject: "🎉 VPS {{vps_name}} พร้อมใช้งานแล้ว",
    body_html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
  <h2>VPS ของคุณพร้อมใช้งานแล้ว!</h2>
  <p>ข้อมูลสำหรับเข้าใช้งาน:</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:8px;background:#f3f4f6;font-weight:bold;width:40%">VPS Name</td><td style="padding:8px;border:1px solid #e5e7eb">{{vps_name}}</td></tr>
    <tr><td style="padding:8px;background:#f3f4f6;font-weight:bold">IP Address</td><td style="padding:8px;border:1px solid #e5e7eb">{{ip}}</td></tr>
    <tr><td style="padding:8px;background:#f3f4f6;font-weight:bold">Username</td><td style="padding:8px;border:1px solid #e5e7eb">{{username}}</td></tr>
    <tr><td style="padding:8px;background:#f3f4f6;font-weight:bold">Password</td><td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace">{{password}}</td></tr>
  </table>
  <p>เชื่อมต่อผ่าน SSH: <code>ssh {{username}}@{{ip}}</code></p>
  <p style="color:#c62828;font-size:13px">⚠️ กรุณาเปลี่ยนรหัสผ่านทันทีหลังจาก login ครั้งแรก</p>
  <p style="color:#999;font-size:12px">CloudVPS — VPS Cloud Service</p>
</div>`,
  },
  VPS_PASSWORD_OTP: {
    subject: "[CloudVPS] OTP สำหรับเปลี่ยนรหัสผ่าน VPS {{vps_name}}",
    body_html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
  <h2>รหัส OTP สำหรับเปลี่ยนรหัสผ่าน VPS</h2>
  <p>VPS: <strong>{{vps_name}}</strong></p>
  <div style="text-align:center;margin:24px 0">
    <span style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#7c3aed">{{otp}}</span>
  </div>
  <p style="color:#666;font-size:13px">รหัสนี้ใช้ได้ภายใน <strong>5 นาที</strong> เท่านั้น</p>
  <p style="color:#c62828;font-size:13px">⚠️ ถ้าคุณไม่ได้ขอเปลี่ยนรหัสผ่าน กรุณาเพิกเฉย email นี้</p>
  <p style="color:#999;font-size:12px">CloudVPS — VPS Cloud Service</p>
</div>`,
  },
  VPS_PASSWORD_CHANGED: {
    subject: "[CloudVPS] รหัสผ่าน VPS {{vps_name}} ถูกเปลี่ยนแล้ว",
    body_html: `<div style="font-family:sans-serif;max-width:480px;margin:auto">
  <h2>รหัสผ่าน VPS ถูกเปลี่ยนเรียบร้อย</h2>
  <p>VPS: <strong>{{vps_name}}</strong></p>
  <p>เปลี่ยนเมื่อ: {{changed_at}}</p>
  <p style="color:#c62828;font-size:13px">⚠️ ถ้าไม่ใช่คุณที่ทำรายการนี้ กรุณาติดต่อ Support ทันที</p>
  <p style="color:#999;font-size:12px">CloudVPS — VPS Cloud Service</p>
</div>`,
  },
};

// Interpolate {{variable}} placeholders in subject and body_html.
export function renderTemplate(
  template: { subject: string; body_html: string },
  vars: Record<string, string>
): { subject: string; body_html: string } {
  const interpolate = (str: string) =>
    str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
  return {
    subject: interpolate(template.subject),
    body_html: interpolate(template.body_html),
  };
}

export const emailTemplateService = {
  async getTemplate(type: EmailTemplateType): Promise<{ subject: string; body_html: string; from_db: boolean }> {
    // Check Redis cache first.
    const cached = await redis.get(cacheKey(type));
    if (cached) {
      try {
        return { ...JSON.parse(cached), from_db: true };
      } catch {
        // Corrupt cache — fall through to DB.
      }
    }

    const record = await prisma.email_templates.findUnique({ where: { type } });
    if (record && record.is_active) {
      const tpl = { subject: record.subject, body_html: record.body_html };
      await redis.setex(cacheKey(type), TEMPLATE_CACHE_TTL, JSON.stringify(tpl));
      return { ...tpl, from_db: true };
    }

    // Fallback: use hardcoded default.
    return { ...DEFAULT_TEMPLATES[type], from_db: false };
  },

  async listTemplates() {
    const records = await prisma.email_templates.findMany({
      orderBy: { type: "asc" },
      include: { updater: { select: { id: true, email: true } } },
    });

    // Merge DB records with defaults so every type always appears in the list.
    const dbMap = new Map(records.map((r) => [r.type, r]));
    const allTypes = Object.keys(DEFAULT_TEMPLATES) as EmailTemplateType[];

    return allTypes.map((type) => {
      const db = dbMap.get(type);
      const def = DEFAULT_TEMPLATES[type];
      return {
        type,
        subject: db?.subject ?? def.subject,
        body_html: db?.body_html ?? def.body_html,
        variables: TEMPLATE_VARIABLES[type],
        is_active: db?.is_active ?? false,
        from_db: !!db,
        updated_by: db?.updater ?? null,
        updated_at: db?.updated_at ?? null,
      };
    });
  },

  async getByType(type: EmailTemplateType) {
    const record = await prisma.email_templates.findUnique({
      where: { type },
      include: { updater: { select: { id: true, email: true } } },
    });
    const def = DEFAULT_TEMPLATES[type];
    return {
      type,
      subject: record?.subject ?? def.subject,
      body_html: record?.body_html ?? def.body_html,
      variables: TEMPLATE_VARIABLES[type],
      is_active: record?.is_active ?? false,
      from_db: !!record,
      updated_by: record?.updater ?? null,
      updated_at: record?.updated_at ?? null,
    };
  },

  async upsertTemplate(
    type: EmailTemplateType,
    data: { subject: string; body_html: string; is_active?: boolean },
    actorId: number,
    actorRole: string,
    ipAddress?: string
  ) {
    const record = await prisma.email_templates.upsert({
      where: { type },
      create: {
        type,
        subject: data.subject,
        body_html: data.body_html,
        is_active: data.is_active ?? true,
        variables: TEMPLATE_VARIABLES[type],
        updated_by: actorId,
      },
      update: {
        subject: data.subject,
        body_html: data.body_html,
        ...(data.is_active !== undefined && { is_active: data.is_active }),
        updated_by: actorId,
      },
      include: { updater: { select: { id: true, email: true } } },
    });

    // Invalidate cache so next email send picks up new template immediately.
    await redis.del(cacheKey(type));

    auditService.record({
      actorId,
      actorRole,
      action: "UPDATE",
      entity: "EMAIL_TEMPLATE",
      entityId: record.id,
      metadata: { type, subject: data.subject },
      ipAddress,
    });

    logger.info("Email template updated", { type, actorId });
    return record;
  },

  async toggleActive(
    type: EmailTemplateType,
    is_active: boolean,
    actorId: number,
    actorRole: string,
    ipAddress?: string
  ) {
    const existing = await prisma.email_templates.findUnique({ where: { type } });
    if (!existing) throw new Error("TEMPLATE_NOT_FOUND");

    const record = await prisma.email_templates.update({
      where: { type },
      data: { is_active, updated_by: actorId },
    });

    await redis.del(cacheKey(type));

    auditService.record({
      actorId,
      actorRole,
      action: is_active ? "ENABLE" : "DISABLE",
      entity: "EMAIL_TEMPLATE",
      entityId: record.id,
      metadata: { type, is_active },
      ipAddress,
    });

    return record;
  },
};
