"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Pencil } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useSupportUsers, useSupportToggleActive, useSupportUpdateUser } from "@/hooks/useSupport"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ThaiAddressFields } from "@/components/shared/thai-address-fields"
import { ViewToggle, type ViewMode } from "@/components/packages/view-toggle"
import { usePagination } from "@/hooks/usePagination"
import { Pagination } from "@/components/shared/pagination"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { AdminUserListItem } from "@/types/user"

const editSchema = z.object({
  first_name: z.string().min(1, "กรุณากรอกชื่อ"),
  last_name: z.string().min(1, "กรุณากรอกนามสกุล"),
  phone: z.string().regex(/^[0-9]{10}$/, "เบอร์โทร 10 หลัก").optional().or(z.literal("")),
  address1: z.string().optional(),
  address2: z.string().optional(),
  address3: z.string().optional(),
  address4: z.string().optional(),
  address5: z.string().regex(/^[0-9]{5}$/, "รหัสไปรษณีย์ 5 หลัก").optional().or(z.literal("")),
  address6: z.string().optional(),
})
type EditForm = z.infer<typeof editSchema>

export default function SupportUsersPage() {
  const { data: usersData, isLoading } = useSupportUsers()
  const users = usersData?.users ?? []
  const toggleActive = useSupportToggleActive()
  const updateUser = useSupportUpdateUser()
  const [search, setSearch] = useState("")
  const [editTarget, setEditTarget] = useState<AdminUserListItem | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("list")

  const form = useForm<EditForm>({ resolver: zodResolver(editSchema), defaultValues: {} })
  const [pendingSave, setPendingSave] = useState<EditForm | null>(null)

  const openEdit = (u: AdminUserListItem) => {
    setEditTarget(u)
    form.reset({})
  }

  const onEditSubmit = (d: EditForm) => setPendingSave(d)

  const executeSave = async () => {
    if (!editTarget || !pendingSave) return
    const clean = Object.fromEntries(
      Object.entries(pendingSave).filter(([, v]) => v !== undefined && v !== ""),
    ) as EditForm
    await updateUser.mutateAsync({ id: editTarget.id, data: clean })
    setEditTarget(null)
    setPendingSave(null)
  }

  const [filterActive, setFilterActive] = useState<"ALL" | "active" | "inactive">("ALL")

  const filtered = users.filter((u) => {
    const matchSearch = u.email.toLowerCase().includes(search.toLowerCase())
    const matchActive = filterActive === "ALL" || (filterActive === "active" ? u.status : !u.status)
    return matchSearch && matchActive
  })
  const { page, setPage, totalPages, paginated, total } = usePagination(filtered, 10, `${search}:${filterActive}`)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-text-primary">จัดการผู้ใช้</h1>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="ค้นหาอีเมล..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary w-48"
        />
        {(["ALL", "active", "inactive"] as const).map((a) => (
          <Button key={a} size="sm" variant={filterActive === a ? "default" : "outline"}
            className="rounded-[9999px] h-7 px-3 text-xs"
            onClick={() => setFilterActive(a)}>
            {a === "ALL" ? "ทุกสถานะ" : a === "active" ? "เปิดใช้งาน" : "ปิดใช้งาน"}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-14 rounded-[8px]" />)}</div>
      ) : viewMode === "list" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-3 pr-4 font-medium">อีเมล</th>
                <th className="py-3 pr-4 font-medium">บทบาท</th>
                <th className="py-3 pr-4 font-medium">เปิดใช้งาน</th>
                <th className="py-3 pr-4 font-medium">ยืนยันอีเมล</th>
                <th className="py-3 pr-4 font-medium">สมัคร</th>
                <th className="py-3 font-medium">แก้ไข</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((u) => (
                <tr key={u.id} className="hover:bg-surface/50">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-text-primary">{u.email}</p>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline" className="text-xs rounded-[9999px]">{u.role.role_name}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <Switch checked={u.status} onCheckedChange={() => toggleActive.mutate(u.id)} disabled={toggleActive.isPending} />
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline" className={cn("text-xs rounded-[9999px]", u.is_verify ? "text-accent-green border-accent-green/30" : "text-text-secondary")}>
                      {u.is_verify ? "ยืนยันแล้ว" : "รอยืนยัน"}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-text-secondary text-xs">{formatDate(u.created_at)}</td>
                  <td className="py-3">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(u)} title="แก้ไขข้อมูล">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total === 0 && <p className="text-center py-10 text-text-secondary text-sm">ไม่พบผู้ใช้</p>}
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((u) => (
            <div key={u.id} className="bg-surface border border-border rounded-[8px] p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-text-primary text-sm truncate">{u.email}</p>
                  <Badge variant="outline" className="text-xs rounded-[9999px] mt-1">{u.role.role_name}</Badge>
                </div>
                <Badge variant="outline" className={cn("text-xs rounded-[9999px] shrink-0", u.is_verify ? "text-accent-green border-accent-green/30" : "text-text-secondary")}>
                  {u.is_verify ? "ยืนยัน" : "รอยืนยัน"}
                </Badge>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Switch checked={u.status} onCheckedChange={() => toggleActive.mutate(u.id)} disabled={toggleActive.isPending} />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary">{formatDate(u.created_at)}</span>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(u)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {total === 0 && <p className="col-span-full text-center py-10 text-text-secondary text-sm">ไม่พบผู้ใช้</p>}
          <div className="col-span-full"><Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} /></div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingSave}
        title="บันทึกการเปลี่ยนแปลง"
        description={`ยืนยันการอัปเดตข้อมูลของ ${editTarget?.email}`}
        confirmLabel="บันทึก"
        variant="default"
        isPending={updateUser.isPending}
        onConfirm={executeSave}
        onCancel={() => setPendingSave(null)}
      />

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูล: {editTarget?.email}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onEditSubmit)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="first_name" render={({ field }) => (
                  <FormItem><FormLabel>ชื่อ</FormLabel><FormControl><Input placeholder="ชื่อ" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="last_name" render={({ field }) => (
                  <FormItem><FormLabel>นามสกุล</FormLabel><FormControl><Input placeholder="นามสกุล" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>เบอร์โทร</FormLabel><FormControl><Input placeholder="0812345678" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="address1" render={({ field }) => (
                  <FormItem><FormLabel>ที่อยู่บรรทัด 1</FormLabel><FormControl><Input placeholder="123/4 หมู่บ้าน..." {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="address2" render={({ field }) => (
                  <FormItem><FormLabel>บรรทัด 2</FormLabel><FormControl><Input placeholder="ซอย..." {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <ThaiAddressFields
                control={form.control as unknown as Parameters<typeof ThaiAddressFields>[0]["control"]}
                setValue={form.setValue as unknown as Parameters<typeof ThaiAddressFields>[0]["setValue"]}
              />
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" className="rounded-[9999px] bg-surface border-text-secondary/30 hover:bg-border" onClick={() => setEditTarget(null)}>ยกเลิก</Button>
                <Button type="submit" className="rounded-[9999px]" disabled={updateUser.isPending}>
                  {updateUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  บันทึก
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
