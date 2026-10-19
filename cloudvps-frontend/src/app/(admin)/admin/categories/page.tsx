"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Tag, Plus, Pencil, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Pagination } from "@/components/shared/pagination"
import { usePagination } from "@/hooks/usePagination"
import { useAdminCategories, useCreateCategory, useUpdateCategory, useToggleCategoryStatus } from "@/hooks/useAdmin"
import type { PackageCategory } from "@/types/package"

const schema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อหมวดหมู่"),
  description: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export default function AdminCategoriesPage() {
  const { data: categories = [], isLoading } = useAdminCategories()
  const createCat = useCreateCategory()
  const updateCat = useUpdateCategory()
  const toggleCat = useToggleCategoryStatus()

  const [search, setSearch] = useState("")
  const [editTarget, setEditTarget] = useState<PackageCategory | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )
  const { page, setPage, totalPages, paginated, total } = usePagination(filtered, 10, search)

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" },
  })

  const openCreate = () => {
    form.reset({ name: "", description: "" })
    setCreateOpen(true)
  }

  const openEdit = (cat: PackageCategory) => {
    setEditTarget(cat)
    form.reset({ name: cat.name, description: cat.description ?? "" })
  }

  const onSubmit = async (d: FormData) => {
    const payload = { name: d.name, ...(d.description ? { description: d.description } : {}) }
    if (editTarget) {
      await updateCat.mutateAsync({ id: editTarget.id, data: payload })
      setEditTarget(null)
    } else {
      await createCat.mutateAsync(payload)
      setCreateOpen(false)
    }
    form.reset()
  }

  const isPending = createCat.isPending || updateCat.isPending

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="h-6 w-6 text-primary" />
          <h1 className="text-[28px] font-bold text-text-primary">หมวดหมู่แพ็กเกจ</h1>
        </div>
        <Button size="sm" className="rounded-[9999px] gap-1" onClick={openCreate}>
          <Plus className="h-4 w-4" /> เพิ่มหมวดหมู่
        </Button>
      </div>

      <input
        type="search"
        placeholder="ค้นหาหมวดหมู่..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary w-60"
      />

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-[8px]" />)}</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-secondary">
                  <th className="py-3 pr-4 font-medium w-8">ID</th>
                  <th className="py-3 pr-4 font-medium">ชื่อ</th>
                  <th className="py-3 pr-4 font-medium">คำอธิบาย</th>
                  <th className="py-3 pr-4 font-medium">สถานะ</th>
                  <th className="py-3 font-medium">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map((cat) => (
                  <tr key={cat.id} className="hover:bg-surface/50">
                    <td className="py-3 pr-4 text-text-secondary">{cat.id}</td>
                    <td className="py-3 pr-4 font-medium text-text-primary">{cat.name}</td>
                    <td className="py-3 pr-4 text-text-secondary text-xs max-w-[240px] truncate">
                      {cat.description || <span className="text-border">—</span>}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={cat.status}
                          onCheckedChange={() => toggleCat.mutate(cat.id)}
                          disabled={toggleCat.isPending}
                        />
                        <Badge
                          variant="outline"
                          className={`text-xs rounded-[9999px] ${cat.status ? "text-accent-green border-accent-green/30" : "text-text-secondary"}`}
                        >
                          {cat.status ? "เปิด" : "ปิด"}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-3">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(cat)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {total === 0 && (
              <p className="text-center py-10 text-text-secondary text-sm">ยังไม่มีหมวดหมู่</p>
            )}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} />
        </>
      )}

      {/* Create / Edit dialog */}
      <Dialog
        open={createOpen || !!editTarget}
        onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditTarget(null); form.reset() } }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? `แก้ไข: ${editTarget.name}` : "เพิ่มหมวดหมู่ใหม่"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>ชื่อหมวดหมู่</FormLabel>
                  <FormControl><Input placeholder="เช่น VPS Gaming" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>คำอธิบาย <span className="text-text-secondary font-normal text-xs">(ไม่บังคับ)</span></FormLabel>
                  <FormControl><Input placeholder="คำอธิบายหมวดหมู่" {...field} value={field.value ?? ""} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-[9999px] bg-surface border-text-secondary/30 hover:bg-border"
                  onClick={() => { setCreateOpen(false); setEditTarget(null); form.reset() }}
                >
                  ยกเลิก
                </Button>
                <Button type="submit" className="rounded-[9999px]" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editTarget ? "บันทึก" : "สร้าง"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
