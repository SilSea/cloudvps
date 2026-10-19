"use client"

import { useState } from "react"
import { CheckCircle, XCircle, Image as ImageIcon, Eye, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ViewToggle, type ViewMode } from "@/components/packages/view-toggle"
import { usePagination } from "@/hooks/usePagination"
import { Pagination } from "@/components/shared/pagination"
import { useAdminTransactions, useApproveTransaction, useRejectTransaction } from "@/hooks/useAdmin"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { formatCurrency, formatDate, toSlipSrc } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Transaction, TransactionStatus } from "@/types/transaction"

function SlipImage({ url }: { url: string }) {
  const [errored, setErrored] = useState(false)
  const src = toSlipSrc(url)

  if (errored) return (
    <div className="flex items-center justify-center h-32 text-sm text-text-secondary">
      โหลดภาพไม่ได้
    </div>
  )
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="สลิปการชำระเงิน"
      className="w-full object-contain max-h-72"
      onError={() => setErrored(true)}
    />
  )
}

const STATUS_CONFIG: Record<TransactionStatus, { label: string; className: string }> = {
  PENDING: { label: "รอ", className: "bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20" },
  SUCCESSFUL: { label: "สำเร็จ", className: "bg-accent-green/10 text-accent-green border-accent-green/20" },
  REJECT: { label: "ปฏิเสธ", className: "bg-secondary/10 text-secondary border-secondary/20" },
}

