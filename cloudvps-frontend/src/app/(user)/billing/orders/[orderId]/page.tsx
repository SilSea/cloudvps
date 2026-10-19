"use client"

import { use, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Cpu, MemoryStick, HardDrive, Globe, Network, MonitorSmartphone, Calendar, Clock } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { TrueMoneyInput } from "@/components/payment/truemoney-input"
import { SlipUploader } from "@/components/payment/slip-uploader"
import { PromptPayDisplay } from "@/components/payment/promptpay-display"
import { BankAccountInfo } from "@/components/payment/bank-account-info"
import { useOrder, useSubmitTransaction, useCancelOrder, usePaymentInfo } from "@/hooks/useOrders"
import { useUpgradeHistory } from "@/hooks/useProfile"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { formatCurrency, formatDate, parseGib, parseDiskGb, cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import type { OrderStatus } from "@/types/order"

const STATUS_CONFIG: Record<OrderStatus, { label: string; className: string }> = {
  PENDING: { label: "รอชำระ", className: "bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20" },
  PAID: { label: "ชำระแล้ว", className: "bg-accent-green/10 text-accent-green border-accent-green/20" },
  CANCEL: { label: "ยกเลิก", className: "bg-border text-text-secondary border-border" },
  EXPIRE: { label: "หมดอายุ", className: "bg-secondary/10 text-secondary border-secondary/20" },
}

export default function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params)
  const id = Number(orderId)
  const router = useRouter()
  const { data: order, isLoading } = useOrder(id)
  const { data: paymentInfo, isLoading: paymentInfoLoading } = usePaymentInfo()
  const submitTx = useSubmitTransaction()
  const cancelOrder = useCancelOrder()
  const [confirmCancel, setConfirmCancel] = useState(false)

  // order.type does not exist on the backend `orders` table at all (no such column) — the
  // real signal for "this order is an upgrade" is upgrade_vps_id being set.
  const isUpgradeOrder = order?.upgrade_vps_id != null
  const { data: upgradeHistory } = useUpgradeHistory(order?.upgrade_vps_id ?? 0)
  const upgradeLog = upgradeHistory?.logs.find((l) => l.order_id === id)

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-[300px] rounded-[8px]" /></div>
  if (!order) return <p className="text-text-secondary">ไม่พบคำสั่งซื้อ</p>

  const isPending = order.status === "PENDING"
  const pkg = order.package
  const fullPrice = pkg?.price
  const discountAmount = fullPrice != null ? Math.max(0, fullPrice - order.amount) : 0

  // Latest transaction (newest first, per backend). A PENDING transaction only ever
  // happens for PROMPTPAY (TRUEMONEY/SLIP are auto-verified to SUCCESSFUL synchronously) —
  // it means the slip is already submitted and awaiting ADMIN/SUPPORT manual approval,
  // so re-showing the payment form here would look like nothing was submitted.
  const latestTx = order.transactions?.[0]
  const awaitingReview = isPending && latestTx?.status === "PENDING"
  const wasRejected = isPending && latestTx?.status === "REJECT"

  // Hide a payment method entirely when admin hasn't configured it, rather than showing a
  // broken/empty option (system-configs/payment-info, see docs/frontend.md §15).
  const showPromptPay = paymentInfo?.promptpay_id != null
  const showSlip = paymentInfo?.bank != null

  const handleTrueMoney = async (voucher_code: string) => {
    await submitTx.mutateAsync({ order_id: id, payment_method: "TRUEMONEY", voucher_code })
  }

  const handleSlip = async (slip_file: File) => {
    await submitTx.mutateAsync({ order_id: id, payment_method: "SLIP", slip_file })
  }

  const handlePromptPay = async (slip_file: File) => {
    await submitTx.mutateAsync({ order_id: id, payment_method: "PROMPTPAY", slip_file })
  }

  return (
    <div className="max-w-lg space-y-6">
      <Link href="/billing/orders" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> กลับ
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[22px] font-bold text-text-primary">คำสั่งซื้อ #{order.id}</h1>
          <p className="text-sm text-text-secondary">{formatDate(order.created_at)}</p>
        </div>
        <span className={cn(
          "shrink-0 text-sm font-bold px-4 py-1.5 rounded-[9999px] border",
          STATUS_CONFIG[order.status].className,
        )}>
          {STATUS_CONFIG[order.status].label}
        </span>
      </div>

      {pkg && upgradeLog?.upgrade_type !== "CUSTOM" && (
        <div className="bg-surface border border-border rounded-[8px] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-border gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-text-primary truncate">{pkg.name}</p>
              {pkg.os && <p className="text-xs text-text-secondary mt-0.5">{pkg.os.os_name} {pkg.os.os_version}</p>}
            </div>
            {pkg.port_count !== undefined && (
              <span className={cn(
                "shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-[9999px]",
                pkg.port_count !== null ? "bg-accent-yellow/10 text-accent-yellow" : "bg-accent-green/10 text-accent-green",
              )}>
                {pkg.port_count !== null ? "NAT" : "Public IP"}
              </span>
            )}
          </div>
          {pkg.vm && (
            <div className="grid grid-cols-2 gap-px bg-border">
              <SpecCell icon={<MonitorSmartphone className="h-3.5 w-3.5" />} label="OS" value={pkg.os ? `${pkg.os.os_name} ${pkg.os.os_version}` : "-"} />
              <SpecCell icon={<Cpu className="h-3.5 w-3.5" />} label="CPU" value={`${pkg.vm.core} vCPU`} />
              <SpecCell icon={<MemoryStick className="h-3.5 w-3.5" />} label="RAM" value={`${parseGib(pkg.vm.memory)} GB`} />
              <SpecCell icon={<HardDrive className="h-3.5 w-3.5" />} label="Disk" value={`${parseDiskGb(pkg.vm.size)} GB SSD`} />
              <SpecCell
                icon={pkg.port_count !== null ? <Network className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                label="Network"
                value={pkg.port_count != null ? `NAT · ${pkg.port_count} ports` : "Public IP"}
              />
              {pkg.period != null && <SpecCell icon={<Calendar className="h-3.5 w-3.5" />} label="ระยะเวลา" value={`${pkg.period} วัน`} />}
            </div>
          )}
        </div>
      )}

      {isUpgradeOrder && upgradeLog && (
        <div className="bg-surface border border-border rounded-[8px] p-4 space-y-3">
          <h2 className="font-medium text-text-primary text-sm">รายละเอียดอัปเกรด</h2>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <UpgradeSpecRow icon={<Cpu className="h-3.5 w-3.5" />} label="CPU" before={`${upgradeLog.before_cores} vCPU`} after={`${upgradeLog.after_cores} vCPU`} />
            <UpgradeSpecRow icon={<MemoryStick className="h-3.5 w-3.5" />} label="RAM" before={`${upgradeLog.before_memory_gib} GB`} after={`${upgradeLog.after_memory_gib} GB`} />
            <UpgradeSpecRow icon={<HardDrive className="h-3.5 w-3.5" />} label="Disk" before={`${upgradeLog.before_disk_gb} GB`} after={`${upgradeLog.after_disk_gb} GB`} />
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-border">
            <span className="text-text-secondary">ราคา/เดือน เดิม → ใหม่</span>
            <span>{formatCurrency(upgradeLog.before_monthly_price)} → {formatCurrency(upgradeLog.after_monthly_price)}</span>
          </div>
          <p className="text-[11px] text-text-secondary">
            ยอดชำระคำนวณตามสัดส่วนระยะเวลาคงเหลือของ VPS ไม่ใช่ราคาเต็มรายเดือน
          </p>
        </div>
      )}

      <div className="bg-surface border border-border rounded-[8px] p-4 space-y-2">
        {!isUpgradeOrder && fullPrice != null && (
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">ราคาเต็ม</span>
            <span>{formatCurrency(fullPrice)}</span>
          </div>
        )}
        {!isUpgradeOrder && (order.promotion ? (
          <div className="flex justify-between text-sm text-accent-green">
            <span>โปรโมชั่น ({order.promotion.code_name})</span>
            <span>
              {order.promotion.type === "PERCENT"
                ? `-${order.promotion.discount}% (-${formatCurrency(discountAmount)})`
                : `-${formatCurrency(order.promotion.discount)}`}
            </span>
          </div>
        ) : (
          <div className="flex justify-between text-sm text-text-secondary">
            <span>ส่วนลด</span>
            <span>{formatCurrency(0)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold text-[16px] pt-2 border-t border-border">
          <span>ยอดสุทธิ</span>
          <span className="text-primary">{formatCurrency(order.amount)}</span>
        </div>
      </div>

      {awaitingReview && latestTx && (
        <div className="bg-accent-yellow/5 border border-accent-yellow/30 rounded-[8px] p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-accent-yellow shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-text-primary text-sm">ส่งสลิปแล้ว รอ Admin ตรวจสอบ</p>
            <p className="text-xs text-text-secondary mt-0.5">
              ส่งเมื่อ {formatDate(latestTx.created_at)} · ยอด {formatCurrency(latestTx.amount)} — ระบบจะอัปเดตสถานะอัตโนมัติเมื่อ Admin อนุมัติ
            </p>
          </div>
        </div>
      )}

      {isPending && !awaitingReview && (
        <div className="bg-surface border border-border rounded-[8px] p-5">
          <h2 className="font-medium text-text-primary mb-4">เลือกวิธีชำระเงิน</h2>
          {wasRejected && (
            <p className="text-xs text-secondary mb-3">การชำระเงินก่อนหน้าไม่ผ่านการตรวจสอบ กรุณาส่งใหม่อีกครั้ง</p>
          )}
          {paymentInfoLoading ? (
            <Skeleton className="h-[220px] rounded-[8px]" />
          ) : (
            <Tabs defaultValue="TRUEMONEY">
              <TabsList className="w-full mb-4">
                <TabsTrigger value="TRUEMONEY" className="flex-1">TrueMoney</TabsTrigger>
                {showSlip && <TabsTrigger value="SLIP" className="flex-1">SlipOk (Autocheck)</TabsTrigger>}
                {showPromptPay && <TabsTrigger value="PROMPTPAY" className="flex-1">PromptPay</TabsTrigger>}
              </TabsList>
              <TabsContent value="TRUEMONEY"><TrueMoneyInput onSubmit={handleTrueMoney} isLoading={submitTx.isPending} /></TabsContent>
              {showSlip && (
                <TabsContent value="SLIP" className="space-y-3">
                  <BankAccountInfo bank={paymentInfo!.bank!} />
                  <SlipUploader onSubmit={handleSlip} isLoading={submitTx.isPending} />
                </TabsContent>
              )}
              {showPromptPay && (
                <TabsContent value="PROMPTPAY">
                  <PromptPayDisplay amount={order.amount} promptpayId={paymentInfo!.promptpay_id} onSubmit={handlePromptPay} isLoading={submitTx.isPending} />
                </TabsContent>
              )}
            </Tabs>
          )}
        </div>
      )}

      {isPending && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="rounded-[9999px] text-secondary border-secondary/30 hover:bg-secondary/10"
            onClick={() => setConfirmCancel(true)} disabled={cancelOrder.isPending}>
            ยกเลิกคำสั่งซื้อ
          </Button>
        </div>
      )}


      <ConfirmDialog
        open={confirmCancel}
        title="ยกเลิกคำสั่งซื้อ"
        description={`ยกเลิกคำสั่งซื้อ #${order.id} — ไม่สามารถกู้คืนได้`}
        confirmLabel="ยกเลิกคำสั่งซื้อ"
        isPending={cancelOrder.isPending}
        onConfirm={async () => {
          await cancelOrder.mutateAsync(id)
          setConfirmCancel(false)
          router.push("/billing/orders")
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  )
}

function SpecCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-surface px-4 py-2.5">
      <span className="text-text-secondary shrink-0">{icon}</span>
      <div>
        <p className="text-[10px] text-text-secondary">{label}</p>
        <p className="text-xs font-medium text-text-primary">{value}</p>
      </div>
    </div>
  )
}

function UpgradeSpecRow({ icon, label, before, after }: { icon: React.ReactNode; label: string; before: string; after: string }) {
  const changed = before !== after
  return (
    <div className="flex flex-col items-center gap-1 p-2 bg-background rounded-[6px] text-center">
      <span className="text-text-secondary">{icon}</span>
      <span className="text-text-secondary">{label}</span>
      <span className={cn("font-medium", changed ? "text-primary" : "text-text-primary")}>
        {changed ? `${before} → ${after}` : after}
      </span>
    </div>
  )
}
