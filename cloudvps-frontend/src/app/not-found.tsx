import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
      <p className="text-[80px] font-bold text-border leading-none">404</p>
      <h1 className="text-[24px] font-bold text-text-primary">ไม่พบหน้านี้</h1>
      <p className="text-text-secondary max-w-sm">หน้าที่คุณต้องการไม่มีอยู่หรืออาจถูกย้ายไปแล้ว</p>
      <Button asChild className="rounded-[9999px] mt-2">
        <Link href="/">กลับหน้าหลัก</Link>
      </Button>
    </div>
  )
}
