import Link from "next/link"
import { ArrowRight, Server, Shield, Zap, Headphones, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PackagesPreviewSection } from "@/components/packages/packages-preview-section"
import { PackageService } from "@/services/api/packages"

const FEATURES = [
  {
    icon: <Zap className="h-6 w-6 text-primary" />,
    title: "เปิดใช้งานทันที",
    desc: "VPS พร้อมใช้ภายในไม่กี่นาที ไม่ต้องรอนาน",
  },
  {
    icon: <Server className="h-6 w-6 text-accent-green" />,
    title: "Hardware คุณภาพสูง",
    desc: "CPU, RAM, SSD NVMe ระดับ Enterprise ประสิทธิภาพเสถียร",
  },
  {
    icon: <Shield className="h-6 w-6 text-secondary" />,
    title: "ปลอดภัย 100%",
    desc: "ระบบ Firewall และ Network Isolation แยกทรัพยากรอิสระ",
  },
  {
    icon: <Headphones className="h-6 w-6 text-accent-yellow" />,
    title: "Support 24/7",
    desc: "ทีมงานพร้อมช่วยเหลือตลอดเวลา ผ่าน Support Panel",
  },
]

const HIGHLIGHTS = [
  "ไม่มีค่าติดตั้ง",
  "ชำระราย 30 วัน",
  "ต่ออายุอัตโนมัติ",
  "Console เข้าถึงได้ทุกที่",
  "Public & NAT IP รองรับ",
  "Port Rules จัดการง่าย",
]

export default async function LandingPage() {
  const packages = await PackageService.list().catch(() => [])

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="px-4 pt-16 pb-20 text-center max-w-[800px] mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[9999px] bg-primary/10 text-primary text-xs font-medium mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          พร้อมให้บริการแล้ววันนี้
        </div>
        <h1 className="text-[40px] sm:text-[56px] font-bold text-text-primary leading-tight mb-4">
          VPS Cloud คุณภาพสูง<br />
          <span className="text-primary">ราคาที่เอื้อมถึง</span>
        </h1>
        <p className="text-[18px] text-text-secondary max-w-[500px] mx-auto mb-8">
          เริ่มต้น VPS ของคุณได้ทันที ควบคุมได้ผ่าน Dashboard จัดการง่าย ไม่ต้องมีความรู้เทคนิค
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild size="lg" className="rounded-[9999px] px-8 gap-2">
            <Link href="/register">
              เริ่มต้นฟรี <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-[9999px] px-8">
            <Link href="/packages">ดูแพ็กเกจทั้งหมด</Link>
          </Button>
        </div>
      </section>

      {/* Highlights strip */}
      <section className="border-y border-border bg-surface py-4 overflow-hidden">
        <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 px-4">
          {HIGHLIGHTS.map((h) => (
            <div key={h} className="flex items-center gap-1.5 text-sm text-text-secondary">
              <CheckCircle className="h-3.5 w-3.5 text-accent-green shrink-0" />
              {h}
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-16 max-w-[1200px] mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-[28px] font-bold text-text-primary mb-2">ทำไมต้อง CloudVPS?</h2>
          <p className="text-text-secondary">โครงสร้างพื้นฐานที่แข็งแกร่ง บริหารง่ายผ่าน Dashboard</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-surface border border-border rounded-[8px] p-5 space-y-3">
              <div className="w-10 h-10 rounded-[8px] bg-background flex items-center justify-center">
                {f.icon}
              </div>
              <h3 className="font-medium text-text-primary">{f.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Package preview */}
      <section className="px-4 py-16 bg-surface border-t border-border">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-[28px] font-bold text-text-primary mb-1">แพ็กเกจยอดนิยม</h2>
              <p className="text-text-secondary text-sm">เลือกสเปคที่ใช่สำหรับคุณ</p>
            </div>
          </div>
          <PackagesPreviewSection packages={packages} />
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-20 text-center">
        <div className="max-w-[480px] mx-auto space-y-5">
          <h2 className="text-[28px] font-bold text-text-primary">พร้อมเริ่มแล้วหรือยัง?</h2>
          <p className="text-text-secondary">สมัครสมาชิกฟรี เลือกแพ็กเกจ แล้ว VPS ของคุณจะพร้อมใช้งาน</p>
          <Button asChild size="lg" className="rounded-[9999px] px-10 gap-2">
            <Link href="/register">
              สมัครสมาชิก <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6 px-4 text-center text-sm text-text-secondary">
        © 2024 CloudVPS — VPS Cloud Rental
      </footer>
    </div>
  )
}
