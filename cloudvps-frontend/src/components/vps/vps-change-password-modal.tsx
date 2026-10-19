"use client"

import { useEffect, useState } from "react"
import type { UseMutationResult } from "@tanstack/react-query"
import { Loader2, Clock, AlertTriangle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { ApiClientError } from "@/services/api/client"
import { maskEmail } from "@/lib/utils"
import type { ConfirmVpsPasswordChangeInput } from "@/types/vps"

const OTP_TTL_SEC = 5 * 60
const PASSWORD_RULE = /^[^\n\r\0]{8,64}$/

// Windows local account "password must meet complexity requirements" default policy: at
// least 3 of these 4 categories. A single letter (e.g. "abcd1234" — lowercase + digit only,
// 2 categories) still fails this in practice.
function meetsWindowsComplexity(pw: string): boolean {
  const categories = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/]
  return categories.filter((re) => re.test(pw)).length >= 3
}

interface Hooks {
  requestOtp: UseMutationResult<{ message: string }, Error, void>
  confirm: UseMutationResult<{ message: string }, Error, ConfirmVpsPasswordChangeInput>
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  ownerEmail?: string
  hooks: Hooks
  // Requesting the OTP works regardless of power state (backend just sends an email) —
  // only the final confirm step needs the VM running, since it applies the password via
  // qemu-guest-agent. Shown as a heads-up before that step, not a reason to block the flow.
  vmRunning?: boolean
  // Windows local account password policy effectively requires a letter (all-digit/all-symbol
  // passwords get rejected by the guest OS) — Linux chpasswd has no such constraint.
  isWindows?: boolean
}

export function VpsChangePasswordModal({ open, onOpenChange, ownerEmail, hooks, vmRunning, isWindows }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>เปลี่ยนรหัสผ่าน VPS</DialogTitle>
        </DialogHeader>
        {open && <ChangePasswordForm onOpenChange={onOpenChange} ownerEmail={ownerEmail} hooks={hooks} vmRunning={vmRunning} isWindows={isWindows} />}
      </DialogContent>
    </Dialog>
  )
}

type Step = "request" | "otp"

