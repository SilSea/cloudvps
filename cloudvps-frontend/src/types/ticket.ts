export type TicketStatus = "OPEN" | "IN_PROGRESS" | "WAITING_USER" | "RESOLVED" | "CLOSED"
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT"

export interface TicketCategory {
  id: number
  name: string
  description?: string | null
  status: boolean
  created_at: string
  updated_at: string
}

// Shape of an attachment as returned by the API (files are uploaded via multipart, see AddMessageInput)
export interface TicketAttachment {
  name: string
  mime_type: string
  url: string
  size: number
}

export interface TicketMessage {
  id: number
  ticket_id: number
  sender_id: number
  sender?: { id: number; email: string; role: string }
  message: string
  attachments?: TicketAttachment[]
  is_internal: boolean
  created_at: string
}

export interface Ticket {
  id: number
  ref_no: string
  title: string
  category_id: number
  category?: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  user_id: number
  user?: { id: number; email: string }
  assigned_to?: number | null
  assigned_user?: { id: number; email: string } | null
  closed_at?: string | null
  created_at: string
  updated_at: string
  messages?: TicketMessage[]
}

export interface TicketListResponse {
  tickets: Ticket[]
  total: number
  page: number
  limit: number
}

export interface CreateTicketInput {
  title: string
  category_id: number
  message: string
}

export interface AddMessageInput {
  message: string
  is_internal?: boolean
  // POST /api/tickets/:id/messages is multipart/form-data (2026-07 phase15) — raw files, max 3, 5MB each
  attachments?: File[]
}

export interface UpdateTicketStatusInput {
  status: TicketStatus
}

export interface AssignTicketInput {
  assigned_to: number
}

export interface SetPriorityInput {
  priority: TicketPriority
}

export interface CreateCategoryInput {
  name: string
  description?: string
}

export interface UpdateCategoryInput {
  name?: string
  description?: string
}

export interface TicketFilters {
  page?: number
  limit?: number
  status?: TicketStatus
  priority?: TicketPriority
  category_id?: number
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: "เปิด",
  IN_PROGRESS: "กำลังดำเนินการ",
  WAITING_USER: "รอผู้ใช้",
  RESOLVED: "แก้ไขแล้ว",
  CLOSED: "ปิด",
}

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  OPEN: "bg-primary/10 text-primary border-primary/20",
  IN_PROGRESS: "bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20",
  WAITING_USER: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  RESOLVED: "bg-accent-green/10 text-accent-green border-accent-green/20",
  CLOSED: "bg-text-secondary/10 text-text-secondary border-text-secondary/20",
}

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: "ต่ำ",
  MEDIUM: "ปานกลาง",
  HIGH: "สูง",
  URGENT: "เร่งด่วน",
}

export const TICKET_PRIORITY_COLORS: Record<TicketPriority, string> = {
  LOW: "bg-text-secondary/10 text-text-secondary border-text-secondary/20",
  MEDIUM: "bg-primary/10 text-primary border-primary/20",
  HIGH: "bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20",
  URGENT: "bg-secondary/10 text-secondary border-secondary/20",
}
