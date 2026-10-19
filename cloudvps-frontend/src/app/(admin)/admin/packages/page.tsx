"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Plus, Pencil, Trash2, X, Eye, Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import {
  useAdminPackages,
  useCreatePackageGroup,
  useUpdatePackageGroup,
  useDeletePackageGroup,
  useOsTemplates,
  useVmSpecs,
  useAdminCategories,
} from "@/hooks/useAdmin"
import { usePackageCategories } from "@/hooks/usePackages"
import { ViewToggle, type ViewMode } from "@/components/packages/view-toggle"
import { usePagination } from "@/hooks/usePagination"
import { Pagination } from "@/components/shared/pagination"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { formatCurrency, parseGib, parseDiskGb } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { groupPackages, type PackageGroup } from "@/lib/packageGroup"
import type { OsTemplate } from "@/types/package"

const groupSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อ"),
  description: z.string().min(1, "กรุณากรอกคำอธิบาย"),
  vm_id: z.number().int().positive("กรุณาเลือก VM Spec"),
  price: z.number().positive("กรุณากรอกราคา"),
  period: z.number().int().positive("กรุณากรอกระยะเวลา"),
  port_count: z.number().int().min(1).nullable().optional(),
  category_id: z.number().int().positive().nullable().optional(),
  status: z.boolean().optional(),
  os_ids: z.array(z.number().int().positive()).min(1, "เลือกอย่างน้อย 1 OS"),
})
type GroupFormData = z.infer<typeof groupSchema>

const numField = (e: React.ChangeEvent<HTMLInputElement>) =>
  e.target.value === "" ? undefined : e.target.valueAsNumber

const safeNum = (v: unknown) => (v == null || (typeof v === "number" && isNaN(v)) ? "" : v as number)

