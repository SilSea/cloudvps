import { PackageCard } from "./package-card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Package } from "@/types/package"

interface Props {
  packages: Package[]
  isLoading?: boolean
}

export function PackageGrid({ packages, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[200px] rounded-[8px]" />
        ))}
      </div>
    )
  }

  if (!packages.length) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary">ไม่พบแพ็กเกจในหมวดหมู่นี้</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
      {packages.map((pkg) => (
        <PackageCard key={pkg.id} pkg={pkg} />
      ))}
    </div>
  )
}
