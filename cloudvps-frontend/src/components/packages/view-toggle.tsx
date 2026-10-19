"use client"

import { LayoutGrid, LayoutList } from "lucide-react"
import { Button } from "@/components/ui/button"

export type ViewMode = "grid" | "list"

interface Props {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
}

export function ViewToggle({ mode, onChange }: Props) {
  return (
    <div className="flex items-center border border-border rounded-[6px] overflow-hidden">
      <Button
        variant="ghost"
        size="sm"
        className={`rounded-none h-8 w-8 p-0 ${mode === "grid" ? "bg-background text-text-primary" : "text-text-secondary"}`}
        onClick={() => onChange("grid")}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`rounded-none h-8 w-8 p-0 ${mode === "list" ? "bg-background text-text-primary" : "text-text-secondary"}`}
        onClick={() => onChange("list")}
      >
        <LayoutList className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
