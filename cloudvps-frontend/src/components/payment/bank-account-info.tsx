import { Landmark } from "lucide-react"
import { BANK_LABELS } from "@/lib/constants"

interface Bank {
  code: string | null
  account_no: string | null
  account_name: string | null
}

export function BankAccountInfo({ bank }: { bank: Bank }) {
  return (
    <div className="p-4 bg-background rounded-[8px] border border-border space-y-2 text-sm">
      <p className="flex items-center gap-1.5 text-xs text-text-secondary">
        <Landmark className="h-3.5 w-3.5" /> โอนเงินเข้าบัญชี
      </p>
      {bank.code && (
        <div className="flex justify-between">
          <span className="text-text-secondary">ธนาคาร</span>
          <span className="font-medium text-text-primary">{BANK_LABELS[bank.code] ?? bank.code} ({bank.code})</span>
        </div>
      )}
      {bank.account_no && (
        <div className="flex justify-between">
          <span className="text-text-secondary">เลขบัญชี</span>
          <span className="font-mono font-medium text-text-primary">{bank.account_no}</span>
        </div>
      )}
      {bank.account_name && (
        <div className="flex justify-between">
          <span className="text-text-secondary">ชื่อบัญชี</span>
          <span className="font-medium text-text-primary">{bank.account_name}</span>
        </div>
      )}
    </div>
  )
}
