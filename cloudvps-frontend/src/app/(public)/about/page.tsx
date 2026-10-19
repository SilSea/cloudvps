import { Server, Shield, Zap, Users } from "lucide-react"

export default function AboutPage() {
  return (
    <div className="max-w-[900px] mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-[36px] font-bold text-text-primary mb-4">
          เกี่ยวกับ <span className="text-primary">CloudVPS</span>
        </h1>
        <p className="text-[18px] text-text-secondary max-w-[600px] mx-auto leading-relaxed">
          ผู้ให้บริการ VPS Cloud คุณภาพสูง มุ่งมั่นให้บริการโครงสร้างพื้นฐานที่เสถียร
          ปลอดภัย และเข้าถึงได้ง่ายสำหรับทุกคน
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6 mb-16">
        {[
          {
            icon: <Zap className="h-6 w-6 text-primary" />,
            title: "ความเร็วและประสิทธิภาพ",
            desc: "ใช้ Hardware ระดับ Enterprise พร้อม NVMe SSD และ Network ความเร็วสูง รับประกันประสิทธิภาพสูงสุด",
          },
          {
            icon: <Shield className="h-6 w-6 text-accent-green" />,
            title: "ความปลอดภัย",
            desc: "ระบบ Firewall หลายชั้น Network Isolation และการเข้ารหัสข้อมูลทุกชั้น เพื่อความปลอดภัยสูงสุด",
          },
          {
            icon: <Server className="h-6 w-6 text-secondary" />,
            title: "Infrastructure ที่เชื่อถือได้",
            desc: "Uptime 99.9% SLA พร้อม Redundant Power และ Network เพื่อให้บริการต่อเนื่องไม่สะดุด",
          },
          {
            icon: <Users className="h-6 w-6 text-accent-yellow" />,
            title: "ทีมงานมืออาชีพ",
            desc: "ทีม Support พร้อมช่วยเหลือตลอด 24/7 ด้วยประสบการณ์ด้าน Infrastructure และ Cloud Computing",
          },
        ].map((item) => (
          <div key={item.title} className="bg-surface border border-border rounded-[8px] p-6 space-y-3">
            <div className="w-10 h-10 rounded-[8px] bg-background flex items-center justify-center">
              {item.icon}
            </div>
            <h3 className="font-semibold text-text-primary">{item.title}</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-[12px] p-8 text-center">
        <h2 className="text-[22px] font-bold text-text-primary mb-3">พันธกิจของเรา</h2>
        <p className="text-text-secondary leading-relaxed max-w-[600px] mx-auto">
          CloudVPS เชื่อว่าทุกคนควรมีสิทธิ์เข้าถึงโครงสร้างพื้นฐาน Cloud คุณภาพสูงในราคาที่เป็นธรรม
          เราพัฒนาแพลตฟอร์มเพื่อให้ผู้ใช้ทุกระดับสามารถจัดการ VPS ได้อย่างง่ายดาย ไม่ต้องมีความรู้เทคนิคเชิงลึก
        </p>
      </div>
    </div>
  )
}
