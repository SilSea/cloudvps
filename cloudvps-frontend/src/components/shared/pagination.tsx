"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, total, pageSize, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  const pages = getPageNumbers(page, totalPages)

  return (
    <div className="flex items-center justify-between pt-3 border-t border-border">
      <p className="text-xs text-text-secondary">{start}–{end} จาก {total} รายการ</p>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
          disabled={page === 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`dots-${i}`} className="text-xs text-text-secondary px-1">…</span>
          ) : (
            <Button key={p} size="sm"
              variant={page === p ? "default" : "ghost"}
              className="h-7 w-7 p-0 text-xs rounded-[9999px]"
              onClick={() => onPageChange(p as number)}>
              {p}
            </Button>
          ),
        )}
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
          disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const delta = 2
  const left = Math.max(2, current - delta)
  const right = Math.min(total - 1, current + delta)

  const range: number[] = []
  for (let i = left; i <= right; i++) range.push(i)

  const result: (number | "...")[] = [1]
  if (left > 2) result.push("...")
  result.push(...range)
  if (right < total - 1) result.push("...")
  result.push(total)

  return result
}
