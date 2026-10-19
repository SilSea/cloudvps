"use client"

import { useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ArrowLeft, Tag, Loader2, CheckCircle, Search, Cpu, HardDrive, MemoryStick, Globe, Network, MonitorSmartphone } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Pagination } from "@/components/shared/pagination"
import { usePackage, usePackages, usePackageCategories } from "@/hooks/usePackages"
import { usePagination } from "@/hooks/usePagination"
import { useCreateOrder, useValidatePromo } from "@/hooks/useOrders"
import { formatCurrency, parseGib, parseDiskGb, cn } from "@/lib/utils"
import { ApiClientError } from "@/services/api/client"
import { specKey, osVariants } from "@/lib/packageGroup"
import type { PromoValidateResult } from "@/types/promotion"
import type { Package } from "@/types/package"

// ─── Package Picker ───────────────────────────────────────────────────────────

const PICKER_PAGE_SIZE = 5

function PackagePicker({ onSelect }: { onSelect: (id: number) => void }) {
  const [search, setSearch] = useState("")
  const [filterCategory, setFilterCategory] = useState("all")
  const [filterIp, setFilterIp] = useState("all")
  const [filterOs, setFilterOs] = useState("all")
  const [filterRam, setFilterRam] = useState("all")
  const [filterDisk, setFilterDisk] = useState("all")

  const { data: packages = [], isLoading } = usePackages()
  const { data: categories = [] } = usePackageCategories()

  // derive unique filter options from loaded packages
  const osOptions = [...new Set(packages.map((p) => p.os.os_name))].sort()
  const ramOptions = [...new Set(packages.map((p) => parseGib(p.vm.memory)))].sort((a, b) => a - b)
  const diskOptions = [...new Set(packages.map((p) => parseDiskGb(p.vm.size)))].sort((a, b) => a - b)

  const q = search.trim().toLowerCase()
  const filtered = packages.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.os.os_name.toLowerCase().includes(q) && !p.category?.name.toLowerCase().includes(q)) return false
    if (filterIp === "public" && p.port_count !== null) return false
    if (filterIp === "nat" && p.port_count === null) return false
    if (filterCategory !== "all" && String(p.category?.id ?? "none") !== filterCategory) return false
    if (filterOs !== "all" && p.os.os_name !== filterOs) return false
    if (filterRam !== "all" && parseGib(p.vm.memory) !== Number(filterRam)) return false
    if (filterDisk !== "all" && parseDiskGb(p.vm.size) !== Number(filterDisk)) return false
    return true
  })

  // one representative per spec group (OS variants collapse into a single row)
  const groups = new Map<string, Package>()
  for (const p of filtered) {
    const key = specKey(p)
    if (!groups.has(key)) groups.set(key, p)
  }
  const grouped = [...groups.values()]

  const resetKey = `${q}:${filterCategory}:${filterIp}:${filterOs}:${filterRam}:${filterDisk}`
  const { page, setPage, totalPages, paginated, total } = usePagination(grouped, PICKER_PAGE_SIZE, resetKey)

  return (
    <div className="space-y-4">
      <h1 className="text-[28px] font-bold text-text-primary">สั่งซื้อ</h1>
      <p className="text-sm text-text-secondary">เลือกแพ็กเกจที่ต้องการ</p>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาแพ็กเกจหรือ OS..." className="pl-8 h-9 text-sm" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={filterOs} onValueChange={setFilterOs}>
            <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="OS" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">OS ทั้งหมด</SelectItem>
              {osOptions.map((os) => <SelectItem key={os} value={os}>{os}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterRam} onValueChange={setFilterRam}>
            <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="RAM" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">RAM ทั้งหมด</SelectItem>
              {ramOptions.map((r) => <SelectItem key={r} value={String(r)}>{r} GB</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterDisk} onValueChange={setFilterDisk}>
            <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Disk" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Disk ทั้งหมด</SelectItem>
              {diskOptions.map((d) => <SelectItem key={d} value={String(d)}>{d} GB</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterIp} onValueChange={setFilterIp}>
            <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="IP" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">IP ทั้งหมด</SelectItem>
              <SelectItem value="public">Public IP</SelectItem>
              <SelectItem value="nat">NAT</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="หมวดหมู่" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">หมวดหมู่ทั้งหมด</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Package list */}
      {isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map((i) => <Skeleton key={i} className="h-[88px] rounded-[8px]" />)}</div>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-text-secondary py-6 text-center">ไม่พบแพ็กเกจที่ตรงเงื่อนไข</p>
      ) : (
        <>
          <div className="space-y-2">
            {paginated.map((pkg) => (
              <PackageRow key={pkg.id} pkg={pkg} osCount={osVariants(pkg, packages).length} onSelect={onSelect} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={PICKER_PAGE_SIZE} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}

function PackageRow({ pkg, osCount, onSelect }: { pkg: Package; osCount: number; onSelect: (id: number) => void }) {
  const isNat = pkg.port_count !== null
  const unavailable = pkg.available === false
  return (
    <button
      onClick={() => !unavailable && onSelect(pkg.id)}
      disabled={unavailable}
      className={cn(
        "w-full text-left p-4 bg-surface border rounded-[8px] transition-colors",
        unavailable
          ? "border-border opacity-50 cursor-not-allowed"
          : "border-border hover:border-primary",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-text-primary text-sm truncate">{pkg.name}</p>
            <span className={cn(
              "shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-[9999px]",
              isNat ? "bg-accent-yellow/10 text-accent-yellow" : "bg-accent-green/10 text-accent-green",
            )}>
              {isNat ? "NAT" : "Public IP"}
            </span>
            {unavailable && (
              <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-[9999px] bg-border text-text-secondary">
                ทรัพยากรไม่เพียงพอ
              </span>
            )}
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 mt-1 rounded-[4px] bg-border/60 text-text-secondary">
            <MonitorSmartphone className="h-3 w-3" />
            {osCount > 1 ? `เลือกได้ ${osCount} ระบบปฏิบัติการ` : `${pkg.os.os_name} ${pkg.os.os_version}`}
          </span>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-text-secondary">
            <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{pkg.vm.core} vCPU</span>
            <span className="flex items-center gap-1"><MemoryStick className="h-3 w-3" />{parseGib(pkg.vm.memory)} GB RAM</span>
            <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{parseDiskGb(pkg.vm.size)} GB Disk</span>
            {isNat
              ? <span className="flex items-center gap-1"><Network className="h-3 w-3" />{pkg.port_count} ports</span>
              : <span className="flex items-center gap-1"><Globe className="h-3 w-3" />Public IP</span>
            }
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-text-primary">{formatCurrency(pkg.price)}</p>
          <p className="text-xs text-text-secondary">/{pkg.period} วัน</p>
        </div>
      </div>
    </button>
  )
}

// ─── Order Form ───────────────────────────────────────────────────────────────

function OrderForm({
  packageId,
  allPackages,
  onBack,
  onChangePackage,
  isUnavailable,
}: {
  packageId: number
  allPackages: Package[]
  onBack: () => void
  onChangePackage: (id: number) => void
  isUnavailable?: boolean
}) {
  const router = useRouter()
  const { data: pkg, isLoading } = usePackage(packageId)
  const createOrder = useCreateOrder()
  const validatePromo = useValidatePromo()

  const variants = pkg ? osVariants(pkg, allPackages) : []

  const [promoCode, setPromoCode] = useState("")
  const [promoResult, setPromoResult] = useState<PromoValidateResult | null>(null)

  const discountAmount = promoResult && pkg
    ? promoResult.type === "PERCENT"
      ? Math.round(pkg.price * (promoResult.discount / 100))
      : Math.min(promoResult.discount, pkg.price)
    : 0
  const finalAmount = pkg ? Math.max(0, pkg.price - discountAmount) : 0

  const handleValidatePromo = async () => {
    if (!promoCode.trim()) return
    try {
      const result = await validatePromo.mutateAsync({ code: promoCode.trim() })
      setPromoResult(result)
      toast.success("ใช้โปรโมชั่นสำเร็จ")
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.message : "รหัสโปรโมชั่นไม่ถูกต้อง"
      toast.error(msg)
      setPromoResult(null)
    }
  }

  const handleCreateOrder = async () => {
    try {
      const order = await createOrder.mutateAsync({
        package_id: packageId,
        promo_code: promoCode.trim() || undefined,
      })
      router.push(`/billing/orders/${order.id}`)
    } catch (e) {
      if (e instanceof ApiClientError) {
        switch (e.code) {
          case "PROMO_LIMIT_REACHED":
            toast.error("โปรโมชั่นนี้ถูกใช้งานครบแล้ว")
            break
          case "PROMO_USER_LIMIT_REACHED":
            toast.error("คุณใช้โปรโมชั่นนี้ครบจำนวนที่กำหนดแล้ว")
            break
          case "RENEWAL_PENDING":
            toast.error("มีคำสั่งต่ออายุรออยู่แล้ว กรุณาชำระเงินหรือยกเลิกก่อน")
            break
          case "INSUFFICIENT_RESOURCES":
            toast.error("ทรัพยากร Proxmox ไม่เพียงพอสำหรับแพ็กเกจนี้")
            break
          default:
            toast.error(e.message ?? "เกิดข้อผิดพลาด")
        }
      }
    }
  }

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-[200px] rounded-[8px]" /></div>
  if (!pkg) return <p className="text-text-secondary">ไม่พบแพ็กเกจ</p>

  return (
    <div className="max-w-lg space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> เลือกแพ็กเกจอื่น
      </button>

      <h1 className="text-[28px] font-bold text-text-primary">สร้างคำสั่งซื้อ</h1>

      {/* Package detail card */}
      <div className="bg-surface border border-border rounded-[8px] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-border gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-text-primary truncate">{pkg.name}</p>
            {variants.length <= 1 && (
              <p className="text-xs text-text-secondary mt-0.5">{pkg.os.os_name} {pkg.os.os_version}</p>
            )}
          </div>
          <span className={cn(
            "shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-[9999px]",
            pkg.port_count !== null ? "bg-accent-yellow/10 text-accent-yellow" : "bg-accent-green/10 text-accent-green",
          )}>
            {pkg.port_count !== null ? "NAT" : "Public IP"}
          </span>
        </div>
        {variants.length > 1 && (
          <div className="px-4 py-3 border-b border-border">
            <label className="text-xs text-text-secondary mb-1.5 block">ระบบปฏิบัติการ</label>
            <Select value={String(packageId)} onValueChange={(v) => onChangePackage(Number(v))}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="เลือก OS" />
              </SelectTrigger>
              <SelectContent>
                {variants.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)}>{v.os.os_name} {v.os.os_version}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-px bg-border">
          <SpecCell icon={<Cpu className="h-3.5 w-3.5" />} label="CPU" value={`${pkg.vm.core} vCPU`} />
          <SpecCell icon={<MemoryStick className="h-3.5 w-3.5" />} label="RAM" value={`${parseGib(pkg.vm.memory)} GB`} />
          <SpecCell icon={<HardDrive className="h-3.5 w-3.5" />} label="Disk" value={`${parseDiskGb(pkg.vm.size)} GB SSD`} />
          <SpecCell
            icon={pkg.port_count !== null ? <Network className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
            label="Network"
            value={pkg.port_count !== null ? `NAT · ${pkg.port_count} ports` : "Public IP"}
          />
        </div>
        <div className="px-4 py-3 flex items-center justify-between border-t border-border">
          <span className="text-sm text-text-secondary">ราคา / {pkg.period} วัน</span>
          <span className="text-[18px] font-bold text-primary">{formatCurrency(pkg.price)}</span>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-[8px] p-4 space-y-3">
        <h3 className="font-medium text-text-primary flex items-center gap-2"><Tag className="h-4 w-4" /> โปรโมชั่น</h3>
        <div className="flex gap-2">
          <Input
            placeholder="รหัสโปรโมชั่น"
            value={promoCode}
            onChange={(e) => { setPromoCode(e.target.value); setPromoResult(null) }}
          />
          <Button variant="outline" className="rounded-[9999px]" onClick={handleValidatePromo} disabled={validatePromo.isPending || !promoCode}>
            {validatePromo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "ใช้"}
          </Button>
        </div>
        {promoResult && (
          <div className="flex items-center gap-2 text-sm text-accent-green">
            <CheckCircle className="h-4 w-4" />
            ส่วนลด {formatCurrency(discountAmount)}
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-[8px] p-4 space-y-2">
        <div className="flex justify-between text-sm"><span className="text-text-secondary">ราคาเต็ม</span><span>{formatCurrency(pkg.price)}</span></div>
        {promoResult && discountAmount > 0 && (
          <div className="flex justify-between text-sm text-accent-green"><span>ส่วนลด</span><span>-{formatCurrency(discountAmount)}</span></div>
        )}
        <div className="flex justify-between font-bold text-[16px] pt-2 border-t border-border">
          <span>ยอดสุทธิ</span><span className="text-primary">{formatCurrency(finalAmount)}</span>
        </div>
      </div>

      {isUnavailable && (
        <p className="text-xs text-secondary text-center">แพ็กเกจนี้ไม่สามารถสั่งซื้อได้ขณะนี้ — ทรัพยากร Proxmox ไม่เพียงพอ</p>
      )}
      <Button
        className="w-full rounded-[9999px]"
        disabled={createOrder.isPending || !!isUnavailable}
        onClick={handleCreateOrder}
      >
        {createOrder.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        ยืนยันคำสั่งซื้อ
      </Button>
    </div>
  )
}

function SpecCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-surface px-4 py-2.5">
      <span className="text-text-secondary shrink-0">{icon}</span>
      <div>
        <p className="text-[10px] text-text-secondary">{label}</p>
        <p className="text-xs font-medium text-text-primary">{value}</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function NewOrderContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [localPackageId, setLocalPackageId] = useState<number>(0)

  const urlPackageId = Number(searchParams.get("packageId")) || 0
  const packageId = urlPackageId || localPackageId

  const { data: allPackages = [] } = usePackages()

  const handleSelect = (id: number) => {
    setLocalPackageId(id)
    router.replace(`/billing/orders/new?packageId=${id}`, { scroll: false })
  }

  const handleBack = () => {
    setLocalPackageId(0)
    router.replace("/billing/orders/new", { scroll: false })
  }

  if (!packageId) return <PackagePicker onSelect={handleSelect} />

  const selectedPkg = allPackages.find((p) => p.id === packageId)
  const isUnavailable = selectedPkg?.available === false

  return (
    <OrderForm
      packageId={packageId}
      allPackages={allPackages}
      onBack={handleBack}
      onChangePackage={handleSelect}
      isUnavailable={isUnavailable}
    />
  )
}

export default function NewOrderPage() {
  return <Suspense><NewOrderContent /></Suspense>
}
