"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { PolicyConsentModal } from "./policy-consent-modal"
import { ThaiAddressFields } from "@/components/shared/thai-address-fields"
import { AuthService } from "@/services/api/auth"
import { ApiClientError } from "@/services/api/client"
import { registerSchema, type RegisterInput } from "@/lib/validators/auth"

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "" }
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  const levels = [
    { score: 1, label: "อ่อนมาก", color: "bg-secondary" },
    { score: 2, label: "อ่อน", color: "bg-accent-yellow" },
    { score: 3, label: "ปานกลาง", color: "bg-accent-yellow" },
    { score: 4, label: "แข็งแกร่ง", color: "bg-accent-green" },
  ]
  return levels[score - 1] ?? { score: 0, label: "", color: "" }
}

export function RegisterForm() {
  const router = useRouter()
  const [showPdpa, setShowPdpa] = useState(false)
  const [pendingSubmit, setPendingSubmit] = useState(false)

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      first_name: "",
      last_name: "",
      phone: "",
      address1: "",
      address2: "",
      address3: "",
      address4: "",
      address5: "",
      address6: "",
    },
  })

  // eslint-disable-next-line react-hooks/incompatible-library
  const password = form.watch("password")
  const strength = getPasswordStrength(password)

  const onSubmit = async () => {
    const valid = await form.trigger()
    if (!valid) return
    setShowPdpa(true)
  }

  const handleConsentAccepted = async (policyIds: number[]) => {
    setShowPdpa(false)
    setPendingSubmit(true)
    const values = form.getValues()
    try {
      await AuthService.register({ ...values, policy_ids: policyIds })
      toast.success("สมัครสมาชิกสำเร็จ กรุณายืนยันอีเมลของคุณ")
      router.push("/login")
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "เกิดข้อผิดพลาด กรุณาลองใหม่"
      toast.error(msg)
    } finally {
      setPendingSubmit(false)
    }
  }

  return (
    <>
      <div className="bg-surface rounded-[12px] border border-border p-6 shadow-[0_1px_3px_rgba(25,25,25,0.08)]">
        <h2 className="text-[22px] font-bold text-text-primary mb-6">สมัครสมาชิก</h2>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ชื่อ</FormLabel>
                    <FormControl>
                      <Input placeholder="สมชาย" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>นามสกุล</FormLabel>
                    <FormControl>
                      <Input placeholder="ใจดี" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>อีเมล</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="example@email.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>รหัสผ่าน</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  {password && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              i <= strength.score ? strength.color : "bg-border"
                            }`}
                          />
                        ))}
                      </div>
                      {strength.label && (
                        <p className="text-xs text-text-secondary">ความแข็งแกร่ง: {strength.label}</p>
                      )}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>เบอร์โทรศัพท์</FormLabel>
                  <FormControl>
                    <Input placeholder="0812345678" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-1">
              <p className="text-sm font-medium text-text-primary">ที่อยู่</p>
              <div className="space-y-3 p-3 bg-background rounded-[8px] border border-border">
                <FormField
                  control={form.control}
                  name="address1"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-text-secondary">บ้านเลขที่ / หมู่บ้าน / อาคาร</FormLabel>
                      <FormControl>
                        <Input placeholder="123/4 หมู่บ้าน..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="address2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-text-secondary">ซอย / ถนน (ไม่บังคับ)</FormLabel>
                      <FormControl>
                        <Input placeholder="ซอย..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <ThaiAddressFields
                  control={form.control as unknown as Parameters<typeof ThaiAddressFields>[0]["control"]}
                  setValue={form.setValue as unknown as Parameters<typeof ThaiAddressFields>[0]["setValue"]}
                  labelSize="sm"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full rounded-[9999px]"
              disabled={pendingSubmit}
            >
              {pendingSubmit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              สมัครสมาชิก
            </Button>
          </form>
        </Form>

        <p className="text-center text-sm text-text-secondary mt-4">
          มีบัญชีแล้ว?{" "}
          <a href="/login" className="text-primary hover:underline font-medium">
            เข้าสู่ระบบ
          </a>
        </p>
      </div>

      <PolicyConsentModal
        open={showPdpa}
        onAccept={handleConsentAccepted}
        onClose={() => setShowPdpa(false)}
      />
    </>
  )
}
