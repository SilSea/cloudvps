"use client"

import { useState } from "react"
import { Package, Globe, Network } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PackageCard } from "@/components/packages/package-card"
import { PackageListItem } from "@/components/packages/package-list-item"
import { ViewToggle, type ViewMode } from "@/components/packages/view-toggle"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { usePackages, usePackageCategories } from "@/hooks/usePackages"
import { formatCurrency, parseGib, parseDiskGb } from "@/lib/utils"

const PAGE_SIZE = 10

export default function SupportPackagesPage() {
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>()
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [showMorePublic, setShowMorePublic] = useState(false)
  const [showMorePrivate, setShowMorePrivate] = useState(false)
  const [filterOs, setFilterOs] = useState<string>("all")
  const [filterIpType, setFilterIpType] = useState<"all" | "public" | "private">("all")
  const [filterSpec, setFilterSpec] = useState<string>("all")
  const [filterRam, setFilterRam] = useState<string>("all")
  const [filterDisk, setFilterDisk] = useState<string>("all")

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

  const q = search.trim().toLowerCase()
  const active = packages
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.category?.name.toLowerCase().includes(q))
    .filter((p) => filterOs === "all" || p.os.os_name === filterOs)
    .filter((p) => filterIpType === "all" || (filterIpType === "public" ? p.port_count === null : p.port_count !== null))
    .filter((p) => filterSpec === "all" || p.vm.core === Number(filterSpec))
    .filter((p) => filterRam === "all" || parseGib(p.vm.memory) === Number(filterRam))
    .filter((p) => filterDisk === "all" || parseDiskGb(p.vm.size) === Number(filterDisk))

  const publicIp = active.filter((p) => p.port_count === null)
  const privateIp = active.filter((p) => p.port_count !== null)
  const minPrice = active.length ? Math.min(...active.map((p) => p.price)) : null
  const hasActiveFilter = selectedCategory !== undefined || q || filterOs !== "all" || filterSpec !== "all" || filterRam !== "all" || filterDisk !== "all" || filterIpType !== "all"

  const visiblePublic = showMorePublic ? publicIp : publicIp.slice(0, PAGE_SIZE)
  const visiblePrivate = showMorePrivate ? privateIp : privateIp.slice(0, PAGE_SIZE)

  function renderPackages(list: typeof active) {
    if (viewMode === "grid") {
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {list.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
        </div>
      )
    }
    return (
      <div className="space-y-2">
        {list.map((pkg) => <PackageListItem key={pkg.id} pkg={pkg} />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-text-primary">แพ็กเกจ</h1>
          <p className="text-sm text-text-secondary mt-0.5">ดูข้อมูลแพ็กเกจเพื่อเสนอลูกค้า</p>
        </div>
        <div className="flex items-center gap-3">
          {!isLoading && active.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border rounded-[8px] text-xs">
                <Globe className="h-3.5 w-3.5 text-accent-green" />
                <span className="text-text-secondary">Public IP</span>
                <Badge variant="outline" className="rounded-[9999px] text-xs">{publicIp.length}</Badge>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border rounded-[8px] text-xs">
                <Network className="h-3.5 w-3.5 text-accent-yellow" />
                <span className="text-text-secondary">Private IP</span>
                <Badge variant="outline" className="rounded-[9999px] text-xs">{privateIp.length}</Badge>
              </div>
            </>
          )}
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="ค้นหาแพ็กเกจ..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPages() }}
          className="px-3 py-2 text-sm border border-border rounded-[8px] bg-surface focus:outline-none focus:border-primary w-48"
        />
        {categories.length > 0 && (
          <Select value={selectedCategory !== undefined ? String(selectedCategory) : "all"} onValueChange={(v) => { setSelectedCategory(v === "all" ? undefined : Number(v)); resetPages() }}>
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="หมวดหมู่" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">หมวดหมู่ทั้งหมด</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={filterOs} onValueChange={(v) => { setFilterOs(v); resetPages() }}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue placeholder="OS" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">OS ทั้งหมด</SelectItem>
            {osNames.map((os) => <SelectItem key={os} value={os}>{os}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterIpType} onValueChange={(v) => { setFilterIpType(v as "all" | "public" | "private"); resetPages() }}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue placeholder="ประเภท IP" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">IP ทั้งหมด</SelectItem>
            <SelectItem value="public">Public IP</SelectItem>
            <SelectItem value="private">Private IP (NAT)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSpec} onValueChange={(v) => { setFilterSpec(v); resetPages() }}>
          <SelectTrigger className="w-[130px] h-9 text-sm">
            <SelectValue placeholder="vCPU" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">vCPU ทั้งหมด</SelectItem>
            {coreValues.map((c) => <SelectItem key={c} value={String(c)}>{c} vCPU</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterRam} onValueChange={(v) => { setFilterRam(v); resetPages() }}>
          <SelectTrigger className="w-[120px] h-9 text-sm">
            <SelectValue placeholder="RAM" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">RAM ทั้งหมด</SelectItem>
            {ramValues.map((r) => <SelectItem key={r} value={String(r)}>{r} GB RAM</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterDisk} onValueChange={(v) => { setFilterDisk(v); resetPages() }}>
          <SelectTrigger className="w-[130px] h-9 text-sm">
            <SelectValue placeholder="Disk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Disk ทั้งหมด</SelectItem>
            {diskValues.map((d) => <SelectItem key={d} value={String(d)}>{d} GB SSD</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && (
        <p className="text-xs text-text-secondary">{active.length} แพ็กเกจ{minPrice ? ` · เริ่มต้น ${formatCurrency(minPrice)}/เดือน` : ""}</p>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[210px] rounded-[8px]" />)}
        </div>
      ) : active.length === 0 ? (
        <div className="text-center py-20">
          <Package className="h-12 w-12 text-border mx-auto mb-4" />
          <p className="text-text-secondary">ไม่พบแพ็กเกจที่ตรงกับตัวกรอง</p>
        </div>
      ) : hasActiveFilter ? (
        renderPackages(active)
      ) : (
        <>
          {publicIp.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <Globe className="h-4 w-4 text-accent-green" />
                <h2 className="font-medium text-text-primary">Public IP</h2>
                <span className="text-xs text-text-secondary">— IP จริง ไม่ผ่าน NAT</span>
              </div>
              {renderPackages(visiblePublic)}
              {publicIp.length > PAGE_SIZE && (
                <div className="text-center mt-4">
                  <Button variant="outline" size="sm" className="rounded-[9999px]" onClick={() => setShowMorePublic(!showMorePublic)}>
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
                  <Button variant="outline" size="sm" className="rounded-[9999px]" onClick={() => setShowMorePrivate(!showMorePrivate)}>
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
