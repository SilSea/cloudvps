"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Send, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge"
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge"
import { TicketAttachmentPicker } from "@/components/tickets/ticket-attachment-picker"
import { useTicket, useAddMessage, useUpdateTicketStatus, useSetTicketPriority, useAssignTicket } from "@/hooks/useTickets"
import { formatDate, toUploadSrc } from "@/lib/utils"
import { TICKET_STATUS_LABELS, TICKET_PRIORITY_LABELS } from "@/types/ticket"
import type { TicketStatus, TicketPriority } from "@/types/ticket"

const STATUS_OPTIONS: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"]
const PRIORITY_OPTIONS: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"]

export default function AdminTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const ticketId = Number(id)
  const router = useRouter()
  const { data: ticket, isLoading } = useTicket(ticketId)
  const addMessage = useAddMessage(ticketId)
  const updateStatus = useUpdateTicketStatus(ticketId)
  const setPriority = useSetTicketPriority(ticketId)
  const assign = useAssignTicket(ticketId)

  const [message, setMessage] = useState("")
  const [isInternal, setIsInternal] = useState(false)
  const [assignUserId, setAssignUserId] = useState("")
  const [attachments, setAttachments] = useState<File[]>([])

  const handleSend = async () => {
    if (!message.trim()) return
    await addMessage.mutateAsync({ message, is_internal: isInternal, attachments })
    setMessage("")
    setAttachments([])
  }

  const handleAssign = () => {
    const uid = Number(assignUserId)
    if (uid) assign.mutate({ assigned_to: uid })
  }

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-24 rounded-[8px]" />
      <Skeleton className="h-40 rounded-[8px]" />
    </div>
  )

  if (!ticket) return <p className="text-text-secondary">ไม่พบ Ticket</p>

  const isClosed = ticket.status === "CLOSED"

  return (
    <div className="space-y-4 max-w-2xl">
      <Button variant="ghost" size="sm" className="text-text-secondary -ml-2" onClick={() => router.back()}>
        ← กลับ
      </Button>

      <div className="bg-surface border border-border rounded-[8px] p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-text-secondary mb-1">{ticket.ref_no}</p>
            <h1 className="text-lg font-bold text-text-primary">{ticket.title}</h1>
            <p className="text-xs text-text-secondary mt-0.5">{ticket.category?.name} · {ticket.user?.email}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-secondary block mb-1">สถานะ</label>
            <select
              value={ticket.status}
              onChange={(e) => updateStatus.mutate({ status: e.target.value as TicketStatus })}
              className="w-full px-3 py-2 text-sm border border-border rounded-[8px] bg-background focus:outline-none focus:border-primary"
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{TICKET_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">Priority</label>
            <select
              value={ticket.priority}
              onChange={(e) => setPriority.mutate({ priority: e.target.value as TicketPriority })}
              className="w-full px-3 py-2 text-sm border border-border rounded-[8px] bg-background focus:outline-none focus:border-primary"
            >
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</option>)}
            </select>
          </div>
        </div>

        <div>
          <p className="text-xs text-text-secondary mb-1">
            มอบหมาย: {ticket.assigned_user?.email ?? "ยังไม่ได้มอบหมาย"}
          </p>
          <div className="flex gap-2">
            <Input
              type="number"
              placeholder="User ID"
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              className="w-32 h-8 text-sm"
            />
            <Button size="sm" variant="outline" className="rounded-[9999px] text-xs h-8" onClick={handleAssign} disabled={assign.isPending || !assignUserId}>
              มอบหมาย
            </Button>
          </div>
        </div>

        <p className="text-xs text-text-secondary">เปิดเมื่อ {formatDate(ticket.created_at)}</p>
      </div>

      <div className="space-y-3">
        {(ticket.messages ?? []).map((msg) => {
          const isStaff = msg.sender?.role !== "USER" && msg.sender?.role !== "users"
          return (
            <div key={msg.id} className={`rounded-[8px] p-4 border ${
              msg.is_internal
                ? "bg-accent-yellow/5 border-accent-yellow/30 border-dashed"
                : isStaff
                ? "bg-primary/5 border-primary/20"
                : "bg-surface border-border"
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-primary">
                  {msg.sender?.email ?? "ผู้ใช้"}
                  {isStaff && <span className="ml-1 text-primary">(Staff)</span>}
                  {msg.is_internal && <span className="ml-1 text-accent-yellow">[Internal]</span>}
                </span>
                <span className="text-xs text-text-secondary">{formatDate(msg.created_at)}</span>
              </div>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{msg.message}</p>
              {!!msg.attachments?.length && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {msg.attachments.map((att, i) => (
                    <a key={i} href={toUploadSrc(att.url)} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={toUploadSrc(att.url)} alt={att.name} className="h-16 w-16 object-cover rounded-[4px] border border-border" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!isClosed && (
        <div className="bg-surface border border-border rounded-[8px] p-4 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsInternal(!isInternal)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-[9999px] border transition-colors ${
                isInternal
                  ? "bg-accent-yellow/10 text-accent-yellow border-accent-yellow/30"
                  : "border-border text-text-secondary hover:border-primary"
              }`}
            >
              {isInternal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {isInternal ? "Internal Note" : "Reply ปกติ"}
            </button>
          </div>
          <Textarea
            rows={3}
            placeholder={isInternal ? "บันทึกภายใน (ผู้ใช้จะไม่เห็น)..." : "พิมพ์ข้อความ..."}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <TicketAttachmentPicker files={attachments} onChange={setAttachments} disabled={addMessage.isPending} />
          <Button
            size="sm"
            className="rounded-[9999px]"
            disabled={addMessage.isPending || !message.trim()}
            onClick={handleSend}
          >
            {addMessage.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            ส่ง
          </Button>
        </div>
      )}
    </div>
  )
}
