"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Pencil, UserPlus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { ViewToggle, type ViewMode } from "@/components/packages/view-toggle"
import { usePagination } from "@/hooks/usePagination"
import { Pagination } from "@/components/shared/pagination"
import { useAdminUsers, useToggleUserActive, useChangeUserRole, useUpdateUser, useAdminCreateUser } from "@/hooks/useAdmin"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ThaiAddressFields } from "@/components/shared/thai-address-fields"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { AdminUserListItem } from "@/types/user"

const ROLE_TO_BACKEND: Record<string, string> = {
  USER: "users",
  SUPPORT: "support",
  ADMIN: "admin",
}

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

const createSchema = z.object({
  email: z.string().email("อีเมลไม่ถูกต้อง"),
  password: z.string().min(8, "รหัสผ่านอย่างน้อย 8 ตัวอักษร").optional().or(z.literal("")),
  first_name: z.string().min(1, "กรุณากรอกชื่อ"),
  last_name: z.string().min(1, "กรุณากรอกนามสกุล"),
  phone: z.string().regex(/^[0-9]{10}$/, "เบอร์โทร 10 หลัก"),
  address1: z.string().min(1, "กรุณากรอกที่อยู่"),
  address2: z.string().optional(),
  address3: z.string().min(1, "กรุณาเลือกตำบล/แขวง"),
  address4: z.string().min(1, "กรุณาเลือกอำเภอ/เขต"),
  address5: z.string().regex(/^[0-9]{5}$/, "รหัสไปรษณีย์ 5 หลัก"),
  address6: z.string().min(1, "กรุณาเลือกจังหวัด"),
})
type CreateForm = z.infer<typeof createSchema>

