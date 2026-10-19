"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/useAuth"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  icon: React.ReactNode
  label: string
  exact?: boolean
  activeWhen?: string[]
}

interface Props {
  navItems: NavItem[]
  children: React.ReactNode
}

export function AppShell({ navItems, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuth()

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 w-[240px] bg-surface border-r border-border flex flex-col transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:z-auto",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="h-[48px] flex items-center px-4 border-b border-border">
          <span className="text-[18px] font-bold text-text-primary">
            Quest<span className="text-primary">Cloud</span>
          </span>
          <button
            className="ml-auto lg:hidden p-1 rounded text-text-secondary hover:text-text-primary"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLinkItem key={item.href} {...item} activeWhen={item.activeWhen} onNavigate={() => setSidebarOpen(false)} />
          ))}

        </nav>

        <div className="p-3 border-t border-border">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-text-primary truncate">{user?.email}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 text-text-secondary hover:text-secondary rounded-[8px]"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            ออกจากระบบ
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-[48px] bg-surface border-b border-border flex items-center px-4 lg:hidden shrink-0">
          <button
            className="p-1 rounded text-text-secondary hover:text-text-primary"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="ml-3 text-[16px] font-bold text-text-primary">
            Quest<span className="text-primary">Cloud</span>
          </span>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  )
}

function NavLinkItem({
  href,
  icon,
  label,
  exact,
  activeWhen,
  onNavigate,
}: {
  href: string
  icon: React.ReactNode
  label: string
  exact?: boolean
  activeWhen?: string[]
  onNavigate: () => void
}) {
  const pathname = usePathname()
  const selfActive = exact ? pathname === href : (pathname === href || pathname.startsWith(href + "/"))
  const extraActive = activeWhen?.some((p) => pathname === p || pathname.startsWith(p + "/")) ?? false
  const active = selfActive || extraActive

  return (
    <Link
      href={href}
      onClick={onNavigate}
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
