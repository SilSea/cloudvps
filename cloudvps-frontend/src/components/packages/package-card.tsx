import Link from "next/link"
import { Cpu, HardDrive, MemoryStick, Globe, Network } from "lucide-react"
import { cn, formatCurrency, parseGib, parseDiskGb } from "@/lib/utils"
import type { Package } from "@/types/package"

interface Props {
  pkg: Package
  href?: string
}

export function PackageCard({ pkg, href }: Props) {
  const isPrivateIp = pkg.port_count !== null
  const target = href ?? `/billing/orders/new?packageId=${pkg.id}`
  const cpu = pkg.vm.core
  const ram = parseGib(pkg.vm.memory)
  const disk = parseDiskGb(pkg.vm.size)
  const osLabel = `${pkg.os.os_name} ${pkg.os.os_version}`

  return (
    <Link
      href={target}
      className={cn(
        "block bg-surface border border-border rounded-[8px] overflow-hidden",
        "hover:border-primary hover:shadow-[0_1px_3px_rgba(25,25,25,0.08)] transition-all",
      )}
    >
      <div className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-text-primary line-clamp-2">{pkg.name}</h3>
            <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{osLabel}</p>
          </div>
          <span
            className={cn(
              "shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-[9999px]",
              isPrivateIp
                ? "bg-accent-yellow/10 text-accent-yellow"
                : "bg-accent-green/10 text-accent-green",
            )}
          >
            {isPrivateIp ? "NAT" : "Public IP"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Spec icon={<Cpu className="h-3 w-3" />} value={`${cpu} vCPU`} />
          <Spec icon={<MemoryStick className="h-3 w-3" />} value={`${ram} GB`} />
          <Spec icon={<HardDrive className="h-3 w-3" />} value={`${disk} GB`} />
        </div>

        {isPrivateIp ? (
          <div className="flex items-center gap-1 text-xs text-text-secondary">
            <Network className="h-3 w-3" />
            <span>NAT {pkg.port_count} ports</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-text-secondary">
            <Globe className="h-3 w-3" />
            <span>Public IP</span>
          </div>
        )}

        <div className="pt-1 border-t border-border">
          <span className="text-[16px] font-bold text-text-primary">
            {formatCurrency(pkg.price)}
          </span>
          <span className="text-xs text-text-secondary ml-1">/{pkg.period} วัน</span>
        </div>
      </div>
    </Link>
  )
}

function Spec({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 bg-background rounded-[4px] p-1.5">
      <span className="text-text-secondary">{icon}</span>
      <span className="text-[10px] font-medium text-text-primary">{value}</span>
    </div>
  )
}
