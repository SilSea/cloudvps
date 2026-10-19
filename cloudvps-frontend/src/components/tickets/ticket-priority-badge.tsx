import { Badge } from "@/components/ui/badge"
import { TICKET_PRIORITY_COLORS, TICKET_PRIORITY_LABELS } from "@/types/ticket"
import type { TicketPriority } from "@/types/ticket"

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <Badge variant="outline" className={`text-xs rounded-[9999px] ${TICKET_PRIORITY_COLORS[priority]}`}>
      {TICKET_PRIORITY_LABELS[priority]}
    </Badge>
  )
}
