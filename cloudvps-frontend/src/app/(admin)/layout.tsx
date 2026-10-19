import {
  LayoutDashboard,
  Users,
  Package,
  Server,
  ServerCog,
  ShoppingCart,
  CreditCard,
  Tag,
  FileText,
  Settings,
  Mail,
  Monitor,
  Network,
  Shield,
  Ticket,
} from "lucide-react"
import { AppShell } from "@/components/shared/app-shell"

const navItems = [
  // Overview
  { href: "/admin/dashboard", icon: <LayoutDashboard className="h-4 w-4" />, label: "Dashboard" },
  // Users
  { href: "/admin/users", icon: <Users className="h-4 w-4" />, label: "ผู้ใช้" },
  // Catalog
  { href: "/admin/packages", icon: <Package className="h-4 w-4" />, label: "แพ็กเกจ" },
  { href: "/admin/categories", icon: <Tag className="h-4 w-4" />, label: "หมวดหมู่" },
  { href: "/admin/os-vm", icon: <Monitor className="h-4 w-4" />, label: "OS & VM Specs" },
  { href: "/admin/ip-pools", icon: <Network className="h-4 w-4" />, label: "IP Pool" },
  // VPS
  { href: "/admin/vps", icon: <Server className="h-4 w-4" />, label: "VPS", exact: true },
  { href: "/admin/vps/queue", icon: <ServerCog className="h-4 w-4" />, label: "คิว Provision" },
  // Commerce
  { href: "/admin/orders", icon: <ShoppingCart className="h-4 w-4" />, label: "คำสั่งซื้อ" },
  { href: "/admin/transactions", icon: <CreditCard className="h-4 w-4" />, label: "ธุรกรรม" },
  { href: "/admin/promotions", icon: <Tag className="h-4 w-4" />, label: "โปรโมชั่น" },
  // Support
  { href: "/admin/tickets", icon: <Ticket className="h-4 w-4" />, label: "Tickets" },
  { href: "/admin/ticket-categories", icon: <Tag className="h-4 w-4" />, label: "Ticket Categories" },
  // System
  { href: "/admin/broadcasts", icon: <Mail className="h-4 w-4" />, label: "ส่งอีเมล" },
  { href: "/admin/email-templates", icon: <FileText className="h-4 w-4" />, label: "Email Templates" },
  { href: "/admin/policies", icon: <FileText className="h-4 w-4" />, label: "นโยบาย" },
  { href: "/admin/system-configs", icon: <Settings className="h-4 w-4" />, label: "ตั้งค่าระบบ" },
  { href: "/admin/audit-logs", icon: <Shield className="h-4 w-4" />, label: "Audit Log" },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell navItems={navItems}>{children}</AppShell>
}
