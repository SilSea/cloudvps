"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { PolicyService } from "@/services/api/policies"
import type { Policy } from "@/types/policy"

interface Props {
  open: boolean
  onAccept: (policyIds: number[]) => void
  onClose: () => void
}

export function PolicyConsentModal({ open, onAccept, onClose }: Props) {
  const [scrolledAll, setScrolledAll] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: policies, isLoading } = useQuery<Policy[]>({
    queryKey: ["policies", "active"],
    queryFn: () => PolicyService.getActive(),
    enabled: open,
  })

  useEffect(() => {
    setScrolledAll(false) // eslint-disable-line react-hooks/set-state-in-effect
  }, [open])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (atBottom) setScrolledAll(true)
  }

  const handleAccept = () => {
    if (!policies) return
    onAccept(policies.map((p) => p.id))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>นโยบายความเป็นส่วนตัวและเงื่อนไขการใช้งาน</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <p className="text-sm text-text-secondary">
              กรุณาอ่านและเลื่อนลงจนสุดก่อนกดยอมรับ
            </p>
            <ScrollArea className="flex-1 min-h-0" onScrollCapture={handleScroll}>
              <div ref={scrollRef} className="space-y-6 pr-4">
                {policies?.map((policy, i) => (
                  <div key={policy.id}>
                    {i > 0 && <Separator className="my-4" />}
                    <h3 className="font-semibold text-text-primary mb-2">
                      {policy.policies_type === "PDPA" ? "นโยบายความเป็นส่วนตัว" : "เงื่อนไขการใช้งาน"}{" "}
                      <span className="text-xs text-text-secondary font-normal">
                        v{policy.version}
                      </span>
                    </h3>
                    <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">
                      {policy.policies_detail}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="rounded-[9999px]">
            ยกเลิก
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!scrolledAll || isLoading}
            className="rounded-[9999px]"
          >
            ยอมรับทั้งหมด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
