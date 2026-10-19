import Link from "next/link"
import { Button } from "@/components/ui/button"
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="h-[56px] bg-surface border-b border-border flex items-center px-6 gap-6 sticky top-0 z-40">
        <Link href="/" className="text-[18px] font-bold text-text-primary shrink-0">
          Quest<span className="text-primary">Cloud</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="/packages"
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary rounded-[6px] hover:bg-background transition-colors"
          >
            แพ็กเกจ
          </Link>
          <Link
            href="/about"
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary rounded-[6px] hover:bg-background transition-colors"
          >
            เกี่ยวกับเรา
          </Link>
          <Link
            href="/contact"
            className="px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary rounded-[6px] hover:bg-background transition-colors"
          >
            ติดต่อเรา
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-[9999px]">
            <Link href="/login">เข้าสู่ระบบ</Link>
          </Button>
          <Button asChild size="sm" className="rounded-[9999px]">
            <Link href="/register">สมัครสมาชิก</Link>
          </Button>
        </div>
      </header>
      {children}
    </div>
  )
}
