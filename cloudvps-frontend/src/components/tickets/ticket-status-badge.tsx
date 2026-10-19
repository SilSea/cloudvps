import { Badge } from "@/components/ui/badge"
import { TICKET_STATUS_COLORS, TICKET_STATUS_LABELS } from "@/types/ticket"
import type { TicketStatus } from "@/types/ticket"

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return (
    <Badge variant="outline" className={`text-xs rounded-[9999px] ${TICKET_STATUS_COLORS[status]}`}>
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  )
}
