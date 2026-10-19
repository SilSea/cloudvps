import { MessageCircle, Mail, Clock } from "lucide-react"

export default function ContactPage() {
  return (
    <div className="max-w-[800px] mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <h1 className="text-[36px] font-bold text-text-primary mb-4">ติดต่อเรา</h1>
        <p className="text-[18px] text-text-secondary">
          มีคำถามหรือต้องการความช่วยเหลือ? ทีมงานพร้อมตอบทุกคำถาม
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-12">
        {[
          {
            icon: <MessageCircle className="h-6 w-6 text-primary" />,
            title: "Support Panel",
            desc: "เปิด Ticket ผ่านระบบ Support ได้เลย",
            detail: "ตอบกลับภายใน 1-4 ชั่วโมง",
          },
          {
            icon: <Mail className="h-6 w-6 text-accent-green" />,
            title: "อีเมล",
            desc: "support@cloudvps.th",
            detail: "ตอบกลับภายใน 24 ชั่วโมง",
          },
          {
            icon: <Clock className="h-6 w-6 text-accent-yellow" />,
            title: "เวลาทำการ",
            desc: "ทุกวัน 24/7",
            detail: "ไม่มีวันหยุด",
          },
        ].map((item) => (
          <div key={item.title} className="bg-surface border border-border rounded-[8px] p-5 text-center space-y-2">
            <div className="w-10 h-10 rounded-[8px] bg-background flex items-center justify-center mx-auto">
              {item.icon}
            </div>
            <h3 className="font-medium text-text-primary">{item.title}</h3>
            <p className="text-sm text-text-secondary">{item.desc}</p>
            <p className="text-xs text-text-secondary">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-[12px] p-8">
        <h2 className="text-[20px] font-bold text-text-primary mb-6">ส่งข้อความถึงเรา</h2>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-primary">ชื่อ</label>
              <input
                type="text"
                placeholder="ชื่อของคุณ"
                className="w-full h-9 px-3 rounded-[6px] border border-border bg-background text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-primary">อีเมล</label>
              <input
                type="email"
                placeholder="email@example.com"
                className="w-full h-9 px-3 rounded-[6px] border border-border bg-background text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">หัวข้อ</label>
            <input
              type="text"
              placeholder="หัวข้อที่ต้องการสอบถาม"
              className="w-full h-9 px-3 rounded-[6px] border border-border bg-background text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-primary">ข้อความ</label>
            <textarea
              rows={5}
              placeholder="รายละเอียดที่ต้องการสอบถาม..."
              className="w-full px-3 py-2 rounded-[6px] border border-border bg-background text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
          <button className="h-9 px-6 rounded-[9999px] bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors">
            ส่งข้อความ
          </button>
        </div>
      </div>
    </div>
  )
}
