"use client"

import { cn } from "@/lib/utils"
import type { PackageCategory } from "@/types/package"

interface Props {
  categories: PackageCategory[]
  selected: number | undefined
  onChange: (id: number | undefined) => void
}

export function PackageFilter({ categories, selected, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange(undefined)}
        className={cn(
          "h-[28px] px-3 rounded-[9999px] text-sm font-medium transition-colors",
          selected === undefined
            ? "bg-primary text-white"
            : "bg-surface border border-border text-text-primary hover:border-primary",
        )}
      >
        ทั้งหมด
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onChange(cat.id)}
          className={cn(
            "h-[28px] px-3 rounded-[9999px] text-sm font-medium transition-colors",
            selected === cat.id
              ? "bg-primary text-white"
              : "bg-surface border border-border text-text-primary hover:border-primary",
          )}
        >
          {cat.name}
        </button>
      ))}
    </div>
  )
}
