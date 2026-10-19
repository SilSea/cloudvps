"use client"

import { Play, Square, RotateCcw, Trash2, Loader2, User, Globe, Cpu, MemoryStick, HardDrive, Calendar, RefreshCw, AlertTriangle, Terminal, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { VpsStatusBadge } from "@/components/vps/vps-status-badge"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/utils"
import type { Vps } from "@/types/vps"

interface Actions {
  onStart: () => void
  onStop: () => void
  onReboot: () => void
  onForceDelete?: () => void
  onForceReset?: () => void
  onOpenTerminal?: () => void
  onChangePassword?: () => void
  startPending: boolean
  stopPending: boolean
  rebootPending: boolean
  forceDeletePending?: boolean
  forceResetPending?: boolean
}

interface AutoRenewConfig {
  value: boolean
  onChange: (v: boolean) => void
  pending: boolean
}

interface Props {
  vps: Vps
  isRunning: boolean | "unknown" | "rebooting"
  proxmoxOffline: boolean
  dbMismatch?: boolean
  actions: Actions
  showOwner?: boolean
  autoRenew?: AutoRenewConfig
  expiring?: boolean
  daysLeft?: number
}

export function VpsDetailCard({
  vps,
  isRunning,
  proxmoxOffline,
  dbMismatch,
  actions,
  showOwner,
  autoRenew,
  expiring,
}: Props) {
  const ip = vps.ip_assignment.ip_pool.ip
  const osName = vps.order.package?.os
    ? `${vps.order.package.os.os_name} ${vps.order.package.os.os_version}`
    : "—"
  const isActing =
    actions.startPending ||
    actions.stopPending ||
    actions.rebootPending ||
    (actions.forceDeletePending ?? false) ||
    (actions.forceResetPending ?? false) ||
    isRunning === "rebooting"

  const cpuPct = vps.live_status?.cpu != null
    ? `${(vps.live_status.cpu * 100).toFixed(1)}% ใช้งาน`
    : undefined
  const ramPct =
    vps.live_status?.mem != null && vps.live_status.maxmem
      ? `${((vps.live_status.mem / vps.live_status.maxmem) * 100).toFixed(1)}% ใช้งาน`
      : undefined
  const uptime = vps.live_status?.uptime

  return (
    <div className="bg-surface border border-border rounded-[8px] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-bold text-text-primary">{vps.name}</h1>
          <p className="text-sm text-text-secondary mt-0.5">{osName}</p>
        </div>
        <VpsStatusBadge status={isRunning} />
      </div>

      {/* Warnings */}
      {proxmoxOffline && (
        <p className="text-xs text-accent-yellow bg-accent-yellow/5 border border-accent-yellow/20 rounded-[6px] px-3 py-2">
          ⚠ ไม่สามารถติดต่อ Proxmox — สถานะจริงไม่ทราบ (DB: {vps.status ? "running" : "stopped"})
        </p>
      )}
      {dbMismatch && (
        <p className="text-xs text-accent-yellow bg-accent-yellow/5 border border-accent-yellow/20 rounded-[6px] px-3 py-2">
          ⚠ สถานะ DB ({vps.status ? "running" : "stopped"}) ไม่ตรงกับ Proxmox จริง
        </p>
      )}

      {/* Owner row — admin/support only */}
      {showOwner && (
        <div className="flex items-center gap-2 p-3 bg-background border border-border rounded-[6px] text-sm">
          <User className="h-4 w-4 text-text-secondary shrink-0" />
          <span className="text-text-secondary">เจ้าของ:</span>
          <span className="font-medium text-text-primary truncate">
            {vps.order.user?.email ?? `User #${vps.order.users_id}`}
          </span>
        </div>
      )}

      {/* Control buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 rounded-[9999px] text-accent-green border-accent-green/30 hover:bg-accent-green/10"
          disabled={isRunning === true || isActing}
          onClick={actions.onStart}
        >
          {actions.startPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Start
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 rounded-[9999px] hover:bg-border"
          disabled={isRunning === false || isRunning === "unknown" || isActing}
          onClick={actions.onStop}
        >
          {actions.stopPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
          Stop
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 rounded-[9999px] text-accent-yellow border-accent-yellow/30 hover:bg-accent-yellow/10"
          disabled={isRunning === false || isRunning === "unknown" || isActing}
          onClick={actions.onReboot}
        >
          {actions.rebootPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Reboot
        </Button>
        {actions.onForceReset && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-[9999px] text-secondary border-secondary/30 hover:bg-secondary/10"
            disabled={isRunning === false || isRunning === "unknown" || isActing}
            onClick={actions.onForceReset}
          >
            {actions.forceResetPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            Reset
          </Button>
        )}
        {actions.onOpenTerminal && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-[9999px] text-primary border-primary/30 hover:bg-primary/10"
            disabled={isRunning !== true}
            onClick={actions.onOpenTerminal}
          >
            <Terminal className="h-3.5 w-3.5" />
            Console
          </Button>
        )}
        {actions.onChangePassword && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-[9999px] hover:bg-border"
            disabled={isRunning !== true}
            onClick={actions.onChangePassword}
          >
            <KeyRound className="h-3.5 w-3.5" />
            เปลี่ยนรหัสผ่าน
          </Button>
        )}
      </div>

      {actions.onForceDelete && (
        <div className="flex justify-end pt-3 border-t border-border">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 rounded-[9999px] text-secondary border-secondary/30 hover:bg-secondary/10"
            disabled={isActing}
            onClick={actions.onForceDelete}
          >
            {actions.forceDeletePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Force Delete
          </Button>
        </div>
      )}

      {/* Specs grid */}
      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
        <SpecRow icon={<Cpu className="h-4 w-4" />} label="CPU" value={`${vps.current_cores} vCPU`} sub={cpuPct} />
        <SpecRow icon={<MemoryStick className="h-4 w-4" />} label="RAM" value={`${vps.current_memory_gib} GB`} sub={ramPct} />
        <SpecRow icon={<HardDrive className="h-4 w-4" />} label="Disk" value={`${vps.current_disk_gb} GB`} />
        <SpecRow icon={<Globe className="h-4 w-4" />} label="IP" value={ip} mono />
      </div>

      {/* Uptime */}
      {uptime != null && uptime > 0 && (
        <p className="text-xs text-text-secondary">Uptime: {formatUptime(uptime)}</p>
      )}

      {/* NAT */}
      {vps.nat && (
        <div className="pt-3 border-t border-border text-sm">
          <p className="text-text-secondary mb-1 text-xs">NAT Public IP</p>
          <p className="font-mono text-text-primary text-sm">
            {vps.nat.nat_allocation.public_ip}:{vps.nat.nat_allocation.port_start}–{vps.nat.nat_allocation.port_end}
          </p>
        </div>
      )}

      {/* Footer — expiry + optional auto-renew */}
      <div className="flex items-center justify-between pt-3 border-t border-border flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Calendar className="h-4 w-4" />
          <span className={cn(expiring && "text-secondary font-medium")}>
            หมดอายุ {formatDate(vps.expired_at)}
          </span>
        </div>
        {autoRenew && (
          <div className="flex items-center gap-2 text-sm">
            <RefreshCw className="h-4 w-4 text-text-secondary" />
            <span className="text-text-secondary">Auto-renew</span>
            <Switch
              checked={autoRenew.value}
              onCheckedChange={autoRenew.onChange}
              disabled={autoRenew.pending}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function SpecRow({
  icon,
  label,
  value,
  sub,
  mono,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-secondary">{icon}</span>
      <div>
        <p className="text-xs text-text-secondary">{label}</p>
        <p className={cn("text-sm font-medium text-text-primary", mono && "font-mono")}>{value}</p>
        {sub && <p className="text-[11px] text-primary">{sub}</p>}
      </div>
    </div>
  )
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
