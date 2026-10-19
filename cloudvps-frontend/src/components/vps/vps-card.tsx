import Link from "next/link"
import { Cpu, HardDrive, MemoryStick, AlertTriangle } from "lucide-react"
import { VpsStatusBadge } from "./vps-status-badge"
import { formatDateShort, isExpiringSoon, getDaysUntil } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { Vps } from "@/types/vps"

export function VpsCard({ vps }: { vps: Vps }) {
  const expiring = isExpiringSoon(vps.expired_at)
  const daysLeft = getDaysUntil(vps.expired_at)
  const ip = vps.ip_assignment.ip_pool.ip

  return (
    <Link
      href={`/vps/${vps.id}`}
      className="block bg-surface border border-border rounded-[8px] p-4 hover:border-primary hover:shadow-[0_1px_3px_rgba(25,25,25,0.08)] transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="font-medium text-text-primary">{vps.name}</h3>
          <p className="text-xs text-text-secondary mt-0.5 font-mono">{ip}</p>
        </div>
        <VpsStatusBadge status={vps.status} />
      </div>

      <div className="flex items-center gap-3 text-xs text-text-secondary mb-3">
        <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{vps.current_cores} vCPU</span>
        <span className="flex items-center gap-1"><MemoryStick className="h-3 w-3" />{vps.current_memory_gib} GB</span>
        <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{vps.current_disk_gb} GB</span>
      </div>

      <div className={cn("flex items-center gap-1 text-xs", expiring ? "text-secondary font-medium" : "text-text-secondary")}>
        {expiring && <AlertTriangle className="h-3 w-3" />}
        <span>
          {expiring
            ? `หมดอายุใน ${daysLeft} วัน (${formatDateShort(vps.expired_at)})`
            : `หมดอายุ ${formatDateShort(vps.expired_at)}`}
        </span>
      </div>
    </Link>
  )
}
