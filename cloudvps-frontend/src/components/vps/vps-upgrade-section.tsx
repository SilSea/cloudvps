"use client"

import { useState, useMemo } from "react"
import { ArrowUpCircle, Package, Sliders, Loader2, ChevronDown, ChevronUp, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Pagination } from "@/components/shared/pagination"
import { usePackages, usePackageCategories } from "@/hooks/usePackages"
import { useUpgradePackage, useUpgradeCustom, useUpgradeHistory, usePricing } from "@/hooks/useProfile"
import { usePagination } from "@/hooks/usePagination"
import { formatCurrency, formatDate, parseGib, parseDiskGb } from "@/lib/utils"
import type { UpgradeCustomInput, UpgradePackageInput, UpgradeResult, UpgradeHistoryResponse } from "@/services/api/upgrade"
import type { Vps } from "@/types/vps"
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query"

const PAGE_SIZE = 5

// Mirrors backend upgrade.service.ts custom-upgrade charge formula exactly (docs/frontend.md
// §14) — only positive deltas are billed, prorated by days remaining in the current period.
// Disk can never shrink (backend rejects with DISK_SHRINK_NOT_ALLOWED), so its delta clamp
// to 0 doubles as that guard on the display side.
function calcUpgradePreview(
  current: { cores: number; memory_gib: number; disk_gb: number },
  after: { cores: number; memory_gib: number; disk_gb: number },
  pricing: { cpu_per_core: number; ram_per_gib: number; disk_per_gb: number },
  expiredAt: string,
) {
  const daysRemaining = Math.max(0, Math.ceil((new Date(expiredAt).getTime() - Date.now()) / 86_400_000))
  const factor = daysRemaining / 30
  const cpuCharge = Math.max(0, after.cores - current.cores) * pricing.cpu_per_core * factor
  const ramCharge = Math.max(0, after.memory_gib - current.memory_gib) * pricing.ram_per_gib * factor
  const diskCharge = Math.max(0, after.disk_gb - current.disk_gb) * pricing.disk_per_gb * factor
  return { daysRemaining, cpuCharge, ramCharge, diskCharge, total: Math.ceil(cpuCharge + ramCharge + diskCharge) }
}

interface UpgradeHooks {
  upgradePackage: UseMutationResult<UpgradeResult, Error, UpgradePackageInput>
  upgradeCustom: UseMutationResult<UpgradeResult, Error, UpgradeCustomInput>
  historyQuery: UseQueryResult<UpgradeHistoryResponse>
}

interface Props {
  vps: Vps
  allowDowngrade?: boolean
  hooks?: UpgradeHooks
}

type SortMode = "closest" | "price_asc" | "price_desc"

