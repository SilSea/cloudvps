import nodemailer from "nodemailer";
import { env } from "../config/env";
import { emailTemplateService, renderTemplate } from "./email-template.service";

// Reuse a single transporter instance across requests to avoid re-establishing
// the SMTP connection on every email send.
const transporter = nodemailer.createTransport({
  host: env.email.host,
  port: env.email.port,
  // Port 465 requires implicit TLS; all other ports (e.g. 587) use STARTTLS.
  secure: env.email.port === 465,
  auth: {
    user: env.email.user,
    pass: env.email.pass,
  },
});

async function send(to: string, subject: string, html: string): Promise<void> {
  await transporter.sendMail({
    from: `"CloudVPS" <${env.email.user}>`,
    to,
    subject,
    html,
  });
}

export const emailService = {
  async sendVerification(to: string, token: string): Promise<void> {
    const url = `${env.appUrl}/api/auth/verify/${token}`;
    const tpl = await emailTemplateService.getTemplate("VERIFICATION");
    const { subject, body_html } = renderTemplate(tpl, { verify_url: url });
    await send(to, subject, body_html);
  },

  async sendWelcome(to: string, password: string): Promise<void> {
    const tpl = await emailTemplateService.getTemplate("WELCOME");
    const { subject, body_html } = renderTemplate(tpl, {
      email: to,
      password,
      login_url: `${env.appUrl}/login`,
    });
    await send(to, subject, body_html);
  },

  async sendExpiryWarning(to: string, vpsName: string, daysLeft: number): Promise<void> {
    const tpl = await emailTemplateService.getTemplate("EXPIRY_WARNING");
    const { subject, body_html } = renderTemplate(tpl, {
      vps_name: vpsName,
      days_left: String(daysLeft),
    });
    await send(to, subject, body_html);
  },

  async sendExpired(to: string, vpsName: string, graceUntil: Date): Promise<void> {
    const dateStr = graceUntil.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" });
    const tpl = await emailTemplateService.getTemplate("EXPIRED");
    const { subject, body_html } = renderTemplate(tpl, {
      vps_name: vpsName,
      grace_until: dateStr,
    });
    await send(to, subject, body_html);
  },

  async sendForceDeleted(to: string, vpsName: string): Promise<void> {
    const tpl = await emailTemplateService.getTemplate("FORCE_DELETED");
    const { subject, body_html } = renderTemplate(tpl, { vps_name: vpsName });
    await send(to, subject, body_html);
  },

  async sendAutoRenewalReminder(to: string, vpsName: string): Promise<void> {
    const tpl = await emailTemplateService.getTemplate("AUTO_RENEWAL_REMINDER");
    const { subject, body_html } = renderTemplate(tpl, { vps_name: vpsName });
    await send(to, subject, body_html);
  },

  // sendRaw is used by broadcast.service.ts which already builds its own HTML.
  // It bypasses the template system intentionally — broadcast body is admin-supplied.
  async sendRaw(to: string, subject: string, html: string): Promise<void> {
    await send(to, subject, html);
  },

  // Used by broadcast.service.ts to wrap body in a typed broadcast template.
  async sendBroadcast(
    to: string,
    subject: string,
    body: string,
    type: "MAINTENANCE" | "EMERGENCY" | "ANNOUNCEMENT"
  ): Promise<void> {
    const tplType = `BROADCAST_${type}` as const;
    const tpl = await emailTemplateService.getTemplate(tplType);
    // subject and body are admin-supplied — interpolate into template wrapper.
    const rendered = renderTemplate(tpl, { subject, body });
    await send(to, rendered.subject || subject, rendered.body_html);
  },

  async sendTicketReply(to: string, ticketRef: string, ticketTitle: string, replyPreview: string): Promise<void> {
    const tpl = await emailTemplateService.getTemplate("TICKET_REPLY");
    const { subject, body_html } = renderTemplate(tpl, {
      ticket_ref: ticketRef,
      ticket_title: ticketTitle,
      reply_preview: replyPreview,
    });
    await send(to, subject, body_html);
  },

  async sendTicketClosed(to: string, ticketRef: string, ticketTitle: string): Promise<void> {
    const tpl = await emailTemplateService.getTemplate("TICKET_CLOSED");
    const { subject, body_html } = renderTemplate(tpl, {
      ticket_ref: ticketRef,
      ticket_title: ticketTitle,
    });
    await send(to, subject, body_html);
  },

  async sendVpsProvisioned(to: string, vpsName: string, ip: string, username: string, password: string): Promise<void> {
    const tpl = await emailTemplateService.getTemplate("VPS_PROVISIONED");
    const { subject, body_html } = renderTemplate(tpl, { vps_name: vpsName, ip, username, password });
    await send(to, subject, body_html);
  },

  async sendVpsPasswordOtp(to: string, vpsName: string, otp: string): Promise<void> {
    const tpl = await emailTemplateService.getTemplate("VPS_PASSWORD_OTP");
    const { subject, body_html } = renderTemplate(tpl, { vps_name: vpsName, otp });
    await send(to, subject, body_html);
  },

  async sendVpsPasswordChanged(to: string, vpsName: string): Promise<void> {
    const tpl = await emailTemplateService.getTemplate("VPS_PASSWORD_CHANGED");
    const changedAt = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
    const { subject, body_html } = renderTemplate(tpl, { vps_name: vpsName, changed_at: changedAt });
    await send(to, subject, body_html);
  },
};
