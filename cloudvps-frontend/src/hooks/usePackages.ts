"use client"

import { useQuery } from "@tanstack/react-query"
import { PackageService } from "@/services/api/packages"

export function usePackages(categoryId?: number) {
  return useQuery({
    queryKey: ["packages", { categoryId }],
    queryFn: () => PackageService.list(categoryId),
  })
}

export function usePackageCategories() {
  return useQuery({
    queryKey: ["package-categories"],
    queryFn: () => PackageService.getCategories(),
    select: (data) => [...data].sort((a, b) => a.name.localeCompare(b.name)),
  })
}

export function usePackage(id: number) {
  return useQuery({
    queryKey: ["packages", id],
    queryFn: () => PackageService.getById(id),
    enabled: !!id,
  })
}
