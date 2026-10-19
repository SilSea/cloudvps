"use client"

import Link from "next/link"
import { useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { TicketStatusBadge } from "@/components/tickets/ticket-status-badge"
import { TicketPriorityBadge } from "@/components/tickets/ticket-priority-badge"
import { useTickets } from "@/hooks/useTickets"
import { formatDate } from "@/lib/utils"
import { TICKET_STATUS_LABELS, TICKET_PRIORITY_LABELS } from "@/types/ticket"
import type { TicketStatus, TicketPriority } from "@/types/ticket"

const STATUS_OPTIONS: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"]
const PRIORITY_OPTIONS: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"]

export default function AdminTicketsPage() {
  const [status, setStatus] = useState<TicketStatus | "">("")
  const [priority, setPriority] = useState<TicketPriority | "">("")

  const { data, isLoading } = useTickets({
    status: status || undefined,
    priority: priority || undefined,
  })
  const tickets = data?.tickets ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-text-primary">Support Tickets</h1>
        <span className="text-sm text-text-secondary">ทั้งหมด {data?.total ?? 0} รายการ</span>
      </div>

      <div className="flex flex-wrap items-end gap-3 p-4 bg-surface border border-border rounded-[8px]">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">สถานะ</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TicketStatus | "")}
            className="px-3 py-2 text-sm border border-border rounded-[8px] bg-background focus:outline-none focus:border-primary"
          >
            <option value="">ทั้งหมด</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{TICKET_STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority | "")}
            className="px-3 py-2 text-sm border border-border rounded-[8px] bg-background focus:outline-none focus:border-primary"
          >
            <option value="">ทั้งหมด</option>
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{TICKET_PRIORITY_LABELS[p]}</option>)}
          </select>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="rounded-[9999px]"
          onClick={() => { setStatus(""); setPriority("") }}
        >
          ล้าง
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-[8px]" />)}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-3 pr-4 font-medium">Ref No.</th>
                <th className="py-3 pr-4 font-medium">หัวข้อ</th>
                <th className="py-3 pr-4 font-medium">ผู้ใช้</th>
                <th className="py-3 pr-4 font-medium">หมวดหมู่</th>
                <th className="py-3 pr-4 font-medium">สถานะ</th>
                <th className="py-3 pr-4 font-medium">Priority</th>
                <th className="py-3 pr-4 font-medium">มอบหมาย</th>
                <th className="py-3 font-medium">อัปเดต</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-surface/50">
                  <td className="py-3 pr-4">
                    <Link href={`/admin/tickets/${t.id}`} className="font-mono text-xs text-primary hover:underline">
                      {t.ref_no}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 max-w-[180px]">
                    <Link href={`/admin/tickets/${t.id}`} className="font-medium text-text-primary hover:text-primary truncate block">
                      {t.title}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-xs text-text-secondary">{t.user?.email ?? `#${t.user_id}`}</td>
                  <td className="py-3 pr-4 text-xs text-text-secondary">{t.category?.name ?? "—"}</td>
                  <td className="py-3 pr-4"><TicketStatusBadge status={t.status} /></td>
                  <td className="py-3 pr-4"><TicketPriorityBadge priority={t.priority} /></td>
                  <td className="py-3 pr-4 text-xs text-text-secondary">{t.assigned_user?.email ?? "—"}</td>
                  <td className="py-3 text-xs text-text-secondary whitespace-nowrap">{formatDate(t.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {tickets.length === 0 && (
            <p className="text-center py-10 text-text-secondary text-sm">ไม่พบ Ticket</p>
          )}
        </div>
      )}
    </div>
  )
}
