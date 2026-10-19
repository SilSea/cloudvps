"use client"

import { Play, Square, RotateCcw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useVpsActions } from "@/hooks/useVps"

interface Props {
  vpsId: number
  status: boolean | "unknown"
}

export function VpsControlButtons({ vpsId, status }: Props) {
  const { start, stop, reboot } = useVpsActions(vpsId)
  const busy = start.isPending || stop.isPending || reboot.isPending

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        className="rounded-[9999px] gap-2"
        disabled={busy || status === true}
        onClick={() => start.mutate()}
      >
        {start.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
        Start
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="rounded-[9999px] gap-2"
        disabled={busy || status === false || status === "unknown"}
        onClick={() => stop.mutate()}
      >
        {stop.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
        Stop
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="rounded-[9999px] gap-2"
        disabled={busy || status === false || status === "unknown"}
        onClick={() => reboot.mutate()}
      >
        {reboot.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
        Reboot
      </Button>
    </div>
  )
}
