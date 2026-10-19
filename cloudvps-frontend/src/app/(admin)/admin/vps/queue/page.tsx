"use client"

import { Play, Loader2, ServerCog } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useVpsQueue, useProvisionVps } from "@/hooks/useAdmin"
import { formatDate } from "@/lib/utils"

export default function VpsQueuePage() {
  const { data: queue = [], isLoading } = useVpsQueue()
  const provision = useProvisionVps()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ServerCog className="h-6 w-6 text-accent-yellow" />
        <div>
          <h1 className="text-[28px] font-bold text-text-primary">คิว Provision VPS</h1>
          <p className="text-sm text-text-secondary mt-0.5">รายการรอสร้าง VPS อัปเดตทุก 15 วินาที</p>
        </div>
        {!isLoading && (
          <Badge variant="outline" className="ml-auto text-sm rounded-[9999px] text-accent-yellow border-accent-yellow/30">
            {queue.length} รายการ
          </Badge>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-[8px]" />)}
        </div>
      ) : queue.length === 0 ? (
        <div className="text-center py-20 text-text-secondary text-sm">
          <ServerCog className="h-10 w-10 mx-auto mb-3 text-text-secondary/30" />
          ไม่มี VPS รอ Provision
        </div>
      ) : (
        <div className="space-y-3">
          {queue.map((item) => (
            <div key={item.id} className="bg-surface border border-border rounded-[8px] p-4 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-text-primary">{item.order.package.name}</span>
                  <Badge variant="outline" className="text-xs rounded-[9999px]">Order #{item.order_id}</Badge>
                  <Badge variant="outline" className="text-xs rounded-[9999px]">Ref: {item.order.ref_no}</Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-secondary flex-wrap">
                  <span>{item.order.user.email}</span>
                  {item.order.package.os && (
                    <span>{item.order.package.os.os_name} {item.order.package.os.os_version}</span>
                  )}
                  <span>ยอด ฿{item.order.amount.toLocaleString()}</span>
                  <span>เข้าคิว {formatDate(item.created_at)}</span>
                </div>
              </div>
              <Button
                size="sm"
                className="rounded-[9999px] gap-1 shrink-0"
                disabled={provision.isPending}
                onClick={() => provision.mutate(item.order_id)}
              >
                {provision.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                Provision
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
