"use client"

import Link from "next/link"
import { useState } from "react"
import { Plus, Ticket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge"
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge"
import { useTickets } from "@/hooks/useTickets"
import { formatDate } from "@/lib/utils"
import type { TicketStatus } from "@/types/ticket"
import { TICKET_STATUS_LABELS } from "@/types/ticket"

const STATUS_OPTIONS: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"]

export default function UserTicketsPage() {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "ALL">("ALL")
  const { data, isLoading } = useTickets(
    statusFilter !== "ALL" ? { status: statusFilter } : undefined
  )
  const tickets = data?.tickets ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-text-primary">Support Tickets</h1>
        <Link href="/tickets/new">
          <Button className="rounded-[9999px]" size="sm">
            <Plus className="h-4 w-4 mr-1" /> เปิด Ticket ใหม่
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["ALL", ...STATUS_OPTIONS] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            className="rounded-[9999px] h-7 px-3 text-xs"
            onClick={() => setStatusFilter(s)}
          >
            {s === "ALL" ? "ทั้งหมด" : TICKET_STATUS_LABELS[s]}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-[8px]" />)}
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 bg-surface border border-border rounded-[8px]">
          <Ticket className="h-12 w-12 text-border mx-auto mb-4" />
          <p className="text-text-secondary mb-4">ยังไม่มี Ticket</p>
          <Link href="/tickets/new">
            <Button className="rounded-[9999px]" size="sm">เปิด Ticket ใหม่</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/tickets/${ticket.id}`}>
              <div className="bg-surface border border-border rounded-[8px] p-4 hover:border-primary/50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-text-secondary">{ticket.ref_no}</span>
                      <TicketStatusBadge status={ticket.status} />
                      <TicketPriorityBadge priority={ticket.priority} />
                    </div>
                    <p className="font-medium text-text-primary text-sm truncate">{ticket.title}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{ticket.category?.name}</p>
                  </div>
                  <p className="text-xs text-text-secondary shrink-0">{formatDate(ticket.updated_at)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
