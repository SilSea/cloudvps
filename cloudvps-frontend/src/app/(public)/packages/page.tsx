"use client"

import { useState } from "react"
import { Package, Globe, Network, Search, X, Cpu, Monitor, MemoryStick, HardDrive } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PackageCard } from "@/components/packages/package-card"
import { PackageListItem } from "@/components/packages/package-list-item"
import { ViewToggle, type ViewMode } from "@/components/packages/view-toggle"
import { Skeleton } from "@/components/ui/skeleton"
import { usePackages, usePackageCategories } from "@/hooks/usePackages"
import { formatCurrency, parseGib, parseDiskGb } from "@/lib/utils"

const PAGE_SIZE = 10

export default function PackagesPage() {
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>()
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [showMorePublic, setShowMorePublic] = useState(false)
  const [showMorePrivate, setShowMorePrivate] = useState(false)
  const [filterOs, setFilterOs] = useState<string>("")
  const [filterIpType, setFilterIpType] = useState<"all" | "public" | "private">("all")
  const [filterSpec, setFilterSpec] = useState<string>("")
  const [filterRam, setFilterRam] = useState<string>("")
  const [filterDisk, setFilterDisk] = useState<string>("")

  const { data: packages = [], isLoading } = usePackages(selectedCategory)
  const { data: categories = [] } = usePackageCategories()

  const osNames = [...new Set(packages.map((p) => p.os.os_name))].sort()
  const coreValues = [...new Set(packages.map((p) => p.vm.core))].sort((a, b) => a - b)
  const ramValues = [...new Set(packages.map((p) => parseGib(p.vm.memory)))].sort((a, b) => a - b)
  const diskValues = [...new Set(packages.map((p) => parseDiskGb(p.vm.size)))].sort((a, b) => a - b)

  function resetPages() {
    setShowMorePublic(false)
    setShowMorePrivate(false)
  }

  const q = searchQuery.trim().toLowerCase()
  const searched = q
    ? packages.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.category?.name.toLowerCase().includes(q),
      )
    : packages
  const active = searched
    .filter((p) => !filterOs || p.os.os_name === filterOs)
    .filter((p) =>
      filterIpType === "all" ? true : filterIpType === "public" ? p.port_count === null : p.port_count !== null,
    )
    .filter((p) => !filterSpec || p.vm.core === Number(filterSpec))
    .filter((p) => !filterRam || parseGib(p.vm.memory) === Number(filterRam))
    .filter((p) => !filterDisk || parseDiskGb(p.vm.size) === Number(filterDisk))

  const publicIp = active.filter((p) => p.port_count === null)
  const privateIp = active.filter((p) => p.port_count !== null)
  const minPrice = active.length ? Math.min(...active.map((p) => p.price)) : null
  const hasActiveFilter = selectedCategory !== undefined || q || filterOs || filterSpec || filterRam || filterDisk

  const visiblePublic = showMorePublic ? publicIp : publicIp.slice(0, PAGE_SIZE)
  const visiblePrivate = showMorePrivate ? privateIp : privateIp.slice(0, PAGE_SIZE)

  function renderPackages(list: typeof active, hrefFn?: (id: number) => string) {
    if (viewMode === "grid") {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {list.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} href={hrefFn?.(pkg.id)} />
          ))}
        </div>
      )
    }
    return (
      <div className="space-y-2">
        {list.map((pkg) => (
          <PackageListItem key={pkg.id} pkg={pkg} href={hrefFn?.(pkg.id)} />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 py-10">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[9999px] bg-primary/10 text-primary text-xs font-medium mb-4">
          <Package className="h-3.5 w-3.5" /> {active.length} แพ็กเกจ
        </div>
        <h1 className="text-[32px] font-bold text-text-primary mb-2">แพ็กเกจ VPS ทั้งหมด</h1>
        <p className="text-text-secondary">
          เริ่มต้น{minPrice ? ` ${formatCurrency(minPrice)}/เดือน` : ""} · ไม่มีค่าติดตั้ง · ยกเลิกได้ทุกเมื่อ
        </p>
      </div>

      {/* IP type summary */}
      {!isLoading && active.length > 0 && (
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          <div className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-[8px] text-sm">
            <Globe className="h-4 w-4 text-accent-green" />
            <span className="text-text-secondary">Public IP</span>
            <Badge variant="outline" className="rounded-[9999px] text-xs">{publicIp.length} แพ็กเกจ</Badge>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-[8px] text-sm">
            <Network className="h-4 w-4 text-accent-yellow" />
            <span className="text-text-secondary">Private IP (NAT)</span>
            <Badge variant="outline" className="rounded-[9999px] text-xs">{privateIp.length} แพ็กเกจ</Badge>
          </div>
        </div>
      )}

      {/* Search input */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-secondary pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); resetPages() }}
          placeholder="ค้นหาแพ็กเกจ หรือหมวดหมู่..."
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filters (single row) + view toggle */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3 overflow-x-auto py-1">
          {/* Category */}
          {categories.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Package className="h-3.5 w-3.5 text-text-secondary shrink-0" />
              <Select
                value={selectedCategory !== undefined ? String(selectedCategory) : "all"}
                onValueChange={(v) => { setSelectedCategory(v === "all" ? undefined : Number(v)); resetPages() }}
              >
                <SelectTrigger className="h-[28px] w-[160px] rounded-[9999px] text-sm">
                  <SelectValue placeholder="หมวดหมู่" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">หมวดหมู่ทั้งหมด</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* IP type */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Globe className="h-3.5 w-3.5 text-text-secondary shrink-0" />
            <Select
              value={filterIpType}
              onValueChange={(v) => { setFilterIpType(v as typeof filterIpType); resetPages() }}
            >
              <SelectTrigger className="h-[28px] w-[130px] rounded-[9999px] text-sm">
                <SelectValue placeholder="IP type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">IP ทั้งหมด</SelectItem>
                <SelectItem value="public">Public IP</SelectItem>
                <SelectItem value="private">Private IP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* OS */}
          {osNames.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Monitor className="h-3.5 w-3.5 text-text-secondary shrink-0" />
              <Select
                value={filterOs || "all"}
                onValueChange={(v) => { setFilterOs(v === "all" ? "" : v); resetPages() }}
              >
                <SelectTrigger className="h-[28px] w-[140px] rounded-[9999px] text-sm">
                  <SelectValue placeholder="OS" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">OS ทั้งหมด</SelectItem>
                  {osNames.map((os) => (
                    <SelectItem key={os} value={os}>{os}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* vCPU spec */}
          {coreValues.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <Cpu className="h-3.5 w-3.5 text-text-secondary shrink-0" />
              <Select
                value={filterSpec || "all"}
                onValueChange={(v) => { setFilterSpec(v === "all" ? "" : v); resetPages() }}
              >
                <SelectTrigger className="h-[28px] w-[120px] rounded-[9999px] text-sm">
                  <SelectValue placeholder="vCPU" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">vCPU ทั้งหมด</SelectItem>
                  {coreValues.map((c) => (
                    <SelectItem key={c} value={String(c)}>{c} vCPU</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* RAM */}
          {ramValues.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <MemoryStick className="h-3.5 w-3.5 text-text-secondary shrink-0" />
              <Select
                value={filterRam || "all"}
                onValueChange={(v) => { setFilterRam(v === "all" ? "" : v); resetPages() }}
              >
                <SelectTrigger className="h-[28px] w-[120px] rounded-[9999px] text-sm">
                  <SelectValue placeholder="RAM" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">RAM ทั้งหมด</SelectItem>
                  {ramValues.map((r) => (
                    <SelectItem key={r} value={String(r)}>{r} GB</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Disk */}
          {diskValues.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <HardDrive className="h-3.5 w-3.5 text-text-secondary shrink-0" />
              <Select
                value={filterDisk || "all"}
                onValueChange={(v) => { setFilterDisk(v === "all" ? "" : v); resetPages() }}
              >
                <SelectTrigger className="h-[28px] w-[120px] rounded-[9999px] text-sm">
                  <SelectValue placeholder="Disk" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Disk ทั้งหมด</SelectItem>
                  {diskValues.map((d) => (
                    <SelectItem key={d} value={String(d)}>{d} GB</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Active filter indicator */}
          {(filterOs || filterSpec || filterRam || filterDisk || filterIpType !== "all") && (
            <button
              onClick={() => { setFilterOs(""); setFilterSpec(""); setFilterRam(""); setFilterDisk(""); setFilterIpType("all"); resetPages() }}
              className="flex items-center gap-1 h-[28px] px-3 rounded-[9999px] text-xs text-text-secondary border border-border hover:border-primary bg-surface transition-colors shrink-0"
            >
              <X className="h-3 w-3" /> ล้างตัวกรอง
            </button>
          )}
        </div>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[210px] rounded-[8px]" />
          ))}
        </div>
      ) : active.length === 0 ? (
        <div className="text-center py-20">
          <Package className="h-12 w-12 text-border mx-auto mb-4" />
          <p className="text-text-secondary">ไม่พบแพ็กเกจที่ตรงกับตัวกรอง</p>
        </div>
      ) : hasActiveFilter ? (
        /* Flat list when any filter active */
        renderPackages(active)
      ) : (
        /* Sectioned by IP type */
        <>
          {publicIp.length > 0 && (
            <div className="mb-10">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="h-4 w-4 text-accent-green" />
                <h2 className="font-medium text-text-primary">Public IP</h2>
                <span className="text-xs text-text-secondary">— IP จริง ไม่ผ่าน NAT</span>
              </div>
              {renderPackages(visiblePublic)}
              {publicIp.length > PAGE_SIZE && (
                <div className="text-center mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-[9999px]"
                    onClick={() => setShowMorePublic(!showMorePublic)}
                  >
                    {showMorePublic ? "แสดงน้อยลง" : `แสดงเพิ่มเติม (${publicIp.length - PAGE_SIZE} แพ็กเกจ)`}
                  </Button>
                </div>
              )}
            </div>
          )}

          {privateIp.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Network className="h-4 w-4 text-accent-yellow" />
                <h2 className="font-medium text-text-primary">Private IP (NAT)</h2>
                <span className="text-xs text-text-secondary">— แชร์ Public IP + Port Block</span>
              </div>
              {renderPackages(visiblePrivate)}
              {privateIp.length > PAGE_SIZE && (
                <div className="text-center mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-[9999px]"
                    onClick={() => setShowMorePrivate(!showMorePrivate)}
                  >
                    {showMorePrivate ? "แสดงน้อยลง" : `แสดงเพิ่มเติม (${privateIp.length - PAGE_SIZE} แพ็กเกจ)`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
