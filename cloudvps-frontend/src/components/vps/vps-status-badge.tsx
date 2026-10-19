import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type VpsStatus = boolean | "unknown" | "rebooting"

export function VpsStatusBadge({ status }: { status: VpsStatus }) {
  if (status === "rebooting") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[9999px] text-[11px] font-medium bg-accent-yellow text-white">
        <Loader2 className="h-3 w-3 animate-spin" /> Rebooting
      </span>
    )
  }
  if (status === "unknown") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-[9999px] text-[11px] font-medium bg-border text-text-secondary">
        Unknown
      </span>
    )
  }
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-[9999px] text-[11px] font-medium",
        status ? "bg-accent-green text-white" : "bg-text-secondary text-white",
      )}
    >
      {status ? "Running" : "Stopped"}
    </span>
  )
}