export default function AdminTransactionsPage() {
  const { data: txsData, isLoading } = useAdminTransactions()
  const txs = txsData?.transactions ?? []
  const approve = useApproveTransaction()
  const reject = useRejectTransaction()
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [viewing, setViewing] = useState<Transaction | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: "approve" | "reject"; id: number } | null>(null)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<"ALL" | TransactionStatus>("ALL")
  const [filterMethod, setFilterMethod] = useState<"ALL" | "TRUEMONEY" | "SLIP" | "PROMPTPAY">("ALL")

  const filtered = txs.filter((tx) => {
    const matchSearch = !search || String(tx.id).includes(search)
    const matchStatus = filterStatus === "ALL" || tx.status === filterStatus
    const matchMethod = filterMethod === "ALL" || tx.payment_method === filterMethod
    return matchSearch && matchStatus && matchMethod
  })
  const { page, setPage, totalPages, paginated, total } = usePagination(filtered, 10, `${search}:${filterStatus}:${filterMethod}`)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-text-primary">ธุรกรรม</h1>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="ค้นหา ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary w-40"
        />
        <div className="flex gap-1">
          {(["ALL", "PENDING", "SUCCESSFUL", "REJECT"] as const).map((s) => (
            <Button key={s} size="sm" variant={filterStatus === s ? "default" : "outline"}
              className="rounded-[9999px] h-7 px-3 text-xs"
              onClick={() => setFilterStatus(s)}>
              {s === "ALL" ? "ทั้งหมด" : STATUS_CONFIG[s as TransactionStatus]?.label ?? s}
            </Button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["ALL", "TRUEMONEY", "SLIP", "PROMPTPAY"] as const).map((m) => (
            <Button key={m} size="sm" variant={filterMethod === m ? "default" : "outline"}
              className="rounded-[9999px] h-7 px-3 text-xs"
              onClick={() => setFilterMethod(m)}>
              {m === "ALL" ? "ทุกวิธี" : m}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 rounded-[8px]" />)}</div>
      ) : viewMode === "list" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-3 pr-4 font-medium">ID</th>
                <th className="py-3 pr-4 font-medium">วิธีชำระ</th>
                <th className="py-3 pr-4 font-medium">ยอด</th>
                <th className="py-3 pr-4 font-medium">สถานะ</th>
                <th className="py-3 pr-4 font-medium">สลิป</th>
                <th className="py-3 pr-4 font-medium">วันที่</th>
                <th className="py-3 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((tx) => {
                const cfg = STATUS_CONFIG[tx.status]
                const canAct = tx.status === "PENDING" && tx.payment_method === "PROMPTPAY"
                return (
                  <tr key={tx.id} className="hover:bg-surface/50">
                    <td className="py-3 pr-4 font-mono text-xs">#{tx.id}</td>
                    <td className="py-3 pr-4">
                      <Badge variant="outline" className="text-xs rounded-[9999px]">{tx.payment_method}</Badge>
                    </td>
                    <td className="py-3 pr-4 font-medium">{formatCurrency(tx.amount)}</td>
                    <td className="py-3 pr-4">
                      <Badge variant="outline" className={cn("text-xs rounded-[9999px]", cfg.className)}>{cfg.label}</Badge>
                    </td>
                    <td className="py-3 pr-4">
                      {tx.slip_url ? (
                        <a href={toSlipSrc(tx.slip_url)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                          <ImageIcon className="h-3.5 w-3.5" /> ดูสลิป
                        </a>
                      ) : "—"}
                    </td>
                    <td className="py-3 pr-4 text-text-secondary text-xs">{formatDate(tx.created_at)}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewing(tx)} title="ดูรายละเอียด">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {canAct && (
                          <>
                            <Button size="sm" className="h-7 rounded-[9999px] gap-1 text-xs bg-accent-green hover:bg-accent-green/90"
                              onClick={() => setConfirmAction({ type: "approve", id: tx.id })} disabled={approve.isPending}>
                              <CheckCircle className="h-3.5 w-3.5" /> อนุมัติ
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 rounded-[9999px] gap-1 text-xs text-secondary border-secondary/30 hover:bg-secondary/10"
                              onClick={() => setConfirmAction({ type: "reject", id: tx.id })} disabled={reject.isPending}>
                              <XCircle className="h-3.5 w-3.5" /> ปฏิเสธ
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {total === 0 && <p className="text-center py-10 text-text-secondary text-sm">ไม่มีธุรกรรม</p>}
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((tx) => {
            const cfg = STATUS_CONFIG[tx.status]
            const canAct = tx.status === "PENDING" && tx.payment_method === "PROMPTPAY"
            return (
              <div key={tx.id} className="bg-surface border border-border rounded-[8px] p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs text-text-secondary">#{tx.id}</p>
                    <Badge variant="outline" className="text-xs rounded-[9999px] mt-1">{tx.payment_method}</Badge>
                  </div>
                  <Badge variant="outline" className={cn("text-xs rounded-[9999px] shrink-0", cfg.className)}>{cfg.label}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-text-primary">{formatCurrency(tx.amount)}</span>
                  <span className="text-xs text-text-secondary">{formatDate(tx.created_at)}</span>
                </div>
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button size="sm" variant="outline" className="flex-1 h-7 rounded-[9999px] gap-1 text-xs"
                    onClick={() => setViewing(tx)}>
                    <Eye className="h-3.5 w-3.5" /> รายละเอียด
                  </Button>
                  {canAct && (
                    <>
                      <Button size="sm" className="flex-1 h-7 rounded-[9999px] gap-1 text-xs bg-accent-green hover:bg-accent-green/90"
                        onClick={() => setConfirmAction({ type: "approve", id: tx.id })} disabled={approve.isPending}>
                        <CheckCircle className="h-3.5 w-3.5" /> อนุมัติ
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-7 rounded-[9999px] gap-1 text-xs text-secondary border-secondary/30 hover:bg-secondary/10"
                        onClick={() => setConfirmAction({ type: "reject", id: tx.id })} disabled={reject.isPending}>
                        <XCircle className="h-3.5 w-3.5" /> ปฏิเสธ
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          {total === 0 && <p className="col-span-full text-center py-10 text-text-secondary text-sm">ไม่มีธุรกรรม</p>}
          <div className="col-span-full"><Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} /></div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.type === "approve" ? "ยืนยันการอนุมัติ" : "ยืนยันการปฏิเสธ"}
        description={confirmAction?.type === "approve"
          ? `อนุมัติธุรกรรม #${confirmAction?.id} — คำสั่งซื้อจะถูกทำเครื่องหมายว่าชำระแล้ว`
          : `ปฏิเสธธุรกรรม #${confirmAction?.id} — ผู้ใช้จะต้องชำระเงินใหม่`}
        confirmLabel={confirmAction?.type === "approve" ? "อนุมัติ" : "ปฏิเสธ"}
        variant={confirmAction?.type === "reject" ? "destructive" : "default"}
        isPending={approve.isPending || reject.isPending}
        onConfirm={() => {
          if (!confirmAction) return
          if (confirmAction.type === "approve") approve.mutate(confirmAction.id)
          else reject.mutate(confirmAction.id)
          setConfirmAction(null)
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Transaction Detail Modal */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ธุรกรรม #{viewing?.id}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-4 pr-1">
                {/* Details table */}
                <div className="bg-background rounded-[8px] border border-border divide-y divide-border text-sm">
                  {[
                    { label: "วิธีชำระ", value: <Badge variant="outline" className="text-xs rounded-[9999px]">{viewing.payment_method}</Badge> },
                    { label: "ยอดเงิน", value: <span className="font-bold text-text-primary">{formatCurrency(viewing.amount)}</span> },
                    { label: "สถานะ", value: <Badge variant="outline" className={cn("text-xs rounded-[9999px]", STATUS_CONFIG[viewing.status].className)}>{STATUS_CONFIG[viewing.status].label}</Badge> },
                    { label: "วันที่", value: <span className="text-text-secondary">{formatDate(viewing.created_at)}</span> },
                    ...(viewing.order_id ? [{ label: "Order ID", value: <span className="font-mono text-text-secondary">#{viewing.order_id}</span> }] : []),
                    ...(viewing.provider_ref_id ? [{ label: "Ref ID", value: <span className="font-mono text-xs text-text-secondary">{viewing.provider_ref_id}</span> }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between px-3 py-2.5 gap-4">
                      <span className="text-text-secondary">{label}</span>
                      <div>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Slip image */}
                {viewing.slip_url && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-text-primary">สลิป</p>
                    <div className="border border-border rounded-[8px] overflow-hidden bg-background">
                      <SlipImage url={viewing.slip_url} />
                    </div>
                    <a href={toSlipSrc(viewing.slip_url)} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> เปิดในแท็บใหม่
                    </a>
                  </div>
                )}

                {/* Manual action buttons — available for ALL PENDING */}
                {viewing.status === "PENDING" && (
                  <div className="pt-2 border-t border-border space-y-2">
                    <p className="text-xs text-text-secondary">จัดการแบบ Manual</p>
                    <div className="flex gap-2">
                      <Button className="flex-1 rounded-[9999px] gap-1 bg-accent-green hover:bg-accent-green/90"
                        onClick={() => { setConfirmAction({ type: "approve", id: viewing.id }); setViewing(null) }}
                        disabled={approve.isPending || reject.isPending}>
                        <CheckCircle className="h-4 w-4" /> อนุมัติ
                      </Button>
                      <Button variant="outline" className="flex-1 rounded-[9999px] gap-1 text-secondary border-secondary/30 hover:bg-secondary/10"
                        onClick={() => { setConfirmAction({ type: "reject", id: viewing.id }); setViewing(null) }}
                        disabled={approve.isPending || reject.isPending}>
                        <XCircle className="h-4 w-4" /> ปฏิเสธ
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
