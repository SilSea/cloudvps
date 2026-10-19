"use client"

import { useState } from "react"
import { Play, Square, RotateCcw, Trash2, Eye } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { VpsStatusBadge } from "@/components/vps/vps-status-badge"
import { ViewToggle, type ViewMode } from "@/components/packages/view-toggle"
import { usePagination } from "@/hooks/usePagination"
import { Pagination } from "@/components/shared/pagination"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { useSupportAllVps, useSupportVpsActions } from "@/hooks/useSupport"
import { formatDate } from "@/lib/utils"

export default function SupportVpsPage() {
  const { data, isLoading } = useSupportAllVps()
  const { startVps, stopVps, rebootVps, forceDelete } = useSupportVpsActions()
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("list")

  const vpsList = data?.vps ?? []
  const [filterStatus, setFilterStatus] = useState<"ALL" | "running" | "stopped">("ALL")
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const filtered = vpsList.filter((v) => {
    const matchSearch = v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.ip_assignment.ip_pool.ip.includes(search)
    const matchStatus = filterStatus === "ALL" ||
      (filterStatus === "running" ? v.status === true : v.status === false)
    return matchSearch && matchStatus
  })
  const { page, setPage, totalPages, paginated, total } = usePagination(filtered, 10, `${search}:${filterStatus}`)

  const isActing = startVps.isPending || stopVps.isPending || rebootVps.isPending || forceDelete.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-text-primary">จัดการ VPS</h1>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="ค้นหาชื่อหรือ IP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary w-48"
        />
        {(["ALL", "running", "stopped"] as const).map((s) => (
          <Button key={s} size="sm" variant={filterStatus === s ? "default" : "outline"}
            className="rounded-[9999px] h-7 px-3 text-xs"
            onClick={() => setFilterStatus(s)}>
            {s === "ALL" ? "ทั้งหมด" : s === "running" ? "Running" : "Stopped"}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 rounded-[8px]" />)}</div>
      ) : viewMode === "list" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-3 pr-4 font-medium">VPS</th>
                <th className="py-3 pr-4 font-medium">IP</th>
                <th className="py-3 pr-4 font-medium">สเปค</th>
                <th className="py-3 pr-4 font-medium">สถานะ</th>
                <th className="py-3 pr-4 font-medium">หมดอายุ</th>
                <th className="py-3 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((v) => {
                const ip = v.ip_assignment.ip_pool.ip
                const osName = v.order.package?.os ? `${v.order.package.os.os_name} ${v.order.package.os.os_version}` : "—"
                return (
                  <tr key={v.id} className="hover:bg-surface/50">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text-primary">{v.name}</p>
                      <p className="text-xs text-text-secondary">{osName}</p>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-text-secondary">{ip}</td>
                    <td className="py-3 pr-4 text-xs text-text-secondary">
                      {v.current_cores}vCPU · {v.current_memory_gib}GB · {v.current_disk_gb}GB
                    </td>
                    <td className="py-3 pr-4"><VpsStatusBadge status={v.status} /></td>
                    <td className="py-3 pr-4 text-xs text-text-secondary">{formatDate(v.expired_at)}</td>
                    <td className="py-3">
                      <div className="flex gap-1">
                        <Link href={`/support/vps/${v.id}`}>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="รายละเอียด / อัปเกรด">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-accent-green hover:bg-accent-green/10"
                          disabled={v.status === true || isActing} onClick={() => startVps.mutate(v.id)} title="Start">
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-text-secondary hover:bg-border"
                          disabled={v.status === false || isActing} onClick={() => stopVps.mutate(v.id)} title="Stop">
                          <Square className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-accent-yellow hover:bg-accent-yellow/10"
                          disabled={v.status === false || isActing} onClick={() => rebootVps.mutate(v.id)} title="Reboot">
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-secondary hover:bg-secondary/10"
                          disabled={isActing} onClick={() => setDeletingId(v.id)} title="Force Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {total === 0 && <p className="text-center py-10 text-text-secondary text-sm">ไม่พบ VPS</p>}
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((v) => {
            const ip = v.ip_assignment.ip_pool.ip
            const osName = v.order.package?.os ? `${v.order.package.os.os_name} ${v.order.package.os.os_version}` : "—"
            return (
              <div key={v.id} className="bg-surface border border-border rounded-[8px] p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-text-primary truncate">{v.name}</p>
                    <p className="text-xs text-text-secondary">{osName}</p>
                  </div>
                  <VpsStatusBadge status={v.status} />
                </div>
                <div className="space-y-0.5 text-xs text-text-secondary">
                  <p className="font-mono">{ip}</p>
                  <p>{v.current_cores}vCPU · {v.current_memory_gib}GB RAM · {v.current_disk_gb}GB SSD</p>
                  <p>หมดอายุ: {formatDate(v.expired_at)}</p>
                </div>
                <div className="flex gap-1 pt-2 border-t border-border">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-accent-green hover:bg-accent-green/10"
                    disabled={v.status === true || isActing} onClick={() => startVps.mutate(v.id)} title="Start">
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-text-secondary hover:bg-border"
                    disabled={v.status === false || isActing} onClick={() => stopVps.mutate(v.id)} title="Stop">
                    <Square className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-accent-yellow hover:bg-accent-yellow/10"
                    disabled={v.status === false || isActing} onClick={() => rebootVps.mutate(v.id)} title="Reboot">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-secondary hover:bg-secondary/10"
                    disabled={isActing} onClick={() => setDeletingId(v.id)} title="Force Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
          {total === 0 && <p className="col-span-full text-center py-10 text-text-secondary text-sm">ไม่พบ VPS</p>}
          <div className="col-span-full"><Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} /></div>
        </div>
      )}

      <ConfirmDialog
        open={deletingId !== null}
        title="Force Delete VPS"
        description="VPS นี้จะถูกลบออกจากระบบถาวร รวมถึงข้อมูลทั้งหมด"
        confirmLabel="Force Delete"
        isPending={forceDelete.isPending}
        onConfirm={() => { forceDelete.mutate(deletingId!); setDeletingId(null) }}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  )
}
