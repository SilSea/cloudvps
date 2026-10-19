"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, Globe, Network } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PackageCard } from "@/components/packages/package-card"
import { PackageListItem } from "@/components/packages/package-list-item"
import { ViewToggle, type ViewMode } from "@/components/packages/view-toggle"
import type { Package } from "@/types/package"

const PREVIEW_LIMIT = 10

interface Props {
  packages: Package[]
}

export function PackagesPreviewSection({ packages }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("grid")

  const active = packages.filter((p) => p.status === true)
  const publicIp = active.filter((p) => p.port_count === null).slice(0, PREVIEW_LIMIT)
  const privateIp = active.filter((p) => p.port_count !== null).slice(0, PREVIEW_LIMIT)

  if (active.length === 0) {
    return (
      <div className="text-center py-12 text-text-secondary text-sm">ยังไม่มีแพ็กเกจ</div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end">
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {/* Public IP section */}
      {publicIp.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-4 w-4 text-accent-green" />
            <h3 className="font-medium text-text-primary">Public IP</h3>
            <span className="text-xs text-text-secondary">— IP จริง ไม่ผ่าน NAT</span>
          </div>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {publicIp.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} href={`/register?packageId=${pkg.id}`} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {publicIp.map((pkg) => (
                <PackageListItem key={pkg.id} pkg={pkg} href={`/register?packageId=${pkg.id}`} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Private IP section */}
      {privateIp.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Network className="h-4 w-4 text-accent-yellow" />
            <h3 className="font-medium text-text-primary">Private IP (NAT)</h3>
            <span className="text-xs text-text-secondary">— แชร์ Public IP + Port Block</span>
          </div>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {privateIp.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} href={`/register?packageId=${pkg.id}`} />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {privateIp.map((pkg) => (
                <PackageListItem key={pkg.id} pkg={pkg} href={`/register?packageId=${pkg.id}`} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* See all button */}
      <div className="text-center pt-2">
        <Button asChild variant="outline" className="rounded-[9999px] px-8 gap-2">
          <Link href="/packages">
            ดูแพ็กเกจทั้งหมด <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
