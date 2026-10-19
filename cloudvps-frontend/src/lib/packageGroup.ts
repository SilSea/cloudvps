import type { Package } from "@/types/package"

// Packages that share the same spec (vm/price/period/port_count/category) but
// differ only by os_id are treated as OS variants of the same offering (REQ-F3.8/F3.9).
// Pure frontend grouping — no backend/DB concept of a "package group" exists.

export function specKey(pkg: Package): string {
  return `${pkg.name}|${pkg.vm_id}|${pkg.price}|${pkg.period}|${pkg.port_count}|${pkg.category_id}`
}

export function osVariants(pkg: Package, allPackages: Package[]): Package[] {
  const key = specKey(pkg)
  return allPackages.filter((p) => specKey(p) === key).sort((a, b) => a.os.os_name.localeCompare(b.os.os_name))
}

export interface PackageGroup {
  key: string
  representative: Package
  variants: Package[]
}

export function groupPackages(packages: Package[]): PackageGroup[] {
  const map = new Map<string, Package[]>()
  for (const p of packages) {
    const key = specKey(p)
    const arr = map.get(key)
    if (arr) arr.push(p)
    else map.set(key, [p])
  }
  return [...map.entries()].map(([key, variants]) => ({
    key,
    representative: variants[0],
    variants: variants.sort((a, b) => a.os.os_name.localeCompare(b.os.os_name)),
  }))
}
