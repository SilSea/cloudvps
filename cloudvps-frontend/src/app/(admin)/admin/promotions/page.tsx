"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Plus, ToggleLeft, ToggleRight, Pencil, X, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ViewToggle, type ViewMode } from "@/components/packages/view-toggle"
import { usePagination } from "@/hooks/usePagination"
import { Pagination } from "@/components/shared/pagination"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import {
  useAdminPromotions, useCreatePromotion, useUpdatePromotion,
  useTogglePromotion,
} from "@/hooks/useAdmin"
import { formatDate } from "@/lib/utils"
import type { Promotion } from "@/types/promotion"
import type { UpdatePromotionInput } from "@/services/api/promotions"

const schema = z.object({
  code_name: z.string().min(1, "กรุณากรอกรหัส"),
  description: z.string().min(1, "กรุณากรอกคำอธิบาย"),
  type: z.enum(["DISCOUNT", "PERCENT"]),
  discount: z.number().positive("กรุณากรอกมูลค่า"),
  expired_at: z.string().nullable().optional(),
  max_uses: z.number().int().min(1).nullable().optional(),
  max_uses_per_user: z.number().int().min(1).nullable().optional(),
})
type FormData = z.infer<typeof schema>

function toFormData(p: Promotion): FormData {
  return {
    code_name: p.code_name,
    description: p.description ?? "",
    type: p.type as "DISCOUNT" | "PERCENT",
    discount: p.discount,
    expired_at: p.expired_at ?? null,
    max_uses: p.max_uses ?? null,
    max_uses_per_user: p.max_uses_per_user ?? null,
  }
}

