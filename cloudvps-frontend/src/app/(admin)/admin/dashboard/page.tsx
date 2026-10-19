"use client"

import Link from "next/link"
import {
  Users, Package, CreditCard, Server, Tag, CheckCircle, XCircle,
  ArrowRight, Clock, Shield, Settings, Mail, ShoppingCart, Network, Monitor,
  Database, RefreshCw, Cpu,
} from "lucide-react"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useAdminUsers, useAdminPackages, useAdminTransactions,
  useApproveTransaction, useRejectTransaction, useAdminPromotions,
  useAdminOrders, useSystemCapacity,
} from "@/hooks/useAdmin"
import { useSupportAllVps } from "@/hooks/useSupport"
import { formatCurrency, formatDate, toSlipSrc } from "@/lib/utils"
import { cn } from "@/lib/utils"

type ServiceHealth = { status: "ok" | "error"; latencyMs: number }
type HealthResponse = {
  status: "ok" | "degraded"
  ts: string
  services: { db: ServiceHealth; redis: ServiceHealth; proxmox: ServiceHealth }
}

function useSystemHealth() {
  return useQuery<HealthResponse>({
    queryKey: ["system-health"],
    queryFn: async () => {
      const base = process.env.NEXT_PUBLIC_API_URL ?? ""
      const res = await fetch(`${base}/health`, { cache: "no-store" })
      return res.json()
    },
    refetchInterval: 30_000,
    retry: false,
  })
}

const CHART_COLORS = {
  primary: "hsl(var(--primary))",
  green: "#22c55e",
  yellow: "#f59e0b",
  red: "#ef4444",
  muted: "#6b7280",
  blue: "#3b82f6",
}

