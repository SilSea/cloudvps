"use client"

import { use } from "react"
import Link from "next/link"
import { ArrowLeft, RotateCcw } from "lucide-react"
import { VpsDetailCard } from "@/components/vps/vps-detail-card"
import { VpsLiveStatusPanel } from "@/components/vps/vps-live-status-panel"
import { VpsUpgradeSection } from "@/components/vps/vps-upgrade-section"
import { Skeleton } from "@/components/ui/skeleton"
import { useSupportVpsDetail, useSupportVpsActions, useSupportVpsStatus, useSupportUpgradePackage, useSupportUpgradeCustom, useSupportUpgradeHistory } from "@/hooks/useSupport"
import { useRebootIndicator } from "@/hooks/useVps"
import { getDaysUntil, isExpiringSoon } from "@/lib/utils"

export default function SupportVpsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const vpsId = Number(id)
  const { rebooting, startReboot, checkRunning } = useRebootIndicator()
  const { data: vps, isLoading } = useSupportVpsDetail(vpsId, { fastPoll: rebooting })
  const actions = useSupportVpsActions()
  const liveStatus = useSupportVpsStatus(vpsId)

  const upgradePackage = useSupportUpgradePackage(vpsId)
  const upgradeCustom = useSupportUpgradeCustom(vpsId)
  const historyQuery = useSupportUpgradeHistory(vpsId)

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[220px] rounded-[8px]" />
        <Skeleton className="h-[300px] rounded-[8px]" />
      </div>
    )
  }

  if (!vps) return <p className="text-text-secondary">ไม่พบ VPS</p>

  const expiring = isExpiringSoon(vps.expired_at)
  const daysLeft = getDaysUntil(vps.expired_at)
  const proxmoxOffline = vps.live_status === null
  const baseIsRunning: boolean | "unknown" = proxmoxOffline
    ? "unknown"
    : vps.live_status
      ? vps.live_status.status === "running"
      : vps.status
  checkRunning(baseIsRunning)
  const isRunning: boolean | "unknown" | "rebooting" = rebooting ? "rebooting" : baseIsRunning
  const dbMismatch =
    !proxmoxOffline &&
    vps.live_status != null &&
    (vps.live_status.status === "running") !== vps.status

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/support/vps" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> กลับ
      </Link>

      {expiring && (
        <div className="flex items-center gap-2 p-3 bg-secondary/10 border border-secondary/30 rounded-[8px] text-secondary text-sm font-medium">
          <RotateCcw className="h-4 w-4" />
          VPS หมดอายุใน {daysLeft} วัน
        </div>
      )}

      <VpsDetailCard
        vps={vps}
        isRunning={isRunning}
        proxmoxOffline={proxmoxOffline}
        dbMismatch={dbMismatch}
        expiring={expiring}
        daysLeft={daysLeft}
        showOwner
        actions={{
          onStart: () => actions.startVps.mutate(vps.id),
          onStop: () => actions.stopVps.mutate(vps.id),
          onReboot: () => { actions.rebootVps.mutate(vps.id); startReboot() },
          startPending: actions.startVps.isPending,
          stopPending: actions.stopVps.isPending,
          rebootPending: actions.rebootVps.isPending,
        }}
      />

      <VpsLiveStatusPanel status={liveStatus.data} isLoading={liveStatus.isLoading} isError={liveStatus.isError} />

      <VpsUpgradeSection
        vps={vps}
        allowDowngrade
        hooks={{ upgradePackage, upgradeCustom, historyQuery }}
      />
    </div>
  )
}
