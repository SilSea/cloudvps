export type EmailTemplateType =
  | "VERIFICATION"
  | "EXPIRY_WARNING"
  | "EXPIRED"
  | "FORCE_DELETED"
  | "AUTO_RENEWAL_REMINDER"
  | "BROADCAST_MAINTENANCE"
  | "BROADCAST_EMERGENCY"
  | "BROADCAST_ANNOUNCEMENT"
  | "WELCOME"
  | "TICKET_REPLY"
  | "TICKET_CLOSED"

export interface EmailTemplate {
  type: EmailTemplateType
  subject: string
  body_html: string
  variables: string[]
  is_active: boolean
  from_db: boolean
  updated_by: { id: number; email: string } | null
  updated_at: string | null
}

export interface UpdateEmailTemplateInput {
  subject: string
  body_html: string
  is_active?: boolean
}

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateType, string> = {
  VERIFICATION: "ยืนยันอีเมล",
  EXPIRY_WARNING: "แจ้งเตือนใกล้หมดอายุ",
  EXPIRED: "VPS หมดอายุ",
  FORCE_DELETED: "ลบโดยแอดมิน",
  AUTO_RENEWAL_REMINDER: "ต่ออายุอัตโนมัติ",
  BROADCAST_MAINTENANCE: "บำรุงรักษาระบบ",
  BROADCAST_EMERGENCY: "เหตุฉุกเฉิน",
  BROADCAST_ANNOUNCEMENT: "ประกาศทั่วไป",
  WELCOME: "ยินดีต้อนรับ",
  TICKET_REPLY: "Ticket — Staff ตอบกลับ",
  TICKET_CLOSED: "Ticket — ปิด Ticket",
}