export default function AdminUsersPage() {
  const { data: usersData, isLoading } = useAdminUsers()
  const users = usersData?.users ?? []
  const toggleActive = useToggleUserActive()
  const changeRole = useChangeUserRole()
  const updateUser = useUpdateUser()
  const createUser = useAdminCreateUser()

  const [search, setSearch] = useState("")
  const [editTarget, setEditTarget] = useState<AdminUserListItem | null>(null)
  const [pendingSave, setPendingSave] = useState<EditForm | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("list")

  // Edit form
  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema), defaultValues: {} })

  const openEdit = (u: AdminUserListItem) => {
    setEditTarget(u)
    editForm.reset({})
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

  // Create form
  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      email: "", password: "", first_name: "", last_name: "", phone: "",
      address1: "", address2: "", address3: "", address4: "", address5: "", address6: "",
    },
  })

  const onCreateSubmit = async (d: CreateForm) => {
    const payload = { ...d, password: d.password || undefined }
    await createUser.mutateAsync(payload)
    setCreateOpen(false)
    createForm.reset()
  }

  const [filterRole, setFilterRole] = useState<"ALL" | "USER" | "SUPPORT" | "ADMIN">("ALL")
  const [filterActive, setFilterActive] = useState<"ALL" | "active" | "inactive">("ALL")

  const filtered = users.filter((u) => {
    const matchSearch = u.email.toLowerCase().includes(search.toLowerCase())
    const role = u.role.role_name.toUpperCase()
    const matchRole = filterRole === "ALL" || role === filterRole
    const matchActive = filterActive === "ALL" || (filterActive === "active" ? u.status : !u.status)
    return matchSearch && matchRole && matchActive
  })
  const { page, setPage, totalPages, paginated, total } = usePagination(filtered, 10, `${search}:${filterRole}:${filterActive}`)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-text-primary">ผู้ใช้งาน</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" className="rounded-[9999px] gap-1.5" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" />
            เพิ่มผู้ใช้
          </Button>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="ค้นหาอีเมล..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary w-48"
        />
        <div className="flex gap-1">
          {(["ALL", "USER", "SUPPORT", "ADMIN"] as const).map((r) => (
            <Button key={r} size="sm" variant={filterRole === r ? "default" : "outline"}
              className="rounded-[9999px] h-7 px-3 text-xs"
              onClick={() => setFilterRole(r)}>
              {r === "ALL" ? "ทุกบทบาท" : r}
            </Button>
          ))}
        </div>
        <div className="flex gap-1">
          {(["ALL", "active", "inactive"] as const).map((a) => (
            <Button key={a} size="sm" variant={filterActive === a ? "default" : "outline"}
              className="rounded-[9999px] h-7 px-3 text-xs"
              onClick={() => setFilterActive(a)}>
              {a === "ALL" ? "ทุกสถานะ" : a === "active" ? "เปิดใช้งาน" : "ปิดใช้งาน"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-14 rounded-[8px]" />)}</div>
      ) : viewMode === "list" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-3 pr-4 font-medium">อีเมล</th>
                <th className="py-3 pr-4 font-medium">บทบาท</th>
                <th className="py-3 pr-4 font-medium">สถานะ</th>
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
                    <Select
                      value={u.role.role_name}
                      onValueChange={(v) => changeRole.mutate({ id: u.id, role: ROLE_TO_BACKEND[v] ?? v })}
                    >
                      <SelectTrigger className="h-8 w-28 text-xs rounded-[9999px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="users">USER</SelectItem>
                        <SelectItem value="support">SUPPORT</SelectItem>
                        <SelectItem value="admin">ADMIN</SelectItem>
                      </SelectContent>
                    </Select>
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
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(u)}>
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
                <p className="text-sm font-medium text-text-primary break-all">{u.email}</p>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => openEdit(u)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs rounded-[9999px]">{u.role.role_name}</Badge>
                <Badge variant="outline" className={cn("text-xs rounded-[9999px]", u.is_verify ? "text-accent-green border-accent-green/30" : "text-text-secondary")}>
                  {u.is_verify ? "ยืนยันแล้ว" : "รอยืนยัน"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">เปิดใช้งาน</span>
                <Switch checked={u.status} onCheckedChange={() => toggleActive.mutate(u.id)} disabled={toggleActive.isPending} />
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border">
                <span className="text-xs text-text-secondary">{formatDate(u.created_at)}</span>
                <Select value={u.role.role_name} onValueChange={(v) => changeRole.mutate({ id: u.id, role: ROLE_TO_BACKEND[v] ?? v })}>
                  <SelectTrigger className="h-7 w-24 text-xs rounded-[9999px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="users">USER</SelectItem>
                    <SelectItem value="support">SUPPORT</SelectItem>
                    <SelectItem value="admin">ADMIN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
          {total === 0 && <p className="col-span-full text-center py-10 text-text-secondary text-sm">ไม่พบผู้ใช้</p>}
          <div className="col-span-full"><Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} /></div>
        </div>
      )}

      {/* Edit confirm */}
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

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>แก้ไขข้อมูล: {editTarget?.email}</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={editForm.control} name="first_name" render={({ field }) => (
                  <FormItem><FormLabel>ชื่อ</FormLabel><FormControl><Input placeholder="ชื่อ" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="last_name" render={({ field }) => (
                  <FormItem><FormLabel>นามสกุล</FormLabel><FormControl><Input placeholder="นามสกุล" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={editForm.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>เบอร์โทร</FormLabel><FormControl><Input placeholder="0812345678" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={editForm.control} name="address1" render={({ field }) => (
                  <FormItem><FormLabel>ที่อยู่บรรทัด 1</FormLabel><FormControl><Input placeholder="123/4 หมู่บ้าน..." {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editForm.control} name="address2" render={({ field }) => (
                  <FormItem><FormLabel>บรรทัด 2</FormLabel><FormControl><Input placeholder="ซอย..." {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <ThaiAddressFields
                control={editForm.control as unknown as Parameters<typeof ThaiAddressFields>[0]["control"]}
                setValue={editForm.setValue as unknown as Parameters<typeof ThaiAddressFields>[0]["setValue"]}
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); createForm.reset() } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>เพิ่มผู้ใช้ใหม่</DialogTitle>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={createForm.control} name="first_name" render={({ field }) => (
                  <FormItem><FormLabel>ชื่อ</FormLabel><FormControl><Input placeholder="สมชาย" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={createForm.control} name="last_name" render={({ field }) => (
                  <FormItem><FormLabel>นามสกุล</FormLabel><FormControl><Input placeholder="ใจดี" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={createForm.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>อีเมล</FormLabel><FormControl><Input type="email" placeholder="user@email.com" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={createForm.control} name="password" render={({ field }) => (
                <FormItem><FormLabel>รหัสผ่าน <span className="text-text-secondary font-normal text-xs">(ไม่กรอก = ระบบสร้างให้อัตโนมัติ)</span></FormLabel><FormControl><Input type="password" placeholder="ปล่อยว่างให้ระบบสร้าง" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={createForm.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>เบอร์โทร</FormLabel><FormControl><Input placeholder="0812345678" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="space-y-1">
                <p className="text-sm font-medium text-text-primary">ที่อยู่</p>
                <div className="space-y-3 p-3 bg-background rounded-[8px] border border-border">
                  <FormField control={createForm.control} name="address1" render={({ field }) => (
                    <FormItem><FormLabel className="text-xs text-text-secondary">บ้านเลขที่ / หมู่บ้าน / อาคาร</FormLabel><FormControl><Input placeholder="123/4 หมู่บ้าน..." {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={createForm.control} name="address2" render={({ field }) => (
                    <FormItem><FormLabel className="text-xs text-text-secondary">ซอย / ถนน (ไม่บังคับ)</FormLabel><FormControl><Input placeholder="ซอย..." {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <ThaiAddressFields
                    control={createForm.control as unknown as Parameters<typeof ThaiAddressFields>[0]["control"]}
                    setValue={createForm.setValue as unknown as Parameters<typeof ThaiAddressFields>[0]["setValue"]}
                    labelSize="sm"
                  />
                </div>
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" className="rounded-[9999px] bg-surface border-text-secondary/30 hover:bg-border"
                  onClick={() => { setCreateOpen(false); createForm.reset() }}>ยกเลิก</Button>
                <Button type="submit" className="rounded-[9999px]" disabled={createUser.isPending}>
                  {createUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  สร้างบัญชี
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
