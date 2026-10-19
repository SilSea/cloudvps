"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Plus, Pencil, Server, Monitor } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  useOsTemplates, useVmSpecs,
  useCreateOs, useUpdateOs,
  useCreateVm, useUpdateVm,
} from "@/hooks/useAdmin"
import { ViewToggle, type ViewMode } from "@/components/packages/view-toggle"
import { usePagination } from "@/hooks/usePagination"
import { Pagination } from "@/components/shared/pagination"
import type { OsTemplate, VmSpec } from "@/types/package"

// ── OS Schemas ──
const osSchema = z.object({
  os_name: z.string().min(1, "กรุณากรอกชื่อ OS"),
  os_version: z.string().min(1, "กรุณากรอก version"),
  vmid: z.number().int().positive("กรุณากรอก VMID"),
})
type OsFormData = z.infer<typeof osSchema>

// ── VM Schemas ──
const vmSchema = z.object({
  core: z.number().int().positive("กรุณากรอก core"),
  memory: z.string().min(1, "กรุณากรอก RAM"),
  size: z.string().min(1, "กรุณากรอก Disk"),
})
type VmFormData = z.infer<typeof vmSchema>

// ─────────────────────────────────────────────────
// OS Templates Section
// ─────────────────────────────────────────────────
function OsSection() {
  const { data: templates = [], isLoading } = useOsTemplates()
  const [search, setSearch] = useState("")
  const filtered = templates.filter((t) =>
    `${t.os_name} ${t.os_version}`.toLowerCase().includes(search.toLowerCase())
  )
  const { page, setPage, totalPages, paginated, total } = usePagination(filtered, 10, search)
  const createOs = useCreateOs()
  const updateOs = useUpdateOs()
  const [editing, setEditing] = useState<OsTemplate | null>(null)
  const [open, setOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("list")

  const form = useForm<OsFormData>({
    resolver: zodResolver(osSchema),
    defaultValues: { os_name: "", os_version: "", vmid: undefined as unknown as number },
  })

  const openCreate = () => {
    setEditing(null)
    form.reset({ os_name: "", os_version: "", vmid: undefined as unknown as number })
    setOpen(true)
  }

  const openEdit = (t: OsTemplate) => {
    setEditing(t)
    form.reset({ os_name: t.os_name, os_version: t.os_version, vmid: t.vmid })
    setOpen(true)
  }

  const onSubmit = async (d: OsFormData) => {
    if (editing) {
      await updateOs.mutateAsync({ id: editing.id, data: d })
    } else {
      await createOs.mutateAsync(d)
    }
    setOpen(false)
  }

  const isPending = createOs.isPending || updateOs.isPending

  return (
    <div className="bg-surface border border-border rounded-[8px] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-primary" />
          <h2 className="text-[18px] font-semibold text-text-primary">OS Templates</h2>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <Button size="sm" className="rounded-[9999px] gap-1" onClick={openCreate}>
            <Plus className="h-4 w-4" /> เพิ่ม
          </Button>
        </div>
      </div>

      <input
        type="search"
        placeholder="ค้นหา OS..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-xs px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary"
      />

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-[8px]" />)}</div>
      ) : viewMode === "list" ? (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-2 pr-4 font-medium">ID</th>
                <th className="py-2 pr-4 font-medium">OS Name</th>
                <th className="py-2 pr-4 font-medium">Version</th>
                <th className="py-2 pr-4 font-medium">VMID</th>
                <th className="py-2 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((t) => (
                <tr key={t.id} className="hover:bg-background/50">
                  <td className="py-2.5 pr-4 text-text-secondary">{t.id}</td>
                  <td className="py-2.5 pr-4 font-medium text-text-primary">{t.os_name}</td>
                  <td className="py-2.5 pr-4 text-text-secondary">{t.os_version}</td>
                  <td className="py-2.5 pr-4 font-mono text-text-secondary">{t.vmid}</td>
                  <td className="py-2.5">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {total === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-text-secondary text-sm">ยังไม่มี OS Template</td></tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} />
        </>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {paginated.map((t) => (
            <div key={t.id} className="bg-background border border-border rounded-[8px] p-3 space-y-2">
              <div className="flex items-start justify-between gap-1">
                <div>
                  <p className="font-medium text-text-primary text-sm">{t.os_name}</p>
                  <p className="text-xs text-text-secondary">{t.os_version}</p>
                </div>
                <Badge variant="outline" className="text-xs rounded-[9999px] font-mono shrink-0">#{t.vmid}</Badge>
              </div>
              <div className="pt-1 border-t border-border">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(t)}>
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
          {total === 0 && <p className="col-span-full py-8 text-center text-text-secondary text-sm">ยังไม่มี OS Template</p>}
          <div className="col-span-full"><Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} /></div>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? `แก้ไข: ${editing.os_name} ${editing.os_version}` : "เพิ่ม OS Template"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="os_name" render={({ field }) => (
                  <FormItem><FormLabel>OS Name</FormLabel><FormControl><Input placeholder="Ubuntu" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="os_version" render={({ field }) => (
                  <FormItem><FormLabel>Version</FormLabel><FormControl><Input placeholder="22.04" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="vmid" render={({ field }) => (
                <FormItem>
                  <FormLabel>Proxmox VMID (Template)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="9000" {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex gap-2 pt-1">
                <Button type="submit" className="rounded-[9999px]" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editing ? "บันทึก" : "สร้าง"}
                </Button>
                <Button type="button" variant="outline" className="rounded-[9999px]" onClick={() => setOpen(false)}>
                  ยกเลิก
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────────
// VM Specs Section
// ─────────────────────────────────────────────────
function VmSection() {
  const { data: specs = [], isLoading } = useVmSpecs()
  const [search, setSearch] = useState("")
  const filtered = specs.filter((s) =>
    `${s.core} ${s.memory} ${s.size}`.includes(search)
  )
  const { page, setPage, totalPages, paginated, total } = usePagination(filtered, 10, search)
  const createVm = useCreateVm()
  const updateVm = useUpdateVm()
  const [editing, setEditing] = useState<VmSpec | null>(null)
  const [open, setOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("list")

  const form = useForm<VmFormData>({
    resolver: zodResolver(vmSchema),
    defaultValues: { core: undefined as unknown as number, memory: "", size: "" },
  })

  const openCreate = () => {
    setEditing(null)
    form.reset({ core: undefined as unknown as number, memory: "", size: "" })
    setOpen(true)
  }

  const openEdit = (s: VmSpec) => {
    setEditing(s)
    form.reset({ core: s.core, memory: s.memory, size: s.size })
    setOpen(true)
  }

  const onSubmit = async (d: VmFormData) => {
    if (editing) {
      await updateVm.mutateAsync({ id: editing.id, data: d })
    } else {
      await createVm.mutateAsync(d)
    }
    setOpen(false)
  }

  const isPending = createVm.isPending || updateVm.isPending

  return (
    <div className="bg-surface border border-border rounded-[8px] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          <h2 className="text-[18px] font-semibold text-text-primary">VM Specs</h2>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <Button size="sm" className="rounded-[9999px] gap-1" onClick={openCreate}>
            <Plus className="h-4 w-4" /> เพิ่ม
          </Button>
        </div>
      </div>

      <input
        type="search"
        placeholder="ค้นหา core / GB..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-xs px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary"
      />

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-[8px]" />)}</div>
      ) : viewMode === "list" ? (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-2 pr-4 font-medium">ID</th>
                <th className="py-2 pr-4 font-medium">CPU</th>
                <th className="py-2 pr-4 font-medium">RAM</th>
                <th className="py-2 pr-4 font-medium">Disk</th>
                <th className="py-2 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((s) => (
                <tr key={s.id} className="hover:bg-background/50">
                  <td className="py-2.5 pr-4 text-text-secondary">{s.id}</td>
                  <td className="py-2.5 pr-4 font-medium text-text-primary">{s.core} vCPU</td>
                  <td className="py-2.5 pr-4 text-text-secondary">{s.memory} GB</td>
                  <td className="py-2.5 pr-4 text-text-secondary">{s.size} GB</td>
                  <td className="py-2.5">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {total === 0 && (
                <tr><td colSpan={5} className="py-8 text-center text-text-secondary text-sm">ยังไม่มี VM Spec</td></tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} />
        </>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {paginated.map((s) => (
            <div key={s.id} className="bg-background border border-border rounded-[8px] p-3 space-y-2">
              <p className="font-medium text-text-primary text-sm">{s.core} vCPU</p>
              <div className="text-xs text-text-secondary space-y-0.5">
                <p>RAM: {s.memory} GB</p>
                <p>Disk: {s.size} GB</p>
              </div>
              <div className="pt-1 border-t border-border">
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEdit(s)}>
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
          {total === 0 && <p className="col-span-full py-8 text-center text-text-secondary text-sm">ยังไม่มี VM Spec</p>}
          <div className="col-span-full"><Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} /></div>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? `แก้ไข VM Spec #${editing.id}` : "เพิ่ม VM Spec"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="core" render={({ field }) => (
                <FormItem>
                  <FormLabel>CPU Cores</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="2" {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="memory" render={({ field }) => (
                  <FormItem>
                    <FormLabel>RAM (GB)</FormLabel>
                    <FormControl><Input placeholder="2" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="size" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Disk (GB)</FormLabel>
                    <FormControl><Input placeholder="40" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" className="rounded-[9999px]" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editing ? "บันทึก" : "สร้าง"}
                </Button>
                <Button type="button" variant="outline" className="rounded-[9999px]" onClick={() => setOpen(false)}>
                  ยกเลิก
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────
export default function OsVmPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-[28px] font-bold text-text-primary">OS & VM Specs</h1>
      <OsSection />
      <VmSection />
    </div>
  )
}

