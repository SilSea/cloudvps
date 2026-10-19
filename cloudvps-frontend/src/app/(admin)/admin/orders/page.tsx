"use client"

import { useState } from "react"
import { Eye } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ViewToggle, type ViewMode } from "@/components/packages/view-toggle"
import { usePagination } from "@/hooks/usePagination"
import { Pagination } from "@/components/shared/pagination"
import { useAdminOrders } from "@/hooks/useAdmin"
import { formatCurrency, formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Order, OrderStatus } from "@/types/order"

const STATUS_CONFIG: Record<OrderStatus, { label: string; className: string }> = {
  PENDING: { label: "รอชำระ", className: "bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20" },
  PAID: { label: "ชำระแล้ว", className: "bg-accent-green/10 text-accent-green border-accent-green/20" },
  CANCEL: { label: "ยกเลิก", className: "bg-border text-text-secondary border-border" },
  EXPIRE: { label: "หมดอายุ", className: "bg-secondary/10 text-secondary border-secondary/20" },
}

export default function AdminOrdersPage() {
  const { data: ordersData, isLoading } = useAdminOrders()
  const orders = ordersData?.orders ?? []
  const [search, setSearch] = useState("")
  const [viewing, setViewing] = useState<Order | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [filterStatus, setFilterStatus] = useState<"ALL" | OrderStatus>("ALL")

  const filtered = orders.filter((o) => {
    const matchSearch = o.ref_no.toLowerCase().includes(search.toLowerCase()) ||
      String(o.id).includes(search) ||
      String(o.users_id).includes(search)
    const matchStatus = filterStatus === "ALL" || o.status === filterStatus
    return matchSearch && matchStatus
  })
  const { page, setPage, totalPages, paginated, total } = usePagination(filtered, 10, `${search}:${filterStatus}`)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-text-primary">คำสั่งซื้อ</h1>
          <p className="text-sm text-text-secondary mt-0.5">ทั้งหมด {ordersData?.total ?? 0} รายการ</p>
        </div>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="ค้นหา ref no, ID, หรือ user ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary w-56"
        />
        {(["ALL", "PENDING", "PAID", "CANCEL", "EXPIRE"] as const).map((s) => (
          <Button key={s} size="sm" variant={filterStatus === s ? "default" : "outline"}
            className="rounded-[9999px] h-7 px-3 text-xs"
            onClick={() => setFilterStatus(s as "ALL" | OrderStatus)}>
            {s === "ALL" ? "ทั้งหมด" : STATUS_CONFIG[s as OrderStatus]?.label ?? s}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-14 rounded-[8px]" />)}</div>
      ) : viewMode === "list" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-3 pr-4 font-medium">ID</th>
                <th className="py-3 pr-4 font-medium">User ID</th>
                <th className="py-3 pr-4 font-medium">Ref No</th>
                <th className="py-3 pr-4 font-medium">แพ็กเกจ</th>
                <th className="py-3 pr-4 font-medium">ยอด</th>
                <th className="py-3 pr-4 font-medium">สถานะ</th>
                <th className="py-3 pr-4 font-medium">วันที่</th>
                <th className="py-3 font-medium">ดู</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((o) => {
                const cfg = STATUS_CONFIG[o.status]
                return (
                  <tr key={o.id} className="hover:bg-surface/50">
                    <td className="py-3 pr-4 font-mono text-xs text-text-secondary">#{o.id}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-primary">#{o.users_id}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-text-primary">{o.ref_no}</td>
                    <td className="py-3 pr-4 text-text-secondary">{o.package?.name ?? `#${o.packages_id}`}</td>
                    <td className="py-3 pr-4 font-medium text-text-primary">{formatCurrency(o.amount)}</td>
                    <td className="py-3 pr-4">
                      <Badge variant="outline" className={cn("text-xs rounded-[9999px]", cfg.className)}>{cfg.label}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-xs text-text-secondary">{formatDate(o.created_at)}</td>
                    <td className="py-3">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewing(o)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {total === 0 && <p className="text-center py-10 text-text-secondary text-sm">ไม่พบคำสั่งซื้อ</p>}
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((o) => {
            const cfg = STATUS_CONFIG[o.status]
            return (
              <div key={o.id} className="bg-surface border border-border rounded-[8px] p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-text-secondary">#{o.id}</p>
                    <p className="font-mono text-xs text-text-primary mt-0.5">{o.ref_no}</p>
                  </div>
                  <Badge variant="outline" className={cn("text-xs rounded-[9999px] shrink-0", cfg.className)}>{cfg.label}</Badge>
                </div>
                <div className="space-y-1 text-xs text-text-secondary">
                  <p>User: <span className="text-primary font-mono">#{o.users_id}</span></p>
                  <p>แพ็กเกจ: {o.package?.name ?? `#${o.packages_id}`}</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="font-bold text-text-primary">{formatCurrency(o.amount)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-secondary">{formatDate(o.created_at)}</span>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewing(o)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
          {total === 0 && <p className="col-span-full text-center py-10 text-text-secondary text-sm">ไม่พบคำสั่งซื้อ</p>}
          <div className="col-span-full"><Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} /></div>
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>คำสั่งซื้อ #{viewing?.id}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <InfoRow label="Ref No"><span className="font-mono font-medium">{viewing.ref_no}</span></InfoRow>
              <InfoRow label="User ID"><span className="font-mono text-primary font-medium">#{viewing.users_id}</span></InfoRow>
              <InfoRow label="สถานะ">
                <Badge variant="outline" className={cn("text-xs rounded-[9999px]", STATUS_CONFIG[viewing.status].className)}>
                  {STATUS_CONFIG[viewing.status].label}
                </Badge>
              </InfoRow>
              <InfoRow label="ประเภท"><Badge variant="outline" className="text-xs rounded-[9999px]">{viewing.type ?? "—"}</Badge></InfoRow>
              <InfoRow label="แพ็กเกจ"><span>{viewing.package?.name ?? `#${viewing.packages_id}`}</span></InfoRow>
              {viewing.package?.price != null && (
                <InfoRow label="ราคาแพ็กเกจ"><span>{formatCurrency(viewing.package.price)} / {viewing.package.period} วัน</span></InfoRow>
              )}
              <InfoRow label="ยอดรวม"><span className="font-bold text-text-primary">{formatCurrency(viewing.amount)}</span></InfoRow>
              {viewing.promotion && (
                <InfoRow label="โปรโมชั่น">
                  <span className="font-mono text-accent-green">{viewing.promotion.code_name}</span>
                  <span className="text-xs text-text-secondary ml-1">
                    ({viewing.promotion.type === "PERCENT" ? `${viewing.promotion.discount}%` : `฿${viewing.promotion.discount}`})
                  </span>
                </InfoRow>
              )}
              <InfoRow label="สร้างเมื่อ"><span className="text-text-secondary">{formatDate(viewing.created_at)}</span></InfoRow>
              {viewing.expired_at && <InfoRow label="หมดอายุ"><span className="text-secondary">{formatDate(viewing.expired_at)}</span></InfoRow>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-text-secondary shrink-0 w-32">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  )
}