export default function PromotionsPage() {
  const { data: promos = [], isLoading } = useAdminPromotions()
  const create = useCreatePromotion()
  const update = useUpdatePromotion()
  const toggle = useTogglePromotion()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [viewing, setViewing] = useState<Promotion | null>(null)
  const [pendingSave, setPendingSave] = useState<FormData | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("list")

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: "DISCOUNT" },
  })

  const openCreate = () => { setEditing(null); form.reset({ type: "DISCOUNT" }); setShowForm(true) }
  const openEdit = (p: Promotion) => { setEditing(p); form.reset(toFormData(p)); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditing(null); form.reset() }

  const onSubmit = async (d: FormData) => {
    if (editing) {
      setPendingSave(d)
    } else {
      await create.mutateAsync(d)
      closeForm()
    }
  }

  const executeSave = async () => {
    if (!editing || !pendingSave) return
    const rest: UpdatePromotionInput = {
      description: pendingSave.description,
      type: pendingSave.type,
      discount: pendingSave.discount,
      expired_at: pendingSave.expired_at,
      max_uses: pendingSave.max_uses,
      max_uses_per_user: pendingSave.max_uses_per_user,
    }
    await update.mutateAsync({ id: editing.id, data: rest })
    setPendingSave(null)
    closeForm()
  }

  const isPending = create.isPending || update.isPending
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<"ALL" | "active" | "inactive">("ALL")

  const filtered = promos.filter((p) => {
    const matchSearch = p.code_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === "ALL" || (filterStatus === "active" ? p.status : !p.status)
    return matchSearch && matchStatus
  })
  const { page, setPage, totalPages, paginated, total } = usePagination(filtered, 10, `${search}:${filterStatus}`)

  const PromoActions = ({ p }: { p: Promotion }) => (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewing(p)} title="ดูรายละเอียด">
        <Eye className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(p)} title="แก้ไข">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toggle.mutate(p.id)} disabled={toggle.isPending}>
        {p.status ? <ToggleRight className="h-4 w-4 text-accent-green" /> : <ToggleLeft className="h-4 w-4 text-text-secondary" />}
      </Button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-text-primary">โปรโมชั่น</h1>
        <div className="flex items-center gap-2">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <Button className="rounded-[9999px] gap-1" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> เพิ่ม
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="ค้นหารหัส/คำอธิบาย..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary w-48"
        />
        {(["ALL", "active", "inactive"] as const).map((s) => (
          <Button key={s} size="sm" variant={filterStatus === s ? "default" : "outline"}
            className="rounded-[9999px] h-7 px-3 text-xs"
            onClick={() => setFilterStatus(s)}>
            {s === "ALL" ? "ทั้งหมด" : s === "active" ? "Active" : "Inactive"}
          </Button>
        ))}
      </div>

      {showForm && (
        <div className="bg-surface border border-border rounded-[8px] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-text-primary">{editing ? `แก้ไข: ${editing.code_name}` : "สร้างโปรโมชั่น"}</h2>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={closeForm}><X className="h-4 w-4" /></Button>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="code_name" render={({ field }) => (
                  <FormItem><FormLabel>รหัส</FormLabel><FormControl><Input placeholder="PROMO2024" {...field} disabled={!!editing} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="type" render={({ field }) => (
                  <FormItem>
                    <FormLabel>ประเภท</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="DISCOUNT">ลดราคาคงที่ (฿)</SelectItem>
                        <SelectItem value="PERCENT">เปอร์เซ็นต์ (%)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem><FormLabel>คำอธิบาย</FormLabel><FormControl><Input placeholder="โปรโมชั่นลูกค้าใหม่" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="discount" render={({ field }) => (
                <FormItem><FormLabel>มูลค่า</FormLabel><FormControl><Input type="number" placeholder="0" {...field} onChange={(e) => field.onChange(e.target.valueAsNumber)} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="expired_at" render={({ field }) => (
                <FormItem><FormLabel>หมดอายุ</FormLabel><FormControl>
                  <Input type="datetime-local" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)} />
                </FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="max_uses" render={({ field }) => (
                  <FormItem>
                    <FormLabel>จำกัดการใช้ทั้งหมด</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="ไม่จำกัด" min={1}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="max_uses_per_user" render={({ field }) => (
                  <FormItem>
                    <FormLabel>จำกัดต่อคน</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="ไม่จำกัด" min={1}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="rounded-[9999px]" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editing ? "บันทึก" : "สร้าง"}
                </Button>
                <Button type="button" variant="outline" className="rounded-[9999px] bg-surface border-text-secondary/30 hover:bg-border" onClick={closeForm}>ยกเลิก</Button>
              </div>
            </form>
          </Form>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-14 rounded-[8px]" />)}</div>
      ) : viewMode === "list" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-3 pr-4 font-medium">รหัส</th>
                <th className="py-3 pr-4 font-medium">ประเภท/มูลค่า</th>
                <th className="py-3 pr-4 font-medium">ใช้แล้ว</th>
                <th className="py-3 pr-4 font-medium">หมดอายุ</th>
                <th className="py-3 pr-4 font-medium">สถานะ</th>
                <th className="py-3 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((p) => (
                <tr key={p.id} className="hover:bg-surface/50">
                  <td className="py-3 pr-4 font-mono font-medium text-text-primary">{p.code_name}</td>
                  <td className="py-3 pr-4 text-text-secondary">{p.type === "PERCENT" ? `${p.discount}%` : `฿${p.discount}`}</td>
                  <td className="py-3 pr-4 text-text-secondary">{p.used_count}{p.max_uses ? `/${p.max_uses}` : ""}</td>
                  <td className="py-3 pr-4 text-text-secondary text-xs">{p.expired_at ? formatDate(p.expired_at) : "ไม่จำกัด"}</td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline" className={`text-xs rounded-[9999px] ${p.status ? "text-accent-green border-accent-green/30" : "text-text-secondary"}`}>
                      {p.status ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="py-3"><PromoActions p={p} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {total === 0 && <p className="text-center py-10 text-text-secondary text-sm">ยังไม่มีโปรโมชั่น</p>}
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((p) => (
            <div key={p.id} className="bg-surface border border-border rounded-[8px] p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono font-medium text-text-primary">{p.code_name}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{p.description}</p>
                </div>
                <Badge variant="outline" className={`text-xs rounded-[9999px] shrink-0 ${p.status ? "text-accent-green border-accent-green/30" : "text-text-secondary"}`}>
                  {p.status ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary">
                <div><span className="text-text-primary font-medium">{p.type === "PERCENT" ? `${p.discount}%` : `฿${p.discount}`}</span> ส่วนลด</div>
                <div><span className="text-text-primary font-medium">{p.used_count}{p.max_uses ? `/${p.max_uses}` : ""}</span> ครั้ง</div>
                <div className="col-span-2">{p.expired_at ? `หมดอายุ: ${formatDate(p.expired_at)}` : "ไม่จำกัดอายุ"}</div>
              </div>
              <div className="pt-2 border-t border-border">
                <PromoActions p={p} />
              </div>
            </div>
          ))}
          {total === 0 && <p className="col-span-full text-center py-10 text-text-secondary text-sm">ยังไม่มีโปรโมชั่น</p>}
          <div className="col-span-full"><Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} /></div>
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-mono">{viewing?.code_name}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <InfoRow label="สถานะ">
                <Badge variant="outline" className={`text-xs rounded-[9999px] ${viewing.status ? "text-accent-green border-accent-green/30" : "text-text-secondary"}`}>
                  {viewing.status ? "Active" : "Inactive"}
                </Badge>
              </InfoRow>
              <InfoRow label="ประเภท/มูลค่า"><span className="font-medium">{viewing.type === "PERCENT" ? `${viewing.discount}%` : `฿${viewing.discount}`}</span></InfoRow>
              <InfoRow label="คำอธิบาย"><span className="text-text-secondary">{viewing.description || "—"}</span></InfoRow>
              <InfoRow label="ใช้ไปแล้ว"><span>{viewing.used_count}{viewing.max_uses ? ` / ${viewing.max_uses} ครั้ง` : " ครั้ง (ไม่จำกัด)"}</span></InfoRow>
              <InfoRow label="จำกัดต่อคน"><span>{viewing.max_uses_per_user ?? "ไม่จำกัด"}</span></InfoRow>
              <InfoRow label="หมดอายุ"><span className="text-text-secondary">{viewing.expired_at ? formatDate(viewing.expired_at) : "ไม่จำกัด"}</span></InfoRow>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingSave}
        title="บันทึกการเปลี่ยนแปลง"
        description={`ยืนยันการอัปเดตโปรโมชั่น "${editing?.code_name}"`}
        confirmLabel="บันทึก"
        variant="default"
        isPending={update.isPending}
        onConfirm={executeSave}
        onCancel={() => setPendingSave(null)}
      />

    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-text-secondary shrink-0 w-32">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  )
}
