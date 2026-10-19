import Link from "next/link"
import { Cpu, HardDrive, MemoryStick, Globe, Network, ArrowRight } from "lucide-react"
import { cn, formatCurrency, parseGib, parseDiskGb } from "@/lib/utils"
import type { Package } from "@/types/package"

interface Props {
  pkg: Package
  href?: string
}

export function PackageListItem({ pkg, href }: Props) {
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
        "flex items-center gap-4 px-4 py-3 bg-surface border border-border rounded-[8px]",
        "hover:border-primary hover:shadow-[0_1px_3px_rgba(25,25,25,0.08)] transition-all",
      )}
    >
      {/* Name + OS */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-medium text-text-primary">{pkg.name}</h3>
          <span
            className={cn(
              "text-[10px] font-medium px-2 py-0.5 rounded-[9999px]",
              isPrivateIp
                ? "bg-accent-yellow/10 text-accent-yellow"
                : "bg-accent-green/10 text-accent-green",
            )}
          >
            {isPrivateIp ? "NAT" : "Public IP"}
          </span>
        </div>
        <p className="text-xs text-text-secondary mt-0.5">{osLabel}</p>
      </div>

      {/* Specs */}
      <div className="hidden sm:flex items-center gap-4 shrink-0">
        <Spec icon={<Cpu className="h-3 w-3" />} value={`${cpu} vCPU`} />
        <Spec icon={<MemoryStick className="h-3 w-3" />} value={`${ram} GB`} />
        <Spec icon={<HardDrive className="h-3 w-3" />} value={`${disk} GB`} />
        {isPrivateIp ? (
          <Spec icon={<Network className="h-3 w-3" />} value={`${pkg.port_count} ports`} />
        ) : (
          <Spec icon={<Globe className="h-3 w-3" />} value="Public IP" />
        )}
      </div>

      {/* Price */}
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold text-text-primary">{formatCurrency(pkg.price)}</p>
        <p className="text-[11px] text-text-secondary">/{pkg.period} วัน</p>
      </div>

      <ArrowRight className="h-4 w-4 text-text-secondary shrink-0" />
    </Link>
  )
}

function Spec({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-1 text-xs text-text-secondary">
      {icon}
      <span>{value}</span>
    </div>
  )
}
