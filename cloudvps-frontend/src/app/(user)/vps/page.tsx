"use client"

import Link from "next/link"
import { Server } from "lucide-react"
import { VpsCard } from "@/components/vps/vps-card"
import { Skeleton } from "@/components/ui/skeleton"
import { useVpsList } from "@/hooks/useVps"

export default function VpsListPage() {
  const { data, isLoading } = useVpsList()
  const vpsList = data?.vps ?? []

  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold text-text-primary">VPS ของฉัน</h1>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[120px] rounded-[8px]" />)}
        </div>
      ) : vpsList.length === 0 ? (
        <div className="text-center py-16 bg-surface border border-border rounded-[8px]">
          <Server className="h-12 w-12 text-border mx-auto mb-4" />
          <p className="text-text-secondary mb-4">ยังไม่มี VPS</p>
          <Link href="/packages" className="text-primary hover:underline">เลือกแพ็กเกจ →</Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {vpsList.map((vps) => <VpsCard key={vps.id} vps={vps} />)}
        </div>
      )}
    </div>
  )
}
