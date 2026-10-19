import type { Role } from "@/types/auth"
import type { PaymentMethod } from "@/types/transaction"

export const ROLES: Record<Role, Role> = {
  ADMIN: "ADMIN",
  SUPPORT: "SUPPORT",
  USER: "USER",
}

export const ROLE_HOME: Record<Role, string> = {
  ADMIN: "/admin/dashboard",
  SUPPORT: "/support",
  USER: "/dashboard",
}

// VPS status is boolean: true = running, false = stopped
export const VPS_STATUS_COLOR: Record<"running" | "stopped", string> = {
  running: "bg-accent-green text-white",
  stopped: "bg-text-secondary text-white",
}

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  TRUEMONEY: "TrueMoney Angpao",
  SLIP: "สลิปโอนเงิน (SlipOK)",
  PROMPTPAY: "PromptPay QR",
}

export const SLIP_MAX_SIZE = 5 * 1024 * 1024 // 5MB
export const SLIP_ACCEPT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const

export const TICKET_ATTACHMENT_MAX_FILES = 3
export const TICKET_ATTACHMENT_MAX_SIZE = 5 * 1024 * 1024 // 5MB
export const TICKET_ATTACHMENT_ACCEPT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const

export const VPS_EXPIRY_WARNING_DAYS = 3

// Bank codes accepted by payment.bank_code system config (backend frontend.md §15)
export const BANK_LABELS: Record<string, string> = {
  KBANK: "กสิกรไทย",
  SCB: "ไทยพาณิชย์",
  KTB: "กรุงไทย",
  BBL: "กรุงเทพ",
  BAY: "กรุงศรีอยุธยา",
  TTB: "ทีทีบี",
  GSB: "ออมสิน",
}