function OsMultiSelect({ value, options, onChange }: { value: number[]; options: OsTemplate[]; onChange: (v: number[]) => void }) {
  const [open, setOpen] = useState(false)
  const selected = options.filter((o) => value.includes(o.id))

  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls="os-multiselect-list"
          className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <span className="flex flex-wrap gap-1">
            {selected.length === 0 ? (
              <span className="text-text-secondary">เลือก OS (เลือกได้หลายรายการ)</span>
            ) : (
              selected.map((o) => (
                <span key={o.id} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-[4px]">
                  {o.os_name} {o.os_version}
                </span>
              ))
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" side="bottom" sideOffset={4}>
        <Command>
          <CommandInput placeholder="ค้นหา OS..." />
          <CommandList id="os-multiselect-list">
            <CommandEmpty>ไม่พบข้อมูล</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const checked = value.includes(o.id)
                return (
                  <CommandItem key={o.id} value={`${o.os_name} ${o.os_version}`} onSelect={() => toggle(o.id)}>
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", checked ? "opacity-100" : "opacity-0")} />
                    {o.os_name} {o.os_version}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function PackageGroupForm({
  defaultValues,
  onSubmit,
  onCancel,
  isLoading,
  title,
}: {
  defaultValues?: Partial<GroupFormData>
  onSubmit: (d: GroupFormData) => void
  onCancel: () => void
  isLoading: boolean
  title: string
}) {
  const { data: osTemplates = [] } = useOsTemplates()
  const { data: vmSpecs = [] } = useVmSpecs()
  const { data: categories = [] } = useAdminCategories()

  const form = useForm<GroupFormData>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: "",
      description: "",
      status: true,
      port_count: undefined,
      category_id: null,
      os_ids: [],
      ...defaultValues,
    },
  })

  return (
    <div className="bg-surface border border-border rounded-[8px] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium text-text-primary">{title}</h2>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onCancel}><X className="h-4 w-4" /></Button>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>ชื่อแพ็กเกจ</FormLabel><FormControl><Input placeholder="เช่น VPS Basic" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>คำอธิบาย</FormLabel><FormControl><Input placeholder="คำอธิบายแพ็กเกจ" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )} />
          </div>

          <FormField control={form.control} name="os_ids" render={({ field }) => (
            <FormItem>
              <FormLabel>ระบบปฏิบัติการ (OS variants)</FormLabel>
              <OsMultiSelect
                value={field.value ?? []}
                options={osTemplates.filter((o) => o.status)}
                onChange={field.onChange}
              />
              <FormMessage />
            </FormItem>
          )} />

          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="vm_id" render={({ field }) => (
              <FormItem>
                <FormLabel>VM Spec</FormLabel>
                <Select value={field.value ? String(field.value) : ""} onValueChange={(v) => field.onChange(Number(v))}>
                  <FormControl><SelectTrigger><SelectValue placeholder="เลือก Spec" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {vmSpecs.filter((v) => v.status).map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>{v.core} vCPU · {v.memory} · {v.size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="category_id" render={({ field }) => (
              <FormItem>
                <FormLabel>หมวดหมู่</FormLabel>
                <Select
                  value={field.value != null ? String(field.value) : "none"}
                  onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))}
                >
                  <FormControl><SelectTrigger><SelectValue placeholder="เลือกหมวดหมู่" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="none">ไม่มีหมวดหมู่</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormField control={form.control} name="price" render={({ field }) => (
              <FormItem><FormLabel>ราคา (฿)</FormLabel><FormControl><Input type="number" placeholder="0" {...field} value={safeNum(field.value)} onChange={(e) => field.onChange(numField(e))} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="period" render={({ field }) => (
              <FormItem><FormLabel>ระยะเวลา (วัน)</FormLabel><FormControl><Input type="number" placeholder="30" {...field} value={safeNum(field.value)} onChange={(e) => field.onChange(numField(e))} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="port_count" render={({ field }) => (
              <FormItem>
                <FormLabel>Port (NAT)</FormLabel>
                <FormControl>
                  <Input type="number" placeholder="Public IP" {...field}
                    value={safeNum(field.value)}
                    onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem className="max-w-[200px]">
              <FormLabel>สถานะ</FormLabel>
              <Select value={field.value ? "true" : "false"} onValueChange={(v) => field.onChange(v === "true")}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="true">เปิดใช้งาน</SelectItem>
                  <SelectItem value="false">ปิดใช้งาน</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <div className="flex gap-2">
            <Button type="submit" className="rounded-[9999px]" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              บันทึก
            </Button>
            <Button type="button" variant="outline" className="rounded-[9999px] bg-surface border-text-secondary/30 hover:bg-border" onClick={onCancel}>ยกเลิก</Button>
          </div>
        </form>
      </Form>
    </div>
  )
}

function toGroupFormData(group: PackageGroup): Partial<GroupFormData> {
  const r = group.representative
  return {
    name: r.name,
    description: r.description,
    vm_id: r.vm_id,
    price: r.price,
    period: r.period,
    port_count: r.port_count,
    category_id: r.category_id,
    status: r.status,
    os_ids: group.variants.map((v) => v.os_id),
  }
}

function diffGroupOs(existingVariants: PackageGroup["variants"], selectedOsIds: number[]) {
  const selectedSet = new Set(selectedOsIds)
  const existingOsIds = new Set(existingVariants.map((v) => v.os_id))
  return {
    toCreate: selectedOsIds.filter((id) => !existingOsIds.has(id)),
    toUpdate: existingVariants.filter((v) => selectedSet.has(v.os_id)).map((v) => ({ id: v.id, status: v.status })),
    toRemove: existingVariants.filter((v) => !selectedSet.has(v.os_id)).map((v) => v.id),
  }
}

function groupStatus(group: PackageGroup): { text: string; cls: string } {
  const activeCount = group.variants.filter((v) => v.status).length
  if (activeCount === 0) return { text: "ปิด", cls: "text-text-secondary" }
  if (activeCount === group.variants.length) return { text: "เปิด", cls: "text-accent-green border-accent-green/30" }
  return { text: "ผสม", cls: "text-accent-yellow border-accent-yellow/30" }
}

export default function AdminPackagesPage() {
  const { data: packages = [], isLoading } = useAdminPackages()
  const { data: categories = [] } = usePackageCategories()
  const create = useCreatePackageGroup()
  const update = useUpdatePackageGroup()
  const remove = useDeletePackageGroup()
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<PackageGroup | null>(null)
  const [viewing, setViewing] = useState<PackageGroup | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<PackageGroup | null>(null)
  const [pendingUpdateData, setPendingUpdateData] = useState<GroupFormData | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState<"ALL" | "active" | "inactive">("ALL")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterOs, setFilterOs] = useState<string>("all")
  const [filterIpType, setFilterIpType] = useState<"all" | "public" | "private">("all")
  const [filterSpec, setFilterSpec] = useState<string>("all")
  const [filterRam, setFilterRam] = useState<string>("all")
  const [filterDisk, setFilterDisk] = useState<string>("all")

  const osNames = [...new Set(packages.map((p) => p.os.os_name))].sort()
  const coreValues = [...new Set(packages.map((p) => p.vm.core))].sort((a, b) => a - b)
  const ramValues = [...new Set(packages.map((p) => parseGib(p.vm.memory)))].sort((a, b) => a - b)
  const diskValues = [...new Set(packages.map((p) => parseDiskGb(p.vm.size)))].sort((a, b) => a - b)

  const groups = groupPackages(packages)
  const filtered = groups.filter((g) => {
    const r = g.representative
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === "ALL" || g.variants.some((v) => (filterStatus === "active" ? v.status : !v.status))
    const matchCategory = filterCategory === "all" || (filterCategory === "none" ? !r.category : r.category?.id === Number(filterCategory))
    const matchOs = filterOs === "all" || g.variants.some((v) => v.os.os_name === filterOs)
    const matchIpType = filterIpType === "all" || (filterIpType === "public" ? r.port_count === null : r.port_count !== null)
    const matchSpec = filterSpec === "all" || r.vm.core === Number(filterSpec)
    const matchRam = filterRam === "all" || parseGib(r.vm.memory) === Number(filterRam)
    const matchDisk = filterDisk === "all" || parseDiskGb(r.vm.size) === Number(filterDisk)
    return matchSearch && matchStatus && matchCategory && matchOs && matchIpType && matchSpec && matchRam && matchDisk
  })
  const { page, setPage, totalPages, paginated, total } = usePagination(filtered, 10, `${search}:${filterStatus}:${filterCategory}:${filterOs}:${filterIpType}:${filterSpec}:${filterRam}:${filterDisk}`)

  const pendingDiff = editing && pendingUpdateData ? diffGroupOs(editing.variants, pendingUpdateData.os_ids) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[28px] font-bold text-text-primary">แพ็กเกจ</h1>
        <div className="flex items-center gap-2">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <Button className="rounded-[9999px] gap-1" size="sm" onClick={() => { setShowCreate(true); setEditing(null) }}>
            <Plus className="h-4 w-4" /> เพิ่ม
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="ค้นหาแพ็กเกจ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary w-48"
        />
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px] h-9 text-sm">
            <SelectValue placeholder="หมวดหมู่" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">หมวดหมู่ทั้งหมด</SelectItem>
            <SelectItem value="none">ไม่มีหมวดหมู่</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterOs} onValueChange={setFilterOs}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue placeholder="OS" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">OS ทั้งหมด</SelectItem>
            {osNames.map((os) => (
              <SelectItem key={os} value={os}>{os}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterIpType} onValueChange={(v) => setFilterIpType(v as "all" | "public" | "private")}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue placeholder="ประเภท IP" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">IP ทั้งหมด</SelectItem>
            <SelectItem value="public">Public IP</SelectItem>
            <SelectItem value="private">Private IP (NAT)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSpec} onValueChange={setFilterSpec}>
          <SelectTrigger className="w-[130px] h-9 text-sm">
            <SelectValue placeholder="vCPU" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">vCPU ทั้งหมด</SelectItem>
            {coreValues.map((c) => (
              <SelectItem key={c} value={String(c)}>{c} vCPU</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterRam} onValueChange={setFilterRam}>
          <SelectTrigger className="w-[120px] h-9 text-sm">
            <SelectValue placeholder="RAM" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">RAM ทั้งหมด</SelectItem>
            {ramValues.map((r) => (
              <SelectItem key={r} value={String(r)}>{r} GB RAM</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterDisk} onValueChange={setFilterDisk}>
          <SelectTrigger className="w-[130px] h-9 text-sm">
            <SelectValue placeholder="Disk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Disk ทั้งหมด</SelectItem>
            {diskValues.map((d) => (
              <SelectItem key={d} value={String(d)}>{d} GB SSD</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(["ALL", "active", "inactive"] as const).map((s) => (
          <Button key={s} size="sm" variant={filterStatus === s ? "default" : "outline"}
            className="rounded-[9999px] h-7 px-3 text-xs"
            onClick={() => setFilterStatus(s)}>
            {s === "ALL" ? "ทั้งหมด" : s === "active" ? "เปิดใช้งาน" : "ปิดใช้งาน"}
          </Button>
        ))}
      </div>

      {showCreate && !editing && (
        <PackageGroupForm
          title="สร้างกลุ่มแพ็กเกจ"
          isLoading={create.isPending}
          onCancel={() => setShowCreate(false)}
          onSubmit={async (d) => {
            const { os_ids, ...spec } = d
            // allSettled inside the hook never rejects — inspect counts so the form
            // stays open (data intact) when every request failed
            const r = await create.mutateAsync({ spec, osIds: os_ids }).catch(() => null)
            if (r && r.failed < r.total) setShowCreate(false)
          }}
        />
      )}

      {editing && (
        <PackageGroupForm
          title={`แก้ไข: ${editing.representative.name}`}
          defaultValues={toGroupFormData(editing)}
          isLoading={update.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(d) => setPendingUpdateData(d)}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 rounded-[8px]" />)}</div>
      ) : viewMode === "list" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-3 pr-4 font-medium">ชื่อ</th>
                <th className="py-3 pr-4 font-medium">OS</th>
                <th className="py-3 pr-4 font-medium">สเปค</th>
                <th className="py-3 pr-4 font-medium">ราคา</th>
                <th className="py-3 pr-4 font-medium">ระยะ</th>
                <th className="py-3 pr-4 font-medium">สถานะ</th>
                <th className="py-3 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((group) => {
                const pkg = group.representative
                const st = groupStatus(group)
                return (
                  <tr key={group.key} className="hover:bg-surface/50">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-text-primary">{pkg.name}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {group.variants.map((v) => (
                          <span key={v.id} className="text-[10px] bg-border/60 text-text-secondary px-1.5 py-0.5 rounded-[4px]">
                            {v.os.os_name} {v.os.os_version}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-text-secondary text-xs">
                      {pkg.vm.core}vCPU · {parseGib(pkg.vm.memory)}GB · {parseDiskGb(pkg.vm.size)}GB
                      {pkg.port_count ? ` · ${pkg.port_count}P` : " · PublicIP"}
                    </td>
                    <td className="py-3 pr-4 font-medium">{formatCurrency(pkg.price)}</td>
                    <td className="py-3 pr-4 text-text-secondary">{pkg.period}d</td>
                    <td className="py-3 pr-4">
                      <Badge variant="outline" className={cn("text-xs rounded-[9999px]", st.cls)}>{st.text}</Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewing(group)} title="ดูรายละเอียด">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditing(group); setShowCreate(false) }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-secondary hover:bg-secondary/10"
                          onClick={() => setDeletingGroup(group)} disabled={remove.isPending}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {total === 0 && <p className="text-center py-10 text-text-secondary text-sm">ยังไม่มีแพ็กเกจ</p>}
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((group) => {
            const pkg = group.representative
            const st = groupStatus(group)
            return (
              <div key={group.key} className="bg-surface border border-border rounded-[8px] p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-text-primary">{pkg.name}</p>
                  <Badge variant="outline" className={cn("text-xs rounded-[9999px] shrink-0", st.cls)}>{st.text}</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {group.variants.map((v) => (
                    <span key={v.id} className="text-[10px] bg-border/60 text-text-secondary px-1.5 py-0.5 rounded-[4px]">
                      {v.os.os_name} {v.os.os_version}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-text-secondary space-y-0.5">
                  <p>{pkg.vm.core}vCPU · {parseGib(pkg.vm.memory)} GB RAM · {parseDiskGb(pkg.vm.size)} GB SSD</p>
                  <p>{pkg.port_count ? `Private IP · ${pkg.port_count} ports` : "Public IP"}</p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="font-bold text-text-primary">{formatCurrency(pkg.price)}<span className="text-xs font-normal text-text-secondary"> /{pkg.period}d</span></span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewing(group)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditing(group); setShowCreate(false) }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-secondary hover:bg-secondary/10"
                      onClick={() => setDeletingGroup(group)} disabled={remove.isPending}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
          {total === 0 && <p className="col-span-full text-center py-10 text-text-secondary text-sm">ยังไม่มีแพ็กเกจ</p>}
          <div className="col-span-full"><Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} /></div>
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{viewing?.representative.name}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <InfoRow label="สถานะ">
                <Badge variant="outline" className={cn("text-xs rounded-[9999px]", groupStatus(viewing).cls)}>
                  {groupStatus(viewing).text}
                </Badge>
              </InfoRow>
              <InfoRow label="คำอธิบาย"><span className="text-text-secondary">{viewing.representative.description || "—"}</span></InfoRow>
              <InfoRow label="ราคา"><span className="font-medium">{formatCurrency(viewing.representative.price)} / {viewing.representative.period} วัน</span></InfoRow>
              <InfoRow label="ระบบปฏิบัติการ">
                <div className="flex flex-wrap gap-1 justify-end">
                  {viewing.variants.map((v) => (
                    <span key={v.id} className={cn("text-xs px-1.5 py-0.5 rounded-[4px]", v.status ? "bg-border/60 text-text-secondary" : "bg-border/60 text-text-secondary/50 line-through")}>
                      {v.os.os_name} {v.os.os_version}
                    </span>
                  ))}
                </div>
              </InfoRow>
              <InfoRow label="สเปค">
                <span>{viewing.representative.vm.core}vCPU · {parseGib(viewing.representative.vm.memory)} GB RAM · {parseDiskGb(viewing.representative.vm.size)} GB SSD</span>
              </InfoRow>
              <InfoRow label="ประเภท IP">
                <span>{viewing.representative.port_count ? `Private IP (${viewing.representative.port_count} ports)` : "Public IP"}</span>
              </InfoRow>
              {viewing.representative.category && <InfoRow label="หมวดหมู่"><span>{viewing.representative.category.name}</span></InfoRow>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingUpdateData}
        title="บันทึกการเปลี่ยนแปลง"
        description={
          pendingDiff
            ? [
                `ยืนยันการอัปเดตกลุ่มแพ็กเกจ "${editing?.representative.name}"`,
                pendingDiff.toUpdate.length ? `อัปเดตสเปค ${pendingDiff.toUpdate.length} รายการ` : null,
                pendingDiff.toCreate.length ? `เพิ่ม OS ${pendingDiff.toCreate.length} รายการ` : null,
                pendingDiff.toRemove.length ? `ลบ OS ${pendingDiff.toRemove.length} รายการ` : null,
              ].filter(Boolean).join(" · ")
            : ""
        }
        confirmLabel="บันทึก"
        variant="default"
        isPending={update.isPending}
        onConfirm={async () => {
          if (!editing || !pendingUpdateData || !pendingDiff) return
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { os_ids: _osIds, ...spec } = pendingUpdateData
          const r = await update.mutateAsync({ spec, ...pendingDiff }).catch(() => null)
          setPendingUpdateData(null)
          // keep the edit form open (data intact) only when every request failed
          if (r && r.failed < r.total) setEditing(null)
        }}
        onCancel={() => setPendingUpdateData(null)}
      />

      <ConfirmDialog
        open={!!deletingGroup}
        title="ลบกลุ่มแพ็กเกจ"
        description={`จะลบแพ็กเกจ ${deletingGroup?.variants.length ?? 0} รายการ (ทุก OS variant) ถาวร ไม่สามารถกู้คืนได้`}
        confirmLabel="ลบ"
        isPending={remove.isPending}
        onConfirm={() => { remove.mutate(deletingGroup!.variants.map((v) => v.id)); setDeletingGroup(null) }}
        onCancel={() => setDeletingGroup(null)}
      />
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-text-secondary shrink-0 w-28">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  )
}
