"use client"

import { Activity, Cpu, MemoryStick, HardDrive, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import type { VpsLiveStatus } from "@/types/vps"

interface Props {
  status?: VpsLiveStatus
  isLoading: boolean
  isError: boolean
}

const STATUS_COLOR: Record<string, string> = {
  running: "bg-accent-green text-white",
  stopped: "bg-secondary text-white",
  paused: "bg-accent-yellow text-white",
}

export function VpsLiveStatusPanel({ status, isLoading, isError }: Props) {
  return (
    <div className="bg-surface border border-border rounded-[8px] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-primary flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-text-secondary" /> สถานะ Live
        </h2>
        {status && (
          <span className={cn("text-xs px-2 py-0.5 rounded-[9999px] font-medium", STATUS_COLOR[status.status] ?? "bg-text-secondary text-white")}>
            {status.status}
          </span>
        )}
      </div>

      {isError ? (
        <p className="text-xs text-secondary text-center py-3">ไม่สามารถเชื่อมต่อ Proxmox</p>
      ) : isLoading || !status ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-background rounded-[6px] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricBar
            icon={<Cpu className="h-3.5 w-3.5" />}
            label="CPU"
            pct={status.cpu_pct}
            display={`${status.cpu_pct.toFixed(1)}%`}
          />
          <MetricBar
            icon={<MemoryStick className="h-3.5 w-3.5" />}
            label="RAM"
            pct={status.maxmem_mb > 0 ? (status.mem_mb / status.maxmem_mb) * 100 : 0}
            display={`${status.mem_mb} / ${status.maxmem_mb} MB`}
          />
          {status.disk_used_gb != null && status.disk_total_gb != null ? (
            <MetricBar
              icon={<HardDrive className="h-3.5 w-3.5" />}
              label="Disk (/)"
              pct={status.disk_total_gb > 0 ? (status.disk_used_gb / status.disk_total_gb) * 100 : 0}
              display={`${status.disk_used_gb.toFixed(1)} / ${status.disk_total_gb.toFixed(1)} GB`}
            />
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-xs text-text-secondary">
                <HardDrive className="h-3.5 w-3.5" /> Disk (/)
              </div>
              <p className="text-sm font-medium text-text-secondary">N/A</p>
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1 text-xs text-text-secondary">
              <Clock className="h-3.5 w-3.5" /> Uptime
            </div>
            <p className="text-sm font-medium text-text-primary">{formatUptime(status.uptime_sec)}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricBar({ icon, label, pct, display }: { icon: React.ReactNode; label: string; pct: number; display: string }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 text-xs text-text-secondary">
        {icon} {label}
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", clamped >= 90 ? "bg-secondary" : clamped >= 70 ? "bg-accent-yellow" : "bg-accent-green")}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="text-[11px] text-text-secondary">{display}</p>
    </div>
  )
}

function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(" ") || "0m"
}
