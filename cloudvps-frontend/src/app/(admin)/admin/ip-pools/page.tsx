"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Plus, Pencil, ToggleLeft, ToggleRight, Network, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  useAdminIpPools,
  useCreateIpPool,
  useCreateIpRange,
  useUpdateIpPool,
  useToggleIpPool,
} from "@/hooks/useAdmin"
import { ViewToggle, type ViewMode } from "@/components/packages/view-toggle"
import { usePagination } from "@/hooks/usePagination"
import { Pagination } from "@/components/shared/pagination"
import type { IpPool } from "@/services/api/ip-pools"
import type { IpType } from "@/services/api/ip-pools"

// ── Schemas ──
const singleSchema = z.object({
  ip: z.string().min(7, "กรุณากรอก IP"),
  type: z.enum(["PUBLIC", "PRIVATE"]),
})
type SingleFormData = z.infer<typeof singleSchema>

const rangeSchema = z.object({
  ip_start: z.string().min(7, "กรุณากรอก IP เริ่มต้น"),
  ip_end: z.string().min(7, "กรุณากรอก IP สิ้นสุด"),
  type: z.enum(["PUBLIC", "PRIVATE"]),
})
type RangeFormData = z.infer<typeof rangeSchema>

const editSchema = z.object({
  ip: z.string().min(7, "กรุณากรอก IP"),
  type: z.enum(["PUBLIC", "PRIVATE"]),
})
type EditFormData = z.infer<typeof editSchema>

