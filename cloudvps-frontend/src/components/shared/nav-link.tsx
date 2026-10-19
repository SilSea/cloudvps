"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

interface Props {
  href: string
  icon: React.ReactNode
  label: string
}

export function NavLink({ href, icon, label }: Props) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(href + "/")

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-[8px] text-sm font-medium transition-colors",
        active
          ? "bg-primary text-white"
          : "text-text-secondary hover:bg-border hover:text-text-primary",
      )}
    >
      {icon}
      {label}
    </Link>
  )
}
