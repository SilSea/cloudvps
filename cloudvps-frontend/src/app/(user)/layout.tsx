import { LayoutDashboard, Server, CreditCard, ClipboardList, User, Ticket } from "lucide-react"
import { AppShell } from "@/components/shared/app-shell"

const navItems = [
  { href: "/dashboard", icon: <LayoutDashboard className="h-4 w-4" />, label: "Dashboard" },
  { href: "/vps", icon: <Server className="h-4 w-4" />, label: "VPS ของฉัน" },
  { href: "/billing/orders/new", icon: <CreditCard className="h-4 w-4" />, label: "สั่งซื้อ", exact: true },
  { href: "/billing/orders", icon: <ClipboardList className="h-4 w-4" />, label: "ประวัติสั่งซื้อ", exact: true },
  { href: "/tickets", icon: <Ticket className="h-4 w-4" />, label: "Support" },
  { href: "/profile", icon: <User className="h-4 w-4" />, label: "โปรไฟล์" },
]

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return <AppShell navItems={navItems}>{children}</AppShell>
}
