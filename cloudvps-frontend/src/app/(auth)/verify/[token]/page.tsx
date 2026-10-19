import { CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AuthService } from "@/services/api/auth"

interface Props {
  params: Promise<{ token: string }>
}

export const metadata = { title: "ยืนยันอีเมล — CloudVPS" }

export default async function VerifyPage({ params }: Props) {
  const { token } = await params
  let success = false

  try {
    await AuthService.verify(token)
    success = true
  } catch {
    success = false
  }

  return (
    <div className="bg-surface rounded-[12px] border border-border p-8 text-center shadow-[0_1px_3px_rgba(25,25,25,0.08)]">
      {success ? (
        <>
          <CheckCircle className="h-12 w-12 text-accent-green mx-auto mb-4" />
          <h2 className="text-[22px] font-bold text-text-primary mb-2">ยืนยันอีเมลสำเร็จ</h2>
          <p className="text-text-secondary text-sm mb-6">
            บัญชีของคุณพร้อมใช้งานแล้ว
          </p>
          <Button asChild className="rounded-[9999px]">
            <a href="/login">เข้าสู่ระบบ</a>
          </Button>
        </>
      ) : (
        <>
          <XCircle className="h-12 w-12 text-secondary mx-auto mb-4" />
          <h2 className="text-[22px] font-bold text-text-primary mb-2">ลิงก์ไม่ถูกต้อง</h2>
          <p className="text-text-secondary text-sm mb-6">
            ลิงก์หมดอายุหรือใช้ไปแล้ว กรุณาลงทะเบียนใหม่
          </p>
          <Button asChild variant="outline" className="rounded-[9999px]">
            <a href="/register">ลงทะเบียนใหม่</a>
          </Button>
        </>
      )}
    </div>
  )
}
