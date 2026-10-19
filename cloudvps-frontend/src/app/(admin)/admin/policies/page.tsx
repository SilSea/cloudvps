"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, ToggleLeft, ToggleRight, Plus, Eye, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ViewToggle, type ViewMode } from "@/components/packages/view-toggle"
import { usePagination } from "@/hooks/usePagination"
import { Pagination } from "@/components/shared/pagination"
import { useAdminPolicies, useCreatePolicy, useActivatePolicy, useUpdatePolicy } from "@/hooks/useAdmin"
import { formatDate } from "@/lib/utils"
import type { Policy } from "@/types/policy"

const schema = z.object({
  policie_title: z.string().min(1, "กรุณากรอกชื่อ"),
  policies_type: z.enum(["PDPA", "TERMSERVICE"]),
  version: z.string().min(1, "กรุณากรอก version"),
  policies_detail: z.string().min(1, "กรุณากรอกเนื้อหา"),
})
type FormData = z.infer<typeof schema>

const editSchema = z.object({
  policie_title: z.string().min(1).optional(),
  policies_detail: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
})
type EditFormData = z.infer<typeof editSchema>

export default function PoliciesPage() {
  const { data: policies = [], isLoading } = useAdminPolicies()
  const create = useCreatePolicy()
  const activate = useActivatePolicy()
  const updatePolicy = useUpdatePolicy()
  const [showForm, setShowForm] = useState(false)
  const [viewing, setViewing] = useState<Policy | null>(null)
  const [editing, setEditing] = useState<Policy | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [search, setSearch] = useState("")
  const [filterType, setFilterType] = useState<"ALL" | "PDPA" | "TERMSERVICE">("ALL")

  const editForm = useForm<EditFormData>({ resolver: zodResolver(editSchema) })

  const filtered = policies.filter((p) => {
    const matchSearch = p.policie_title.toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === "ALL" || p.policies_type === filterType
    return matchSearch && matchType
  })
  const { page, setPage, totalPages, paginated, total } = usePagination(filtered, 10, `${search}:${filterType}`)

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { policies_type: "TERMSERVICE" },
  })

  const onSubmit = async (d: FormData) => {
    await create.mutateAsync(d)
    form.reset()
    setShowForm(false)
  }

  const openEdit = (p: Policy) => {
    setEditing(p)
    editForm.reset({ policie_title: p.policie_title, policies_detail: p.policies_detail, version: p.version })
  }

  const onEdit = async (d: EditFormData) => {
    if (!editing) return
    await updatePolicy.mutateAsync({ id: editing.id, data: d })
    setEditing(null)
  }

  const PolicyToggle = ({ p }: { p: Policy }) => (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewing(p)} title="ดูเนื้อหา">
        <Eye className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(p)} title="แก้ไข">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
        onClick={() => activate.mutate(p.id)} disabled={activate.isPending}
        title={p.status ? "ปิดใช้งาน" : "เปิดใช้งาน"}>
        {p.status ? <ToggleRight className="h-5 w-5 text-accent-green" /> : <ToggleLeft className="h-5 w-5 text-text-secondary" />}
      </Button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-text-primary">นโยบาย</h1>
        <div className="flex items-center gap-2">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <Button className="rounded-[9999px] gap-1" size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4" /> เพิ่ม
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="ค้นหาชื่อ Policy..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary w-48"
        />
        {(["ALL", "TERMSERVICE", "PDPA"] as const).map((t) => (
          <Button key={t} size="sm" variant={filterType === t ? "default" : "outline"}
            className="rounded-[9999px] h-7 px-3 text-xs"
            onClick={() => setFilterType(t)}>
            {t === "ALL" ? "ทั้งหมด" : t}
          </Button>
        ))}
      </div>

      {showForm && (
        <div className="bg-surface border border-border rounded-[8px] p-5 space-y-4">
          <h2 className="font-medium text-text-primary">สร้าง Policy ใหม่</h2>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="policie_title" render={({ field }) => (
                <FormItem><FormLabel>ชื่อ Policy</FormLabel><FormControl><Input placeholder="นโยบายความเป็นส่วนตัว" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="policies_type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ประเภท</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="TERMSERVICE">Terms of Service</SelectItem>
                        <SelectItem value="PDPA">PDPA</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="version" render={({ field }) => (
                  <FormItem><FormLabel>Version</FormLabel><FormControl><Input placeholder="1.0.0" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="policies_detail" render={({ field }) => (
                <FormItem><FormLabel>เนื้อหา</FormLabel><FormControl><Textarea rows={6} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex gap-2">
                <Button type="submit" className="rounded-[9999px]" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}สร้าง
                </Button>
                <Button type="button" variant="outline" className="rounded-[9999px]" onClick={() => setShowForm(false)}>ยกเลิก</Button>
              </div>
            </form>
          </Form>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 rounded-[8px]" />)}</div>
      ) : viewMode === "grid" ? (
        <div className="space-y-2">
          {paginated.map((p) => (
            <div key={p.id} className="bg-surface border border-border rounded-[8px] p-4 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-text-primary">{p.policie_title}</span>
                  <Badge variant="outline" className="text-xs rounded-[9999px]">{p.policies_type}</Badge>
                  <Badge variant="outline" className="text-xs rounded-[9999px]">v{p.version}</Badge>
                  <Badge variant="outline" className={`text-xs rounded-[9999px] ${p.status ? "text-accent-green border-accent-green/30" : "text-text-secondary"}`}>
                    {p.status ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="text-xs text-text-secondary">{formatDate(p.created_at)}</p>
              </div>
              <div className="shrink-0"><PolicyToggle p={p} /></div>
            </div>
          ))}
          {total === 0 && <p className="text-center py-10 text-text-secondary text-sm">ยังไม่มี Policy</p>}
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-3 pr-4 font-medium">ชื่อ Policy</th>
                <th className="py-3 pr-4 font-medium">ประเภท</th>
                <th className="py-3 pr-4 font-medium">Version</th>
                <th className="py-3 pr-4 font-medium">สถานะ</th>
                <th className="py-3 pr-4 font-medium">วันที่</th>
                <th className="py-3 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((p) => (
                <tr key={p.id} className="hover:bg-surface/50">
                  <td className="py-3 pr-4 font-medium text-text-primary">{p.policie_title}</td>
                  <td className="py-3 pr-4"><Badge variant="outline" className="text-xs rounded-[9999px]">{p.policies_type}</Badge></td>
                  <td className="py-3 pr-4"><Badge variant="outline" className="text-xs rounded-[9999px]">v{p.version}</Badge></td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline" className={`text-xs rounded-[9999px] ${p.status ? "text-accent-green border-accent-green/30" : "text-text-secondary"}`}>
                      {p.status ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-xs text-text-secondary">{formatDate(p.created_at)}</td>
                  <td className="py-3"><PolicyToggle p={p} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {total === 0 && <p className="text-center py-10 text-text-secondary text-sm">ยังไม่มี Policy</p>}
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} />
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>แก้ไข: {editing?.policie_title}</DialogTitle></DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
              <FormField control={editForm.control} name="policie_title" render={({ field }) => (
                <FormItem><FormLabel>ชื่อ Policy</FormLabel><FormControl><Input placeholder="นโยบายความเป็นส่วนตัว" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editForm.control} name="version" render={({ field }) => (
                <FormItem><FormLabel>Version</FormLabel><FormControl><Input placeholder="1.0.0" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editForm.control} name="policies_detail" render={({ field }) => (
                <FormItem><FormLabel>เนื้อหา</FormLabel><FormControl><Textarea rows={8} placeholder="เนื้อหา Policy..." {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" className="rounded-[9999px] bg-surface border-text-secondary/30 hover:bg-border" onClick={() => setEditing(null)}>ยกเลิก</Button>
                <Button type="submit" className="rounded-[9999px]" disabled={updatePolicy.isPending}>
                  {updatePolicy.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}บันทึก
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader><DialogTitle>{viewing?.policie_title}</DialogTitle></DialogHeader>
          {viewing && (
            <>
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <Badge variant="outline" className="text-xs rounded-[9999px]">{viewing.policies_type}</Badge>
                <Badge variant="outline" className="text-xs rounded-[9999px]">v{viewing.version}</Badge>
                <Badge variant="outline" className={`text-xs rounded-[9999px] ${viewing.status ? "text-accent-green border-accent-green/30" : "text-text-secondary"}`}>
                  {viewing.status ? "Active" : "Inactive"}
                </Badge>
                <span className="text-xs text-text-secondary ml-auto">{formatDate(viewing.created_at)}</span>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed pr-4">{viewing.policies_detail}</p>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
