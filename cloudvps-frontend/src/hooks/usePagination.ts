"use client"

import { useState, useMemo } from "react"

export const DEFAULT_PAGE_SIZE = 10

export function usePagination<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE, resetKey: unknown = "") {
  const [page, setPage] = useState(1)
  const [prevKey, setPrevKey] = useState(resetKey)

  if (prevKey !== resetKey) {
    setPrevKey(resetKey)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const effectivePage = Math.min(page, totalPages)

  const paginated = useMemo(
    () => items.slice((effectivePage - 1) * pageSize, effectivePage * pageSize),
    [items, effectivePage, pageSize],
  )

  return { page: effectivePage, setPage, totalPages, paginated, total: items.length }
}
