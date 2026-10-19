"use client"

import Link from "next/link"
import { ShoppingCart } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Pagination } from "@/components/shared/pagination"
import { useOrders } from "@/hooks/useOrders"
import { usePagination } from "@/hooks/usePagination"
import { formatCurrency, formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { OrderStatus } from "@/types/order"

const STATUS_CONFIG: Record<OrderStatus, { label: string; className: string }> = {
  PENDING: { label: "รอชำระ", className: "bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20" },
  PAID: { label: "ชำระแล้ว", className: "bg-accent-green/10 text-accent-green border-accent-green/20" },
  CANCEL: { label: "ยกเลิก", className: "bg-border text-text-secondary border-border" },
  EXPIRE: { label: "หมดอายุ", className: "bg-secondary/10 text-secondary border-secondary/20" },
}

const PAGE_SIZE = 10

export default function OrdersPage() {
  const { data: ordersData, isLoading } = useOrders()
  const orders = ordersData?.orders ?? []
  const { page, setPage, totalPages, paginated, total } = usePagination(orders, PAGE_SIZE)

  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold text-text-primary">ประวัติการสั่งซื้อ</h1>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-[72px] rounded-[8px]" />)}</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 bg-surface border border-border rounded-[8px]">
          <ShoppingCart className="h-12 w-12 text-border mx-auto mb-4" />
          <p className="text-text-secondary mb-4">ยังไม่มีคำสั่งซื้อ</p>
          <Link href="/packages" className="text-primary hover:underline">เลือกแพ็กเกจ →</Link>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {paginated.map((order) => {
              const cfg = STATUS_CONFIG[order.status]
              return (
                <Link key={order.id} href={`/billing/orders/${order.id}`} className="flex items-center justify-between p-4 bg-surface border border-border rounded-[8px] hover:border-primary transition-colors">
                  <div>
                    <p className="font-medium text-text-primary">คำสั่งซื้อ #{order.id}</p>
                    <p className="text-xs text-text-secondary mt-0.5">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-text-primary">{formatCurrency(order.amount)}</span>
                    <Badge variant="outline" className={cn("rounded-[9999px] text-xs", cfg.className)}>{cfg.label}</Badge>
                  </div>
                </Link>
              )
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
