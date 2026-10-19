import { LayoutDashboard, Users, Server, Package, CreditCard, ShoppingCart, Ticket } from "lucide-react"
import { AppShell } from "@/components/shared/app-shell"

const navItems = [
  { href: "/support", icon: <LayoutDashboard className="h-4 w-4" />, label: "Dashboard", exact: true },
  { href: "/support/tickets", icon: <Ticket className="h-4 w-4" />, label: "Tickets" },
  { href: "/support/users", icon: <Users className="h-4 w-4" />, label: "จัดการผู้ใช้" },
  { href: "/support/vps", icon: <Server className="h-4 w-4" />, label: "จัดการ VPS" },
  { href: "/support/packages", icon: <Package className="h-4 w-4" />, label: "แพ็กเกจ" },
  { href: "/support/orders", icon: <ShoppingCart className="h-4 w-4" />, label: "คำสั่งซื้อ" },
  { href: "/support/transactions", icon: <CreditCard className="h-4 w-4" />, label: "ธุรกรรม" },
]

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return <AppShell navItems={navItems}>{children}</AppShell>
}