function ChangePasswordForm({
  onOpenChange, ownerEmail, hooks, vmRunning, isWindows,
}: Omit<Props, "open">) {
  const [step, setStep] = useState<Step>("request")
  const [otp, setOtp] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL_SEC)

  useEffect(() => {
    if (step !== "otp" || secondsLeft <= 0) return
    const t = setInterval(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [step, secondsLeft])

  const requestOtp = () => {
    hooks.requestOtp.mutate(undefined, {
      onSuccess: () => {
        toast.info("OTP ถูกส่งไปยัง email ของคุณแล้ว (หมดอายุใน 5 นาที)")
        setSecondsLeft(OTP_TTL_SEC)
        setStep("otp")
      },
      onError: (e) => {
        if (e instanceof ApiClientError) {
          if (e.status === 404) { toast.error("ไม่พบ VPS"); onOpenChange(false); return }
          if (e.status === 403) { toast.error("ไม่มีสิทธิ์เข้าถึง VPS นี้"); onOpenChange(false); return }
          if (e.status === 502) { toast.error("ระบบ email ขัดข้อง กรุณาลองใหม่อีกครั้ง"); return }
        }
        toast.error(e.message ?? "เกิดข้อผิดพลาด")
      },
    })
  }

  const handleConfirm = () => {
    if (!PASSWORD_RULE.test(newPassword)) {
      toast.error("รหัสผ่านต้องมี 8-64 ตัวอักษร และห้ามมีอักขระขึ้นบรรทัดใหม่")
      return
    }
    if (isWindows && !meetsWindowsComplexity(newPassword)) {
      toast.error("รหัสผ่าน Windows ต้องมีอย่างน้อย 3 ใน 4 หมวด: ตัวพิมพ์ใหญ่ / ตัวพิมพ์เล็ก / ตัวเลข / สัญลักษณ์")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("รหัสผ่านยืนยันไม่ตรงกัน")
      return
    }
    hooks.confirm.mutate({ otp, new_password: newPassword }, {
      onSuccess: () => {
        toast.success("เปลี่ยนรหัสผ่านสำเร็จ")
        onOpenChange(false)
      },
      onError: (e) => {
        if (e instanceof ApiClientError) {
          const msg = e.message ?? ""
          if (e.status === 400 && msg.includes("8-64")) { toast.error("รหัสผ่านต้องมี 8-64 ตัวอักษร"); return }
          if (e.status === 400 && msg.includes("expired")) { toast.error("OTP หมดอายุ กรุณาขอ OTP ใหม่"); setStep("request"); return }
          if (e.status === 400 && msg.includes("Invalid OTP")) { toast.error("OTP ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง"); return }
          if (e.status === 429) { toast.error("ลองผิดครบ 5 ครั้ง กรุณาขอ OTP ใหม่"); setStep("request"); return }
          if (e.status === 502) { toast.error("ไม่สามารถเปลี่ยนรหัสผ่านใน VM ได้ — ตรวจสอบว่า VPS กำลัง running"); return }
        }
        toast.error(e.message ?? "เกิดข้อผิดพลาด")
      },
    })
  }

  const expired = secondsLeft <= 0
  const mm = Math.floor(Math.max(secondsLeft, 0) / 60)
  const ss = Math.max(secondsLeft, 0) % 60

  if (step === "request") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          ระบบจะส่ง OTP ไปที่ email ของคุณ{ownerEmail && <> — <span className="font-mono">{maskEmail(ownerEmail)}</span></>}
        </p>
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1 rounded-[9999px]"
            onClick={() => onOpenChange(false)}
            disabled={hooks.requestOtp.isPending}
          >
            ยกเลิก
          </Button>
          <Button
            className="flex-1 rounded-[9999px] gap-1.5"
            onClick={requestOtp}
            disabled={hooks.requestOtp.isPending}
          >
            {hooks.requestOtp.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            ส่ง OTP
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>OTP (6 หลัก)</Label>
        <Input
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          className="font-mono tracking-widest text-center"
        />
      </div>
      <div className="space-y-1.5">
        <Label>รหัสผ่านใหม่</Label>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={isWindows ? "8-64 ตัวอักษร มี 3 ใน 4: A-Z / a-z / 0-9 / สัญลักษณ์" : "อย่างน้อย 8 ตัวอักษร"}
        />
      </div>
      <div className="space-y-1.5">
        <Label>ยืนยันรหัสผ่านใหม่</Label>
        <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
      </div>

      <p className={`flex items-center gap-1.5 text-xs ${expired ? "text-secondary" : "text-text-secondary"}`}>
        <Clock className="h-3.5 w-3.5" />
        {expired ? "OTP หมดอายุ กรุณาขอ OTP ใหม่" : `OTP หมดอายุใน: ${mm}:${String(ss).padStart(2, "0")}`}
      </p>

      {vmRunning === false && (
        <p className="flex items-center gap-1.5 text-xs text-accent-yellow">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          VPS ปิดอยู่ — ต้องเปิดเครื่องก่อนกดยืนยัน (ระบบเปลี่ยนรหัสผ่านผ่าน guest agent ในเครื่องที่กำลังทำงาน)
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          className="flex-1 rounded-[9999px]"
          onClick={() => onOpenChange(false)}
          disabled={hooks.confirm.isPending}
        >
          ยกเลิก
        </Button>
        <Button
          variant="outline"
          className="flex-1 rounded-[9999px]"
          onClick={requestOtp}
          disabled={hooks.requestOtp.isPending}
        >
          {hooks.requestOtp.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          ขอ OTP ใหม่
        </Button>
        <Button
          className="flex-1 rounded-[9999px] gap-1.5"
          onClick={handleConfirm}
          disabled={hooks.confirm.isPending || expired || otp.length !== 6 || !newPassword || !confirmPassword || (isWindows && !meetsWindowsComplexity(newPassword))}
        >
          {hooks.confirm.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          ยืนยัน
        </Button>
      </div>
    </div>
  )
}