export function VpsUpgradeSection({ vps, allowDowngrade = false, hooks }: Props) {
  const [tab, setTab] = useState<"package" | "custom">("package")
  const [showHistory, setShowHistory] = useState(false)
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null)
  const [customSpec, setCustomSpec] = useState<UpgradeCustomInput>({})

  // filters
  const [search, setSearch] = useState("")
  const [filterIp, setFilterIp] = useState<"all" | "public" | "nat">("all")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [sortBy, setSortBy] = useState<SortMode>("closest")

  const { data: packages = [] } = usePackages()
  const { data: categories = [] } = usePackageCategories()
  const { data: pricing, isLoading: pricingLoading } = usePricing()

  const defaultUpgradePackage = useUpgradePackage(vps.id)
  const defaultUpgradeCustom = useUpgradeCustom(vps.id)
  const defaultHistoryQuery = useUpgradeHistory(vps.id)

  const upgradePackage = hooks?.upgradePackage ?? defaultUpgradePackage
  const upgradeCustom = hooks?.upgradeCustom ?? defaultUpgradeCustom
  const { data: historyData } = hooks?.historyQuery ?? defaultHistoryQuery
  const history = historyData?.logs ?? []

  const isPending = upgradePackage.isPending || upgradeCustom.isPending
  const selectedPkgUnavailable = selectedPackageId != null &&
    packages.find((p) => p.id === selectedPackageId)?.available === false

  const currentCores = vps.current_cores
  const currentMemGib = vps.current_memory_gib
  const currentDiskGb = vps.current_disk_gb
  const currentPackageId = vps.order.packages_id

  const customAfter = {
    cores: customSpec.cores ?? currentCores,
    memory_gib: customSpec.memory_gib ?? currentMemGib,
    disk_gb: customSpec.disk_gb ?? currentDiskGb,
  }
  const hasCustomChange = customAfter.cores !== currentCores || customAfter.memory_gib !== currentMemGib || customAfter.disk_gb !== currentDiskGb
  // Backend rejects disk shrink unconditionally (DISK_SHRINK_NOT_ALLOWED) — the input's
  // `min` attribute doesn't stop typed/pasted values, so validate here too
  const diskShrink = customAfter.disk_gb < currentDiskGb
  const specBelowCurrent = !allowDowngrade &&
    (customAfter.cores < currentCores || customAfter.memory_gib < currentMemGib)
  const customInvalid = diskShrink || specBelowCurrent
  const customPreview = pricing && pricing.cpu_per_core != null && pricing.ram_per_gib != null && pricing.disk_per_gb != null
    ? calcUpgradePreview(
        { cores: currentCores, memory_gib: currentMemGib, disk_gb: currentDiskGb },
        customAfter,
        { cpu_per_core: pricing.cpu_per_core, ram_per_gib: pricing.ram_per_gib, disk_per_gb: pricing.disk_per_gb },
        vps.expired_at,
      )
    : null

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    const eligible = packages.filter((p) => {
      if (p.id === currentPackageId) return false
      if (!allowDowngrade) {
        const core = p.vm.core
        const memGib = parseGib(p.vm.memory)
        const diskGb = parseDiskGb(p.vm.size)
        if (core < currentCores) return false
        if (memGib < currentMemGib) return false
        if (diskGb < currentDiskGb) return false
        // same spec in every dimension (e.g. an OS-variant sibling of the current
        // package, REQ-F3.8/F3.9) is not an upgrade — hide it, not just the exact row
        if (core === currentCores && memGib === currentMemGib && diskGb === currentDiskGb) return false
      }
      if (q && !p.name.toLowerCase().includes(q)) return false
      if (filterIp === "public" && p.port_count !== null) return false
      if (filterIp === "nat" && p.port_count === null) return false
      if (filterCategory !== "all") {
        if (filterCategory === "none" && p.category !== null) return false
        if (filterCategory !== "none" && p.category?.id !== Number(filterCategory)) return false
      }
      return true
    })

    return eligible.sort((a, b) => {
      if (sortBy === "price_asc") return a.price - b.price
      if (sortBy === "price_desc") return b.price - a.price
      // closest: sum of relative spec deltas (lower = more similar)
      const score = (p: typeof a) =>
        (p.vm.core - currentCores) / Math.max(currentCores, 1) +
        (parseGib(p.vm.memory) - currentMemGib) / Math.max(currentMemGib, 1) +
        (parseDiskGb(p.vm.size) - currentDiskGb) / Math.max(currentDiskGb, 1)
      return score(a) - score(b)
    })
  }, [packages, currentPackageId, currentCores, currentMemGib, currentDiskGb, allowDowngrade, search, filterIp, filterCategory, sortBy])

  const { page, setPage, totalPages, paginated, total } = usePagination(
    filtered,
    PAGE_SIZE,
    `${search}:${filterIp}:${filterCategory}:${sortBy}`,
  )

  const handlePackageUpgrade = () => {
    if (!selectedPackageId) return
    upgradePackage.mutate({ package_id: selectedPackageId })
  }

  const handleCustomUpgrade = () => {
    const hasSpec = customSpec.cores || customSpec.memory_gib || customSpec.disk_gb
    if (!hasSpec || customInvalid) return
    upgradeCustom.mutate(customSpec)
  }

  return (
    <div className="bg-surface border border-border rounded-[8px] p-5 space-y-4">
      <div className="flex items-center gap-2">
        <ArrowUpCircle className="h-5 w-5 text-primary" />
        <h2 className="font-medium text-text-primary">
          {allowDowngrade ? "เปลี่ยนสเปค / แพ็กเกจ" : "อัปเกรด & เปลี่ยนแพ็กเกจ"}
        </h2>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={tab === "package" ? "default" : "outline"}
          className="rounded-[9999px] gap-1"
          onClick={() => setTab("package")}
        >
          <Package className="h-3.5 w-3.5" /> แพ็กเกจ
        </Button>
        <Button
          size="sm"
          variant={tab === "custom" ? "default" : "outline"}
          className="rounded-[9999px] gap-1"
          onClick={() => setTab("custom")}
        >
          <Sliders className="h-3.5 w-3.5" /> กำหนดเอง
        </Button>
      </div>

      {tab === "package" && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาแพ็กเกจ..."
                className="pl-8 h-8 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-8 text-xs w-[140px]">
                  <SelectValue placeholder="หมวดหมู่" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">หมวดหมู่ทั้งหมด</SelectItem>
                  <SelectItem value="none">ไม่มีหมวดหมู่</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterIp} onValueChange={(v) => setFilterIp(v as typeof filterIp)}>
                <SelectTrigger className="h-8 text-xs w-[120px]">
                  <SelectValue placeholder="ประเภท IP" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">IP ทั้งหมด</SelectItem>
                  <SelectItem value="public">Public IP</SelectItem>
                  <SelectItem value="nat">NAT</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortMode)}>
                <SelectTrigger className="h-8 text-xs w-[140px]">
                  <SelectValue placeholder="เรียงตาม" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="closest">ใกล้เคียงที่สุด</SelectItem>
                  <SelectItem value="price_asc">ราคา ต่ำ→สูง</SelectItem>
                  <SelectItem value="price_desc">ราคา สูง→ต่ำ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Package list */}
          {total === 0 ? (
            <p className="text-sm text-text-secondary py-2">ไม่พบแพ็กเกจที่ตรงเงื่อนไข</p>
          ) : (
            <>
              <div className="space-y-2">
                {paginated.map((pkg) => {
                  const coreDiff = pkg.vm.core - currentCores
                  const memDiff = parseGib(pkg.vm.memory) - currentMemGib
                  const diskDiff = parseDiskGb(pkg.vm.size) - currentDiskGb
                  return (
                    <button
                      key={pkg.id}
                      onClick={() => pkg.available !== false && setSelectedPackageId(pkg.id)}
                      disabled={pkg.available === false}
                      className={`w-full text-left p-3 border rounded-[8px] transition-colors ${
                        pkg.available === false
                          ? "border-border opacity-50 cursor-not-allowed"
                          : selectedPackageId === pkg.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-text-primary text-sm truncate">{pkg.name}</p>
                            {pkg.available === false && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-[4px] bg-border text-text-secondary">
                                ทรัพยากรไม่เพียงพอ
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-text-secondary mt-0.5">
                            {pkg.vm.core} vCPU · {parseGib(pkg.vm.memory)} GB RAM · {parseDiskGb(pkg.vm.size)} GB Disk
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {coreDiff !== 0 && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-[4px] ${coreDiff > 0 ? "text-accent-green bg-accent-green/10" : "text-secondary bg-secondary/10"}`}>
                                {coreDiff > 0 ? "+" : ""}{coreDiff} vCPU
                              </span>
                            )}
                            {memDiff !== 0 && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-[4px] ${memDiff > 0 ? "text-accent-green bg-accent-green/10" : "text-secondary bg-secondary/10"}`}>
                                {memDiff > 0 ? "+" : ""}{memDiff} GB RAM
                              </span>
                            )}
                            {diskDiff !== 0 && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-[4px] ${diskDiff > 0 ? "text-accent-green bg-accent-green/10" : "text-secondary bg-secondary/10"}`}>
                                {diskDiff > 0 ? "+" : ""}{diskDiff} GB Disk
                              </span>
                            )}
                            <span className="text-[10px] text-text-secondary bg-border/50 px-1.5 py-0.5 rounded-[4px]">
                              {pkg.port_count !== null ? "NAT" : "Public IP"}
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-primary shrink-0">{formatCurrency(pkg.price)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />

              {selectedPkgUnavailable && (
                <p className="text-xs text-secondary text-center">แพ็กเกจนี้ไม่สามารถอัปเกรดได้ขณะนี้ — ทรัพยากร Proxmox ไม่เพียงพอ</p>
              )}
              <Button
                className="w-full rounded-[9999px]"
                disabled={!selectedPackageId || isPending || selectedPkgUnavailable}
                onClick={handlePackageUpgrade}
              >
                {upgradePackage.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {allowDowngrade ? "เปลี่ยนแพ็กเกจ" : "อัปเกรดแพ็กเกจ"}
              </Button>
            </>
          )}
        </div>
      )}

      {tab === "custom" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">CPU (cores) — ปัจจุบัน {currentCores}</Label>
              <Input
                type="number"
                placeholder={String(currentCores)}
                min={allowDowngrade ? 1 : currentCores}
                onChange={(e) => setCustomSpec((s) => ({ ...s, cores: e.target.valueAsNumber || undefined }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">RAM (GB) — ปัจจุบัน {currentMemGib}</Label>
              <Input
                type="number"
                placeholder={String(currentMemGib)}
                min={allowDowngrade ? 1 : currentMemGib}
                onChange={(e) => setCustomSpec((s) => ({ ...s, memory_gib: e.target.valueAsNumber || undefined }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Disk (GB) — ปัจจุบัน {currentDiskGb}</Label>
              <Input
                type="number"
                placeholder={String(currentDiskGb)}
                min={allowDowngrade ? 1 : currentDiskGb}
                onChange={(e) => setCustomSpec((s) => ({ ...s, disk_gb: e.target.valueAsNumber || undefined }))}
              />
            </div>
          </div>

          {hasCustomChange && customInvalid && (
            <p className="text-xs text-secondary">
              {diskShrink ? "ลดขนาด Disk ไม่ได้ — กรอกได้เฉพาะเท่าเดิมหรือมากกว่า" : "CPU/RAM ต้องไม่ต่ำกว่าสเปคปัจจุบัน"}
            </p>
          )}

          {hasCustomChange && !customInvalid && (
            customPreview ? (
              <div className="bg-background border border-border rounded-[8px] p-3 space-y-1.5 text-xs">
                {customPreview.cpuCharge > 0 && (
                  <div className="flex justify-between text-text-secondary">
                    <span>CPU +{customAfter.cores - currentCores} core</span>
                    <span>+{formatCurrency(customPreview.cpuCharge)}</span>
                  </div>
                )}
                {customPreview.ramCharge > 0 && (
                  <div className="flex justify-between text-text-secondary">
                    <span>RAM +{customAfter.memory_gib - currentMemGib} GB</span>
                    <span>+{formatCurrency(customPreview.ramCharge)}</span>
                  </div>
                )}
                {customPreview.diskCharge > 0 && (
                  <div className="flex justify-between text-text-secondary">
                    <span>Disk +{customAfter.disk_gb - currentDiskGb} GB</span>
                    <span>+{formatCurrency(customPreview.diskCharge)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1.5 border-t border-border font-bold text-text-primary">
                  <span>ยอดชำระโดยประมาณ (เหลือ {customPreview.daysRemaining} วัน)</span>
                  <span className="text-primary">{formatCurrency(customPreview.total)}</span>
                </div>
                <p className="text-[10px] text-text-secondary">ราคาสุดท้ายคำนวณจริงตอนกดยืนยัน</p>
              </div>
            ) : pricingLoading ? (
              <p className="text-xs text-text-secondary">กำลังโหลดราคา...</p>
            ) : (
              <p className="text-xs text-text-secondary">ยังไม่เปิดใช้งาน custom upgrade — Admin ยังไม่ได้ตั้งค่าราคา</p>
            )
          )}

          <Button
            className="w-full rounded-[9999px]"
            disabled={(!customSpec.cores && !customSpec.memory_gib && !customSpec.disk_gb) || isPending || customInvalid}
            onClick={handleCustomUpgrade}
          >
            {upgradeCustom.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {allowDowngrade ? "เปลี่ยนสเปค" : "อัปเกรด"}
          </Button>
        </div>
      )}

      {history.length > 0 && (
        <div className="pt-3 border-t border-border">
          <button
            className="flex items-center gap-1 text-sm text-text-secondary hover:text-primary"
            onClick={() => setShowHistory((v) => !v)}
          >
            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            ประวัติอัปเกรด ({history.length})
          </button>
          {showHistory && (
            <div className="mt-3 space-y-2">
              {history.map((log) => (
                <div key={log.id} className="text-xs text-text-secondary border border-border rounded-[6px] p-2">
                  <div className="flex justify-between">
                    <span>{formatDate(log.created_at)}</span>
                    <span className="font-medium text-text-primary">{formatCurrency(log.amount_charged)}</span>
                  </div>
                  <p className="mt-0.5">
                    {log.before_cores}→{log.after_cores} vCPU · {log.before_memory_gib}→{log.after_memory_gib} GB · {log.before_disk_gb}→{log.after_disk_gb} GB
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
