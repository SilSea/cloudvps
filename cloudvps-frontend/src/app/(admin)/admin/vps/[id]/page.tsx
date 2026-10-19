"use client"

import { use, useState } from "react"
import Link from "next/link"
import { ArrowLeft, RotateCcw } from "lucide-react"
import { VpsDetailCard } from "@/components/vps/vps-detail-card"
import { VpsLiveStatusPanel } from "@/components/vps/vps-live-status-panel"
import { VpsTerminalModal } from "@/components/vps/vps-terminal-modal"
import { VpsChangePasswordModal } from "@/components/vps/vps-change-password-modal"
import { VpsUpgradeSection } from "@/components/vps/vps-upgrade-section"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { useAdminVpsDetail, useAdminUpgradePackage, useAdminUpgradeCustom, useAdminUpgradeHistory, useAdminVpsPasswordChange } from "@/hooks/useAdmin"
import { useSupportVpsActions, useSupportVpsStatus } from "@/hooks/useSupport"
import { useRebootIndicator } from "@/hooks/useVps"
import { getDaysUntil, isExpiringSoon } from "@/lib/utils"

export default function AdminVpsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const vpsId = Number(id)
  const { rebooting, startReboot, checkRunning } = useRebootIndicator()
  const { data: vps, isLoading } = useAdminVpsDetail(vpsId, { fastPoll: rebooting })
  const actions = useSupportVpsActions()
  const liveStatus = useSupportVpsStatus(vpsId)
  const passwordChange = useAdminVpsPasswordChange(vpsId)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [resettingId, setResettingId] = useState<number | null>(null)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  const upgradePackage = useAdminUpgradePackage(vpsId)
  const upgradeCustom = useAdminUpgradeCustom(vpsId)
  const historyQuery = useAdminUpgradeHistory(vpsId)

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
      <Link href="/admin/vps" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary">
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
          onForceDelete: () => setDeletingId(vps.id),
          onForceReset: () => setResettingId(vps.id),
          onOpenTerminal: () => setTerminalOpen(true),
          onChangePassword: () => setChangingPassword(true),
          startPending: actions.startVps.isPending,
          stopPending: actions.stopVps.isPending,
          rebootPending: actions.rebootVps.isPending,
          forceDeletePending: actions.forceDelete.isPending,
          forceResetPending: actions.forceReset.isPending,
        }}
      />

      <VpsLiveStatusPanel status={liveStatus.data} isLoading={liveStatus.isLoading} isError={liveStatus.isError} />

      <VpsUpgradeSection
        vps={vps}
        allowDowngrade
        hooks={{ upgradePackage, upgradeCustom, historyQuery }}
      />

      <ConfirmDialog
        open={deletingId !== null}
        title="Force Delete VPS"
        description="VPS นี้จะถูกลบออกจากระบบถาวร รวมถึงข้อมูลทั้งหมด"
        confirmLabel="Force Delete"
        isPending={actions.forceDelete.isPending}
        onConfirm={() => { actions.forceDelete.mutate(deletingId!); setDeletingId(null) }}
        onCancel={() => setDeletingId(null)}
      />

      <ConfirmDialog
        open={resettingId !== null}
        title="Force Reset VPS"
        description="Force reset จะ restart VM ทันทีโดยไม่ graceful shutdown ข้อมูลที่ยังไม่ได้บันทึกอาจสูญหาย"
        confirmLabel="Force Reset"
        isPending={actions.forceReset.isPending}
        onConfirm={() => { actions.forceReset.mutate(resettingId!); setResettingId(null) }}
        onCancel={() => setResettingId(null)}
      />

      <VpsTerminalModal vpsId={vps.id} vpsName={vps.name} open={terminalOpen} onOpenChange={setTerminalOpen} />

      <VpsChangePasswordModal
        open={changingPassword}
        onOpenChange={setChangingPassword}
        ownerEmail={vps.order.user?.email}
        hooks={passwordChange}
        vmRunning={isRunning === true}
        isWindows={/windows/i.test(vps.order.package.os?.os_name ?? "")}
      />
    </div>
  )
}
