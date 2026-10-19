"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Send, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge"
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge"
import { TicketAttachmentPicker } from "@/components/tickets/ticket-attachment-picker"
import { useTicket, useAddMessage, useUpdateTicketStatus } from "@/hooks/useTickets"
import { formatDate, toUploadSrc } from "@/lib/utils"

export default function UserTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const ticketId = Number(id)
  const router = useRouter()
  const { data: ticket, isLoading } = useTicket(ticketId)
  const addMessage = useAddMessage(ticketId)
  const updateStatus = useUpdateTicketStatus(ticketId)
  const [message, setMessage] = useState("")
  const [attachments, setAttachments] = useState<File[]>([])

  const handleSend = async () => {
    if (!message.trim()) return
    await addMessage.mutateAsync({ message, attachments })
    setMessage("")
    setAttachments([])
  }

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-24 rounded-[8px]" />
      <Skeleton className="h-40 rounded-[8px]" />
    </div>
  )

  if (!ticket) return <p className="text-text-secondary">ไม่พบ Ticket</p>

  const isClosed = ticket.status === "CLOSED"
  const visibleMessages = (ticket.messages ?? []).filter((m) => !m.is_internal)

  return (
    <div className="space-y-4 max-w-2xl">
      <Button variant="ghost" size="sm" className="text-text-secondary -ml-2" onClick={() => router.back()}>
        ← กลับ
      </Button>

      <div className="bg-surface border border-border rounded-[8px] p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs text-text-secondary mb-1">{ticket.ref_no}</p>
            <h1 className="text-lg font-bold text-text-primary">{ticket.title}</h1>
            <p className="text-xs text-text-secondary mt-0.5">{ticket.category?.name}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priority} />
          </div>
        </div>
        <div className="text-xs text-text-secondary">
          เปิดเมื่อ {formatDate(ticket.created_at)}
          {ticket.assigned_user && <> · มอบหมาย: {ticket.assigned_user.email}</>}
        </div>
        {!isClosed && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-[9999px] text-xs"
            disabled={updateStatus.isPending}
            onClick={() => updateStatus.mutate({ status: "CLOSED" })}
          >
            {updateStatus.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            ปิด Ticket
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {visibleMessages.map((msg) => {
          const isStaff = msg.sender?.role !== "USER" && msg.sender?.role !== "users"
          return (
            <div key={msg.id} className={`rounded-[8px] p-4 border ${isStaff ? "bg-primary/5 border-primary/20" : "bg-surface border-border"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-primary">
                  {msg.sender?.email ?? "ผู้ใช้"}
                  {isStaff && <span className="ml-1 text-primary">(Staff)</span>}
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
          <Textarea
            rows={3}
            placeholder="พิมพ์ข้อความ..."
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
      {isClosed && (
        <div className="flex items-center gap-2 text-sm text-text-secondary bg-surface border border-border rounded-[8px] p-3">
          <Lock className="h-4 w-4" /> Ticket นี้ถูกปิดแล้ว
        </div>
      )}
    </div>
  )
}
