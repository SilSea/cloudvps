"use client"

import Link from "next/link"
import { Server, AlertTriangle, CheckCircle, ShoppingCart, User } from "lucide-react"
import { VpsCard } from "@/components/vps/vps-card"
import { Skeleton } from "@/components/ui/skeleton"
import { useVpsList } from "@/hooks/useVps"
import { isExpiringSoon } from "@/lib/utils"

export default function DashboardPage() {
  const { data, isLoading } = useVpsList()
  const vpsList = data?.vps ?? []

  const running = vpsList.filter((v) => v.status === true).length
  const expiring = vpsList.filter((v) => isExpiringSoon(v.expired_at)).length
  const total = vpsList.length

  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold text-text-primary">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={<Server className="h-5 w-5 text-primary" />} label="VPS ทั้งหมด" value={total} />
        <StatCard icon={<CheckCircle className="h-5 w-5 text-accent-green" />} label="กำลังทำงาน" value={running} />
        <StatCard icon={<AlertTriangle className="h-5 w-5 text-secondary" />} label="ใกล้หมดอายุ" value={expiring} urgent={expiring > 0} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/billing/orders/new" className="flex items-center gap-3 p-4 bg-surface border border-border rounded-[8px] hover:border-primary transition-colors">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium text-text-primary">สั่งซื้อ VPS</span>
        </Link>
        <Link href="/profile" className="flex items-center gap-3 p-4 bg-surface border border-border rounded-[8px] hover:border-primary transition-colors">
          <User className="h-5 w-5 text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">โปรไฟล์</span>
        </Link>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[18px] font-bold text-text-primary">VPS ของฉัน</h2>
          <Link href="/vps" className="text-sm text-primary hover:underline">ดูทั้งหมด</Link>
        </div>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[120px] rounded-[8px]" />)}
          </div>
        ) : vpsList.length === 0 ? (
          <div className="text-center py-12 bg-surface border border-border rounded-[8px]">
            <Server className="h-10 w-10 text-border mx-auto mb-3" />
            <p className="text-text-secondary text-sm mb-3">ยังไม่มี VPS</p>
            <Link href="/billing/orders/new" className="text-primary text-sm hover:underline">เลือกแพ็กเกจ →</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {vpsList.slice(0, 6).map((vps) => <VpsCard key={vps.id} vps={vps} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, urgent }: { icon: React.ReactNode; label: string; value: number; urgent?: boolean }) {
  return (
    <div className={`bg-surface border rounded-[8px] p-4 flex items-center gap-3 ${urgent ? "border-secondary/30" : "border-border"}`}>
      {icon}
      <div>
        <p className="text-[22px] font-bold text-text-primary">{value}</p>
        <p className="text-xs text-text-secondary">{label}</p>
      </div>
    </div>
  )
}