// ─────────────────────────────────────────────────
// Add IP Panel (single / range tabs)
// ─────────────────────────────────────────────────
function AddPanel({ onClose }: { onClose: () => void }) {
  const createSingle = useCreateIpPool()
  const createRange = useCreateIpRange()

  const singleForm = useForm<SingleFormData>({
    resolver: zodResolver(singleSchema),
    defaultValues: { type: "PUBLIC" },
  })
  const rangeForm = useForm<RangeFormData>({
    resolver: zodResolver(rangeSchema),
    defaultValues: { type: "PUBLIC" },
  })

  const onSingle = async (d: SingleFormData) => {
    await createSingle.mutateAsync(d)
    singleForm.reset()
    onClose()
  }

  const onRange = async (d: RangeFormData) => {
    await createRange.mutateAsync(d)
    rangeForm.reset()
    onClose()
  }

  return (
    <div className="bg-surface border border-border rounded-[8px] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-text-primary">เพิ่ม IP</h2>
        <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={onClose}>ปิด</Button>
      </div>

      <Tabs defaultValue="single">
        <TabsList className="mb-4">
          <TabsTrigger value="single" className="gap-1"><Network className="h-3.5 w-3.5" /> IP เดี่ยว</TabsTrigger>
          <TabsTrigger value="range" className="gap-1"><List className="h-3.5 w-3.5" /> ช่วง IP</TabsTrigger>
        </TabsList>

        <TabsContent value="single">
          <Form {...singleForm}>
            <form onSubmit={singleForm.handleSubmit(onSingle)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={singleForm.control} name="ip" render={({ field }) => (
                  <FormItem>
                    <FormLabel>IP Address</FormLabel>
                    <FormControl><Input placeholder="203.150.1.100" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={singleForm.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ประเภท</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="PUBLIC">PUBLIC</SelectItem>
                        <SelectItem value="PRIVATE">PRIVATE</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <Button type="submit" className="rounded-[9999px]" disabled={createSingle.isPending}>
                {createSingle.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                เพิ่ม IP
              </Button>
            </form>
          </Form>
        </TabsContent>

        <TabsContent value="range">
          <Form {...rangeForm}>
            <form onSubmit={rangeForm.handleSubmit(onRange)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={rangeForm.control} name="ip_start" render={({ field }) => (
                  <FormItem>
                    <FormLabel>IP เริ่มต้น</FormLabel>
                    <FormControl><Input placeholder="203.150.1.100" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={rangeForm.control} name="ip_end" render={({ field }) => (
                  <FormItem>
                    <FormLabel>IP สิ้นสุด</FormLabel>
                    <FormControl><Input placeholder="203.150.1.150" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={rangeForm.control} name="type" render={({ field }) => (
                <FormItem>
                  <FormLabel>ประเภท</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="PUBLIC">PUBLIC</SelectItem>
                      <SelectItem value="PRIVATE">PRIVATE</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="rounded-[9999px]" disabled={createRange.isPending}>
                {createRange.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                เพิ่มทั้งช่วง
              </Button>
            </form>
          </Form>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─────────────────────────────────────────────────
// Edit Dialog
// ─────────────────────────────────────────────────
function EditDialog({ pool, onClose }: { pool: IpPool; onClose: () => void }) {
  const updateIp = useUpdateIpPool()

  const form = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: { ip: pool.ip, type: pool.type as IpType },
  })

  const onSubmit = async (d: EditFormData) => {
    await updateIp.mutateAsync({ id: pool.id, data: d })
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>แก้ไข IP #{pool.id}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="ip" render={({ field }) => (
              <FormItem>
                <FormLabel>IP Address</FormLabel>
                <FormControl><Input placeholder="203.150.1.100" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="type" render={({ field }) => (
              <FormItem>
                <FormLabel>ประเภท</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="PUBLIC">PUBLIC</SelectItem>
                    <SelectItem value="PRIVATE">PRIVATE</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex gap-2 pt-1">
              <Button type="submit" className="rounded-[9999px]" disabled={updateIp.isPending}>
                {updateIp.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                บันทึก
              </Button>
              <Button type="button" variant="outline" className="rounded-[9999px]" onClick={onClose}>
                ยกเลิก
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ─────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────
export default function IpPoolsPage() {
  const { data, isLoading } = useAdminIpPools()
  const toggleIp = useToggleIpPool()
  const [showAdd, setShowAdd] = useState(false)
  const [editingPool, setEditingPool] = useState<IpPool | null>(null)
  const [filterType, setFilterType] = useState<"ALL" | "PUBLIC" | "PRIVATE">("ALL")
  const [viewMode, setViewMode] = useState<ViewMode>("list")

  const [search, setSearch] = useState("")
  const pools = data?.pools ?? []
  const filtered = pools.filter((p) => {
    const matchType = filterType === "ALL" || p.type === filterType
    const matchSearch = !search || p.ip.includes(search)
    return matchType && matchSearch
  })
  const { page, setPage, totalPages, paginated, total } = usePagination(filtered, 20, `${filterType}:${search}`)

  const stats = {
    total: pools.length,
    available: pools.filter((p) => p.status && p.ip_assignments.length === 0).length,
    inUse: pools.filter((p) => p.ip_assignments.length > 0).length,
    disabled: pools.filter((p) => !p.status).length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-text-primary">IP Pool</h1>
        <div className="flex items-center gap-2">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <Button size="sm" className="rounded-[9999px] gap-1" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="h-4 w-4" /> เพิ่ม IP
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "ทั้งหมด", value: stats.total, color: "text-text-primary" },
          { label: "ว่าง", value: stats.available, color: "text-accent-green" },
          { label: "ใช้งาน", value: stats.inUse, color: "text-primary" },
          { label: "ปิดใช้งาน", value: stats.disabled, color: "text-text-secondary" },
        ].map((s) => (
          <div key={s.label} className="bg-surface border border-border rounded-[8px] p-4 text-center">
            <p className={`text-[22px] font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-text-secondary mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {showAdd && <AddPanel onClose={() => setShowAdd(false)} />}

      {/* Search + Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="ค้นหา IP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary w-44"
        />
        <span className="text-sm text-text-secondary">ประเภท:</span>
        {(["ALL", "PUBLIC", "PRIVATE"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={filterType === t ? "default" : "outline"}
            className="rounded-[9999px] h-7 px-3 text-xs"
            onClick={() => setFilterType(t)}
          >
            {t}
          </Button>
        ))}
      </div>

      {/* Table / Grid */}
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-[8px]" />)}</div>
      ) : viewMode === "list" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-3 pr-4 font-medium">ID</th>
                <th className="py-3 pr-4 font-medium">IP Address</th>
                <th className="py-3 pr-4 font-medium">ประเภท</th>
                <th className="py-3 pr-4 font-medium">สถานะ IP</th>
                <th className="py-3 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((pool) => {
                const inUse = pool.ip_assignments.length > 0
                return (
                  <tr key={pool.id} className="hover:bg-surface/50">
                    <td className="py-2.5 pr-4 text-text-secondary">{pool.id}</td>
                    <td className="py-2.5 pr-4 font-mono font-medium text-text-primary">{pool.ip}</td>
                    <td className="py-2.5 pr-4">
                      <Badge variant="outline" className={`text-xs rounded-[9999px] ${pool.type === "PUBLIC" ? "text-primary border-primary/30" : "text-text-secondary"}`}>
                        {pool.type}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4">
                      {inUse ? (
                        <Badge variant="outline" className="text-xs rounded-[9999px] text-secondary border-secondary/30">ใช้งานอยู่</Badge>
                      ) : pool.status ? (
                        <Badge variant="outline" className="text-xs rounded-[9999px] text-accent-green border-accent-green/30">ว่าง</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs rounded-[9999px] text-text-secondary">ปิดใช้งาน</Badge>
                      )}
                    </td>
                    <td className="py-2.5">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingPool(pool)}
                          disabled={inUse} title={inUse ? "ไม่สามารถแก้ไข IP ที่ใช้งานอยู่" : "แก้ไข"}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => toggleIp.mutate(pool.id)} disabled={toggleIp.isPending || inUse}
                          title={pool.status ? "ปิดใช้งาน" : "เปิดใช้งาน"}>
                          {pool.status ? <ToggleRight className="h-5 w-5 text-accent-green" /> : <ToggleLeft className="h-5 w-5 text-text-secondary" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {total === 0 && (
            <p className="text-center py-10 text-text-secondary text-sm">
              {pools.length === 0 ? "ยังไม่มี IP ในระบบ" : "ไม่พบ IP ตามที่กรอง"}
            </p>
          )}
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={20} onPageChange={setPage} />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {paginated.map((pool) => {
            const inUse = pool.ip_assignments.length > 0
            return (
              <div key={pool.id} className="bg-surface border border-border rounded-[8px] p-3 space-y-2">
                <div className="flex items-center justify-between gap-1">
                  <Badge variant="outline" className={`text-xs rounded-[9999px] ${pool.type === "PUBLIC" ? "text-primary border-primary/30" : "text-text-secondary"}`}>
                    {pool.type}
                  </Badge>
                  {inUse ? (
                    <Badge variant="outline" className="text-xs rounded-[9999px] text-secondary border-secondary/30">ใช้งาน</Badge>
                  ) : pool.status ? (
                    <Badge variant="outline" className="text-xs rounded-[9999px] text-accent-green border-accent-green/30">ว่าง</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs rounded-[9999px] text-text-secondary">ปิด</Badge>
                  )}
                </div>
                <p className="font-mono text-sm font-medium text-text-primary">{pool.ip}</p>
                <div className="flex gap-1 pt-1 border-t border-border">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingPool(pool)}
                    disabled={inUse} title="แก้ไข">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                    onClick={() => toggleIp.mutate(pool.id)} disabled={toggleIp.isPending || inUse}>
                    {pool.status ? <ToggleRight className="h-4 w-4 text-accent-green" /> : <ToggleLeft className="h-4 w-4 text-text-secondary" />}
                  </Button>
                </div>
              </div>
            )
          })}
          {total === 0 && (
            <p className="col-span-full text-center py-10 text-text-secondary text-sm">
              {pools.length === 0 ? "ยังไม่มี IP ในระบบ" : "ไม่พบ IP ตามที่กรอง"}
            </p>
          )}
          <div className="col-span-full"><Pagination page={page} totalPages={totalPages} total={total} pageSize={20} onPageChange={setPage} /></div>
        </div>
      )}

      {editingPool && <EditDialog pool={editingPool} onClose={() => setEditingPool(null)} />}
    </div>
  )
}