export default function AdminDashboardPage() {
  const { data: usersData } = useAdminUsers()
  const { data: packages = [] } = useAdminPackages()
  const { data: txsData, isLoading: txLoading } = useAdminTransactions()
  const { data: vpsData } = useSupportAllVps()
  const { data: promos = [] } = useAdminPromotions()
  const { data: ordersData } = useAdminOrders()
  const approve = useApproveTransaction()
  const reject = useRejectTransaction()
  const { data: health, isLoading: healthLoading, refetch: refetchHealth, isFetching: healthFetching } = useSystemHealth()
  const { data: capacity, isLoading: capacityLoading } = useSystemCapacity()

  const totalUsers = usersData?.total ?? 0
  const totalVps = vpsData?.total ?? 0
  const activePackages = packages.filter((p) => p.status).length
  const activePromos = promos.filter((p) => p.status).length
  const allTxs = txsData?.transactions ?? []
  const promptpayPending = allTxs.filter((t) => t.status === "PENDING" && t.payment_method === "PROMPTPAY")
  const runningVps = vpsData?.vps.filter((v) => v.status === true).length ?? 0
  const allOrders = ordersData?.orders ?? []

  // Chart data
  const txChartData = [
    { name: "รอดำเนินการ", value: allTxs.filter((t) => t.status === "PENDING").length, color: CHART_COLORS.yellow },
    { name: "สำเร็จ", value: allTxs.filter((t) => t.status === "SUCCESSFUL").length, color: CHART_COLORS.green },
    { name: "ปฏิเสธ", value: allTxs.filter((t) => t.status === "REJECT").length, color: CHART_COLORS.red },
  ]

  const orderChartData = [
    { name: "รอชำระ", value: allOrders.filter((o) => o.status === "PENDING").length, color: CHART_COLORS.yellow },
    { name: "ชำระแล้ว", value: allOrders.filter((o) => o.status === "PAID").length, color: CHART_COLORS.green },
    { name: "ยกเลิก", value: allOrders.filter((o) => o.status === "CANCEL").length, color: CHART_COLORS.muted },
    { name: "หมดอายุ", value: allOrders.filter((o) => o.status === "EXPIRE").length, color: CHART_COLORS.red },
  ]

  const vpsChartData = [
    { name: "Running", value: runningVps, color: CHART_COLORS.green },
    { name: "Stopped", value: totalVps - runningVps, color: CHART_COLORS.muted },
  ]

  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const dateStr = d.toISOString().slice(0, 10)
    const dayLabel = `${d.getMonth() + 1}/${d.getDate()}`
    const dayTxs = allTxs.filter((t) => t.created_at.startsWith(dateStr))
    const dayOrders = allOrders.filter((o) => o.created_at.startsWith(dateStr))
    return {
      date: dayLabel,
      ธุรกรรม: dayTxs.length,
      คำสั่งซื้อ: dayOrders.length,
      รายรับ: dayTxs.filter((t) => t.status === "SUCCESSFUL").reduce((s, t) => s + t.amount, 0),
    }
  })

  const revenueByMethod = [
    {
      name: "TrueMoney",
      value: allTxs.filter((t) => t.status === "SUCCESSFUL" && t.payment_method === "TRUEMONEY")
        .reduce((s, t) => s + t.amount, 0),
    },
    {
      name: "Slip",
      value: allTxs.filter((t) => t.status === "SUCCESSFUL" && t.payment_method === "SLIP")
        .reduce((s, t) => s + t.amount, 0),
    },
    {
      name: "PromptPay",
      value: allTxs.filter((t) => t.status === "SUCCESSFUL" && t.payment_method === "PROMPTPAY")
        .reduce((s, t) => s + t.amount, 0),
    },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold text-text-primary">Admin Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-5 w-5 text-primary" />} label="ผู้ใช้ทั้งหมด" value={totalUsers} href="/admin/users" />
        <StatCard icon={<Server className="h-5 w-5 text-accent-green" />} label="VPS กำลังทำงาน" value={runningVps} sub={`จาก ${totalVps} เครื่อง`} href="/admin/vps" />
        <StatCard icon={<Clock className="h-5 w-5 text-accent-yellow" />} label="ธุรกรรม PromptPay รอ" value={promptpayPending.length} urgent={promptpayPending.length > 0} href="/admin/transactions" />
        <StatCard icon={<Package className="h-5 w-5 text-text-secondary" />} label="แพ็กเกจที่เปิดใช้" value={activePackages} sub={`โปรโมชั่น ${activePromos} รายการ`} href="/admin/packages" />
      </div>

      {/* System Health */}
      <div className="bg-surface border border-border rounded-[8px] p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-text-primary">สถานะระบบ</h2>
            {health && (
              <Badge
                className={cn(
                  "text-xs rounded-[9999px]",
                  health.status === "ok"
                    ? "bg-accent-green/10 text-accent-green border-accent-green/30"
                    : "bg-secondary/10 text-secondary border-secondary/30"
                )}
              >
                {health.status === "ok" ? "ปกติ" : "มีปัญหา"}
              </Badge>
            )}
          </div>
          <button
            onClick={() => refetchHealth()}
            disabled={healthFetching}
            className="text-text-secondary hover:text-text-primary transition-colors"
            title="รีเฟรช"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", healthFetching && "animate-spin")} />
          </button>
        </div>
        {healthLoading ? (
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-[6px]" />)}
          </div>
        ) : health ? (
          <div className="grid grid-cols-3 gap-3">
            <ServiceStatusCard
              icon={<Database className="h-4 w-4" />}
              label="Database"
              data={health.services.db}
            />
            <ServiceStatusCard
              icon={<RefreshCw className="h-4 w-4" />}
              label="Redis"
              data={health.services.redis}
            />
            <ServiceStatusCard
              icon={<Cpu className="h-4 w-4" />}
              label="Proxmox"
              data={health.services.proxmox}
            />
          </div>
        ) : (
          <p className="text-xs text-text-secondary text-center py-4">เชื่อมต่อ backend ไม่ได้</p>
        )}
        {health && (
          <p className="text-[10px] text-text-secondary mt-3 text-right">
            อัปเดต {new Date(health.ts).toLocaleTimeString("th-TH")}
          </p>
        )}
      </div>

      {/* Capacity */}
      <div className="bg-surface border border-border rounded-[8px] p-4">
        <h2 className="text-sm font-medium text-text-primary mb-4">Capacity (Proxmox Node)</h2>
        {capacityLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-[6px]" />)}
          </div>
        ) : capacity ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CapacityBar
              label="RAM"
              used={capacity.allocated_ram_mb}
              total={capacity.maxmem_mb}
              unit="MB"
              freeLabel={`เหลือ ${capacity.effective_free_ram_mb.toLocaleString()} MB`}
            />
            <CapacityBar
              label="Disk"
              used={capacity.total_disk_gb - capacity.avail_disk_gb}
              total={capacity.total_disk_gb}
              unit="GB"
              freeLabel={`เหลือ ${capacity.effective_free_disk_gb.toLocaleString()} GB`}
            />
          </div>
        ) : (
          <p className="text-xs text-text-secondary text-center py-4">เชื่อมต่อ backend ไม่ได้</p>
        )}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Transactions by status */}
        <div className="bg-surface border border-border rounded-[8px] p-4">
          <h2 className="text-sm font-medium text-text-primary mb-4">สถานะธุรกรรม</h2>
          {txLoading ? (
            <Skeleton className="h-40 rounded-[6px]" />
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={txChartData} barSize={32}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                <YAxis hide allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                  cursor={{ fill: "transparent" }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {txChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Orders by status */}
        <div className="bg-surface border border-border rounded-[8px] p-4">
          <h2 className="text-sm font-medium text-text-primary mb-4">สถานะคำสั่งซื้อ</h2>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={orderChartData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={65}
                dataKey="value"
                paddingAngle={2}
              >
                {orderChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(v) => <span style={{ fontSize: 11, color: "#6b7280" }}>{v}</span>}
              />
              <Tooltip
                contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* VPS status + revenue */}
        <div className="bg-surface border border-border rounded-[8px] p-4 space-y-4">
          <div>
            <h2 className="text-sm font-medium text-text-primary mb-3">สถานะ VPS</h2>
            <div className="flex gap-3 items-center">
              <div className="flex-1 space-y-1.5">
                {vpsChartData.map((d) => (
                  <div key={d.name} className="space-y-0.5">
                    <div className="flex justify-between text-xs text-text-secondary">
                      <span>{d.name}</span>
                      <span>{d.value}</span>
                    </div>
                    <div className="h-2 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: totalVps > 0 ? `${(d.value / totalVps) * 100}%` : "0%",
                          backgroundColor: d.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-sm font-medium text-text-primary mb-2">รายรับตามช่องทาง</h2>
            <div className="space-y-1">
              {revenueByMethod.map((m) => (
                <div key={m.name} className="flex justify-between text-xs">
                  <span className="text-text-secondary">{m.name}</span>
                  <span className="font-medium text-text-primary">{formatCurrency(m.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 7-day trend line chart */}
      <div className="bg-surface border border-border rounded-[8px] p-4">
        <h2 className="text-sm font-medium text-text-primary mb-4">แนวโน้ม 7 วัน</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={dailyData} margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="count" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
            <YAxis yAxisId="revenue" orientation="right" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} width={48}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
              formatter={(value, name) => [
                name === "รายรับ" ? `฿${Number(value).toLocaleString()}` : value,
                name,
              ]}
            />
            <Line yAxisId="count" type="monotone" dataKey="ธุรกรรม" stroke={CHART_COLORS.green} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Line yAxisId="count" type="monotone" dataKey="คำสั่งซื้อ" stroke={CHART_COLORS.blue} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Line yAxisId="revenue" type="monotone" dataKey="รายรับ" stroke={CHART_COLORS.yellow} strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 justify-center">
          {[
            { label: "ธุรกรรม", color: CHART_COLORS.green },
            { label: "คำสั่งซื้อ", color: CHART_COLORS.blue },
            { label: "รายรับ (฿, แกนขวา)", color: CHART_COLORS.yellow },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div className="h-2 w-5 rounded-full" style={{ backgroundColor: l.color }} />
              <span className="text-xs text-text-secondary">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pending PromptPay */}
      <div className="bg-surface border border-border rounded-[8px]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-accent-yellow" />
            <h2 className="font-medium text-text-primary">ธุรกรรม PromptPay รออนุมัติ</h2>
            {promptpayPending.length > 0 && (
              <Badge className="bg-accent-yellow/10 text-accent-yellow border-accent-yellow/30 text-xs rounded-[9999px]">
                {promptpayPending.length}
              </Badge>
            )}
          </div>
          <Link href="/admin/transactions" className="text-xs text-primary hover:underline flex items-center gap-1">
            ดูทั้งหมด <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {txLoading ? (
          <div className="p-4 space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-12 rounded-[6px]" />)}</div>
        ) : promptpayPending.length === 0 ? (
          <p className="text-center py-8 text-text-secondary text-sm">ไม่มีธุรกรรมรออนุมัติ</p>
        ) : (
          <div className="divide-y divide-border">
            {promptpayPending.slice(0, 5).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary font-mono">#{tx.id}</p>
                  <p className="text-xs text-text-secondary">{formatDate(tx.created_at)}</p>
                </div>
                <span className="text-sm font-bold text-text-primary shrink-0">{formatCurrency(tx.amount)}</span>
                {tx.slip_url && (
                  <a href={toSlipSrc(tx.slip_url)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline shrink-0">
                    ดูสลิป
                  </a>
                )}
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    className="h-7 rounded-[9999px] gap-1 text-xs bg-accent-green hover:bg-accent-green/90 text-white"
                    onClick={() => approve.mutate(tx.id)}
                    disabled={approve.isPending || reject.isPending}
                  >
                    <CheckCircle className="h-3 w-3" /> อนุมัติ
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-[9999px] gap-1 text-xs text-secondary border-secondary/30 hover:bg-secondary/10"
                    onClick={() => reject.mutate(tx.id)}
                    disabled={approve.isPending || reject.isPending}
                  >
                    <XCircle className="h-3 w-3" /> ปฏิเสธ
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-[16px] font-semibold text-text-primary mb-3">จัดการระบบ</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {NAV_CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="flex items-center gap-3 p-4 bg-surface border border-border rounded-[8px] hover:border-primary hover:shadow-sm transition-all"
            >
              <c.icon className={cn("h-5 w-5 shrink-0", c.color)} />
              <span className="text-sm font-medium text-text-primary">{c.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

const NAV_CARDS = [
  { href: "/admin/users", icon: Users, label: "ผู้ใช้งาน", color: "text-primary" },
  { href: "/admin/packages", icon: Package, label: "แพ็กเกจ", color: "text-accent-green" },
  { href: "/admin/vps", icon: Server, label: "VPS", color: "text-accent-green" },
  { href: "/admin/orders", icon: ShoppingCart, label: "คำสั่งซื้อ", color: "text-text-secondary" },
  { href: "/admin/transactions", icon: CreditCard, label: "ธุรกรรม", color: "text-accent-yellow" },
  { href: "/admin/promotions", icon: Tag, label: "โปรโมชั่น", color: "text-secondary" },
  { href: "/admin/policies", icon: Shield, label: "นโยบาย", color: "text-primary" },
  { href: "/admin/system-configs", icon: Settings, label: "ตั้งค่าระบบ", color: "text-text-secondary" },
  { href: "/admin/broadcasts", icon: Mail, label: "ส่งอีเมล", color: "text-accent-green" },
  { href: "/admin/os-vm", icon: Monitor, label: "OS & VM Specs", color: "text-primary" },
  { href: "/admin/ip-pools", icon: Network, label: "IP Pool", color: "text-text-secondary" },
]

function ServiceStatusCard({
  icon, label, data,
}: {
  icon: React.ReactNode
  label: string
  data: ServiceHealth
}) {
  const ok = data.status === "ok"
  return (
    <div
      className={cn(
        "rounded-[6px] border p-3 flex flex-col gap-1.5",
        ok ? "border-accent-green/20 bg-accent-green/5" : "border-secondary/20 bg-secondary/5"
      )}
    >
      <div className="flex items-center justify-between">
        <div className={cn("flex items-center gap-1.5 text-xs font-medium", ok ? "text-accent-green" : "text-secondary")}>
          {icon}
          {label}
        </div>
        {ok
          ? <CheckCircle className="h-3.5 w-3.5 text-accent-green" />
          : <XCircle className="h-3.5 w-3.5 text-secondary" />
        }
      </div>
      <p className={cn("text-[11px]", ok ? "text-accent-green/70" : "text-secondary/70")}>
        {ok ? "Online" : "Offline"} · {data.latencyMs}ms
      </p>
    </div>
  )
}

function StatCard({
  icon, label, value, sub, urgent, href,
}: {
  icon: React.ReactNode
  label: string
  value: number
  sub?: string
  urgent?: boolean
  href: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        "bg-surface border rounded-[8px] p-4 flex items-start gap-3 hover:border-primary transition-colors",
        urgent ? "border-secondary/40 bg-secondary/5" : "border-border",
      )}
    >
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-[22px] font-bold text-text-primary leading-none">{value}</p>
        <p className="text-xs text-text-secondary mt-1">{label}</p>
        {sub && <p className="text-[11px] text-text-secondary mt-0.5 opacity-70">{sub}</p>}
      </div>
    </Link>
  )
}

function CapacityBar({
  label, used, total, unit, freeLabel,
}: {
  label: string
  used: number
  total: number
  unit: string
  freeLabel: string
}) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const color = pct >= 90 ? CHART_COLORS.red : pct >= 70 ? CHART_COLORS.yellow : CHART_COLORS.green
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-primary font-medium">
          {used.toLocaleString()} / {total.toLocaleString()} {unit} ({pct}%)
        </span>
      </div>
      <div className="h-2 bg-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-[11px] text-text-secondary">{freeLabel}</p>
    </div>
  )
}
