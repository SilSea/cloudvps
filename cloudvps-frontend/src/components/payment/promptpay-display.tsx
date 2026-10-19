"use client"

import { useMemo } from "react"
import QRCode from "react-qr-code"
import generatePayload from "promptpay-qr"
import { AlertCircle } from "lucide-react"
import { SlipUploader } from "./slip-uploader"

interface Props {
  amount: number
  promptpayId: string | null
  onSubmit: (file: File) => Promise<void>
  isLoading?: boolean
}

export function PromptPayDisplay({ amount, promptpayId, onSubmit, isLoading }: Props) {
  const payload = useMemo(() => {
    if (!promptpayId) return null
    return generatePayload(promptpayId, { amount })
  }, [promptpayId, amount])

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 p-6 bg-background rounded-[8px] border border-border">
        {payload ? (
          <>
            <div className="bg-white p-3 rounded-[8px]">
              <QRCode value={payload} size={180} />
            </div>
            <p className="text-sm text-text-secondary text-center">
              สแกน QR Code ด้วยแอปธนาคาร
              <br />
              <span className="font-medium text-text-primary">
                ยอด ฿{amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </span>
            </p>
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-accent-yellow">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>ยังไม่เปิดรับชำระผ่าน PromptPay</span>
          </div>
        )}
        <p className="text-xs text-text-secondary text-center">
          จากนั้นอัพโหลดสลิปด้านล่าง รอ Admin ยืนยัน
        </p>
      </div>
      <SlipUploader onSubmit={onSubmit} isLoading={isLoading} />
    </div>
  )
}
