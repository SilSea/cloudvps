"use client"

import { use, useState } from "react"
import Link from "next/link"
import { ArrowLeft, RotateCcw } from "lucide-react"
import { VpsDetailCard } from "@/components/vps/vps-detail-card"
import { VpsLiveStatusPanel } from "@/components/vps/vps-live-status-panel"
import { VpsTerminalModal } from "@/components/vps/vps-terminal-modal"
import { VpsChangePasswordModal } from "@/components/vps/vps-change-password-modal"
import { PortRulesTable } from "@/components/vps/port-rules-table"
import { VpsUpgradeSection } from "@/components/vps/vps-upgrade-section"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { useVps, useVpsActions, useVpsStatus, useVpsPasswordChange, useRebootIndicator } from "@/hooks/useVps"
import { useAuth } from "@/hooks/useAuth"
import { getDaysUntil, isExpiringSoon } from "@/lib/utils"

export default function VpsDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const vpsId = Number(id)
  const { user } = useAuth()
  const [resetting, setResetting] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

  const { rebooting, startReboot, checkRunning } = useRebootIndicator()
  const { data: vps, isLoading } = useVps(vpsId, { fastPoll: rebooting })
  const { start, stop, reboot, forceReset, toggleAutoRenew } = useVpsActions(vpsId)
  const liveStatus = useVpsStatus(vpsId)
  const passwordChange = useVpsPasswordChange(vpsId)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px] rounded-[8px]" />
      </div>
    )
  }

  if (!vps) return <p className="text-text-secondary">ไม่พบ VPS</p>

  const expiring = isExpiringSoon(vps.expired_at)
  const daysLeft = getDaysUntil(vps.expired_at)
  const isPrivateIp = vps.nat != null
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
      <Link href="/vps" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> กลับ
      </Link>

      {expiring && (
        <div className="flex items-center gap-2 p-3 bg-secondary/10 border border-secondary/30 rounded-[8px] text-secondary text-sm font-medium">
          <RotateCcw className="h-4 w-4" />
          VPS หมดอายุใน {daysLeft} วัน กรุณาต่ออายุ
        </div>
      )}

      <VpsDetailCard
        vps={vps}
        isRunning={isRunning}
        proxmoxOffline={proxmoxOffline}
        dbMismatch={dbMismatch}
        expiring={expiring}
        daysLeft={daysLeft}
        actions={{
          onStart: () => start.mutate(),
          onStop: () => stop.mutate(),
          onReboot: () => { reboot.mutate(); startReboot() },
          onForceReset: () => setResetting(true),
          onOpenTerminal: () => setTerminalOpen(true),
          onChangePassword: () => setChangingPassword(true),
          startPending: start.isPending,
          stopPending: stop.isPending,
          rebootPending: reboot.isPending,
          forceResetPending: forceReset.isPending,
        }}
        autoRenew={{
          value: vps.auto_renew,
          onChange: (checked) => toggleAutoRenew.mutate({ auto_renew: checked }),
          pending: toggleAutoRenew.isPending,
        }}
      />

      <VpsLiveStatusPanel status={liveStatus.data} isLoading={liveStatus.isLoading} isError={liveStatus.isError} />

      {isPrivateIp && (
        <div className="bg-surface border border-border rounded-[8px] p-5">
          <PortRulesTable vpsId={vps.id} privateIp={vps.ip_assignment.ip_pool.ip} />
        </div>
      )}

      <VpsUpgradeSection vps={vps} />

      <ConfirmDialog
        open={resetting}
        title="Force Reset VPS"
        description="Force reset จะ restart VM ทันทีโดยไม่ graceful shutdown ข้อมูลที่ยังไม่ได้บันทึกอาจสูญหาย"
        confirmLabel="Force Reset"
        isPending={forceReset.isPending}
        onConfirm={() => { forceReset.mutate(); setResetting(false) }}
        onCancel={() => setResetting(false)}
      />

      <VpsTerminalModal vpsId={vps.id} vpsName={vps.name} open={terminalOpen} onOpenChange={setTerminalOpen} />

      <VpsChangePasswordModal
        open={changingPassword}
        onOpenChange={setChangingPassword}
        ownerEmail={user?.email ?? undefined}
        hooks={passwordChange}
        vmRunning={isRunning === true}
        isWindows={/windows/i.test(vps.order.package.os?.os_name ?? "")}
      />
    </div>
  )
}
