"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
      <AlertTriangle className="h-12 w-12 text-secondary" />
      <h1 className="text-[24px] font-bold text-text-primary">เกิดข้อผิดพลาด</h1>
      <p className="text-text-secondary max-w-sm">{error.message || "บางอย่างผิดพลาด กรุณาลองใหม่อีกครั้ง"}</p>
      <div className="flex gap-2 mt-2">
        <Button className="rounded-[9999px]" onClick={reset}>ลองใหม่</Button>
        <Button variant="outline" className="rounded-[9999px]" onClick={() => window.location.replace("/")}>
          กลับหน้าหลัก
        </Button>
      </div>
    </div>
  )
}
