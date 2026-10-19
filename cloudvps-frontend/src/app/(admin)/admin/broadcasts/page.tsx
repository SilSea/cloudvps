"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Radio } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useAdminBroadcasts, useSendBroadcast } from "@/hooks/useAdmin"
import { ViewToggle, type ViewMode } from "@/components/packages/view-toggle"
import { usePagination } from "@/hooks/usePagination"
import { Pagination } from "@/components/shared/pagination"
import { formatDate } from "@/lib/utils"
import type { BroadcastType } from "@/services/api/broadcasts"

const schema = z.object({
  type: z.enum(["MAINTENANCE", "EMERGENCY", "ANNOUNCEMENT"]),
  scope: z.enum(["ALL", "ACTIVE_VPS", "EXPIRING_SOON"]),
  subject: z.string().min(1, "กรุณากรอกหัวข้อ"),
  body: z.string().min(1, "กรุณากรอกเนื้อหา"),
})
type FormData = z.infer<typeof schema>

const TYPE_LABELS: Record<BroadcastType, string> = {
  MAINTENANCE: "ซ่อมบำรุง",
  EMERGENCY: "ฉุกเฉิน",
  ANNOUNCEMENT: "ประกาศ",
}

const TYPE_COLORS: Record<BroadcastType, string> = {
  MAINTENANCE: "bg-accent-yellow/10 text-accent-yellow border-accent-yellow/20",
  EMERGENCY: "bg-secondary/10 text-secondary border-secondary/20",
  ANNOUNCEMENT: "bg-primary/10 text-primary border-primary/20",
}

export default function BroadcastsPage() {
  const { data: broadcasts = [], isLoading } = useAdminBroadcasts()
  const send = useSendBroadcast()
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState<"ALL" | BroadcastType>("ALL")

  const filtered = broadcasts.filter((b) => {
    const matchSearch = b.subject.toLowerCase().includes(search.toLowerCase()) ||
      b.body.toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === "ALL" || b.type === filterType
    return matchSearch && matchType
  })
  const { page, setPage, totalPages, paginated, total } = usePagination(filtered, 10, `${search}:${filterType}`)
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: "ANNOUNCEMENT", scope: "ALL" },
  })

  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold text-text-primary">ประกาศ</h1>

      <div className="bg-surface border border-border rounded-[8px] p-5 space-y-4">
        <h2 className="font-medium text-text-primary flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" /> ส่งประกาศใหม่
        </h2>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => send.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>ประเภท</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="ANNOUNCEMENT">ประกาศ</SelectItem>
                      <SelectItem value="MAINTENANCE">ซ่อมบำรุง</SelectItem>
                      <SelectItem value="EMERGENCY">ฉุกเฉิน</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="scope" render={({ field }) => (
                <FormItem>
                  <FormLabel>กลุ่มเป้าหมาย</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="ALL">ทั้งหมด</SelectItem>
                      <SelectItem value="ACTIVE_VPS">มี VPS ใช้งาน</SelectItem>
                      <SelectItem value="EXPIRING_SOON">VPS ใกล้หมดอายุ</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="subject" render={({ field }) => (
              <FormItem><FormLabel>หัวข้อ</FormLabel><FormControl><Input placeholder="หัวข้อประกาศ" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="body" render={({ field }) => (
              <FormItem><FormLabel>เนื้อหา</FormLabel><FormControl><Textarea rows={4} {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <Button type="submit" className="rounded-[9999px]" disabled={send.isPending}>
              {send.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              ส่งประกาศ
            </Button>
          </form>
        </Form>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-text-primary">ประวัติการส่ง</h2>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="ค้นหาหัวข้อ/เนื้อหา..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary w-48"
          />
          {(["ALL", "ANNOUNCEMENT", "MAINTENANCE", "EMERGENCY"] as const).map((t) => (
            <Button key={t} size="sm" variant={filterType === t ? "default" : "outline"}
              className="rounded-[9999px] h-7 px-3 text-xs"
              onClick={() => setFilterType(t as "ALL" | BroadcastType)}>
              {t === "ALL" ? "ทั้งหมด" : TYPE_LABELS[t as BroadcastType] ?? t}
            </Button>
          ))}
        </div>
        {isLoading ? (
          <div className="space-y-2">{[1,2].map((i) => <Skeleton key={i} className="h-16 rounded-[8px]" />)}</div>
        ) : total === 0 ? (
          <p className="text-sm text-text-secondary">ยังไม่มีประกาศ</p>
        ) : viewMode === "grid" ? (
          <div className="space-y-2">
            {paginated.map((b) => (
              <div key={b.id} className="bg-surface border border-border rounded-[8px] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={`text-xs rounded-[9999px] ${TYPE_COLORS[b.type]}`}>{TYPE_LABELS[b.type]}</Badge>
                      <Badge variant="outline" className="text-xs rounded-[9999px]">{b.scope}</Badge>
                    </div>
                    <p className="font-medium text-text-primary text-sm">{b.subject}</p>
                    <p className="text-xs text-text-secondary mt-1 truncate">{b.body}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-accent-green">✓ {b.sent_count}</p>
                    {b.failed_count > 0 && <p className="text-xs text-secondary">✗ {b.failed_count}</p>}
                    <p className="text-xs text-text-secondary mt-1">{formatDate(b.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} />
          </div>
        ) : (
          <div className="overflow-x-auto space-y-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-secondary">
                  <th className="py-3 pr-4 font-medium">ประเภท</th>
                  <th className="py-3 pr-4 font-medium">หัวข้อ</th>
                  <th className="py-3 pr-4 font-medium">กลุ่มเป้าหมาย</th>
                  <th className="py-3 pr-4 font-medium">ส่งสำเร็จ</th>
                  <th className="py-3 pr-4 font-medium">ล้มเหลว</th>
                  <th className="py-3 font-medium">วันที่</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((b) => (
                  <tr key={b.id} className="hover:bg-surface/50">
                    <td className="py-3 pr-4">
                      <Badge variant="outline" className={`text-xs rounded-[9999px] ${TYPE_COLORS[b.type]}`}>{TYPE_LABELS[b.type]}</Badge>
                    </td>
                    <td className="py-3 pr-4 font-medium text-text-primary max-w-[200px] truncate">{b.subject}</td>
                    <td className="py-3 pr-4"><Badge variant="outline" className="text-xs rounded-[9999px]">{b.scope}</Badge></td>
                    <td className="py-3 pr-4 text-accent-green font-medium">{b.sent_count}</td>
                    <td className="py-3 pr-4 text-secondary">{b.failed_count > 0 ? b.failed_count : "—"}</td>
                    <td className="py-3 text-xs text-text-secondary">{formatDate(b.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  )
}
