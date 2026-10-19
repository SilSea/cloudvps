"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { ThaiAddressFields } from "@/components/shared/thai-address-fields"
import { useProfile, useUpdateProfile, useChangePassword, useChangeEmail } from "@/hooks/useProfile"
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validators/auth"

const profileSchema = z.object({
  first_name: z.string().min(1, "กรุณากรอกชื่อ"),
  last_name: z.string().min(1, "กรุณากรอกนามสกุล"),
  phone: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  address3: z.string().optional(),
  address4: z.string().optional(),
  address5: z.string().optional(),
  address6: z.string().optional(),
})
type ProfileInput = z.infer<typeof profileSchema>

export default function ProfilePage() {
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()
  const changePassword = useChangePassword()
  const changeEmail = useChangeEmail()

  const profileForm = useForm<ProfileInput>({ resolver: zodResolver(profileSchema) })
  const passwordForm = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) })
  const emailForm = useForm<{ email: string }>({
    resolver: zodResolver(z.object({ email: z.string().email("อีเมลไม่ถูกต้อง") })),
  })

  useEffect(() => {
    if (profile?.users_info) {
      profileForm.reset({
        first_name: profile.users_info.first_name ?? "",
        last_name: profile.users_info.last_name ?? "",
        phone: profile.users_info.phone ?? "",
        address1: profile.users_info.address1 ?? "",
        address2: profile.users_info.address2 ?? "",
        address3: profile.users_info.address3 ?? "",
        address4: profile.users_info.address4 ?? "",
        address5: profile.users_info.address5 ?? "",
        address6: profile.users_info.address6 ?? "",
      })
    }
  }, [profile, profileForm])

  if (isLoading) return (
    <div className="max-w-lg space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-[300px] rounded-[8px]" />
    </div>
  )

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-[28px] font-bold text-text-primary">โปรไฟล์</h1>

      <div className="bg-surface border border-border rounded-[8px] p-5 space-y-1">
        <p className="text-sm text-text-secondary">อีเมล</p>
        <p className="font-medium text-text-primary">{profile?.email}</p>
      </div>

      <div className="bg-surface border border-border rounded-[8px] p-5 space-y-4">
        <h2 className="font-medium text-text-primary">ข้อมูลส่วนตัว</h2>
        <Form {...profileForm}>
          <form onSubmit={profileForm.handleSubmit((d) => updateProfile.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField control={profileForm.control} name="first_name" render={({ field }) => (
                <FormItem><FormLabel>ชื่อ</FormLabel><FormControl><Input placeholder="สมชาย" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={profileForm.control} name="last_name" render={({ field }) => (
                <FormItem><FormLabel>นามสกุล</FormLabel><FormControl><Input placeholder="ใจดี" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={profileForm.control} name="phone" render={({ field }) => (
              <FormItem><FormLabel>เบอร์โทร</FormLabel><FormControl><Input placeholder="0812345678" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>
            )} />
            <div className="space-y-1">
              <p className="text-sm font-medium text-text-primary">ที่อยู่</p>
              <div className="space-y-3 p-3 bg-background rounded-[8px] border border-border">
                <FormField control={profileForm.control} name="address1" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-text-secondary">บ้านเลขที่ / หมู่บ้าน / อาคาร</FormLabel>
                    <FormControl><Input placeholder="123/4..." {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={profileForm.control} name="address2" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-text-secondary">ซอย / ถนน</FormLabel>
                    <FormControl><Input placeholder="ซอย..." {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <ThaiAddressFields
                  control={profileForm.control as unknown as Parameters<typeof ThaiAddressFields>[0]["control"]}
                  setValue={profileForm.setValue as unknown as Parameters<typeof ThaiAddressFields>[0]["setValue"]}
                  labelSize="sm"
                />
              </div>
            </div>
            <Button type="submit" className="rounded-[9999px]" disabled={updateProfile.isPending}>
              {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              บันทึก
            </Button>
          </form>
        </Form>
      </div>

      <Separator />

      <div className="bg-surface border border-border rounded-[8px] p-5 space-y-4">
        <h2 className="font-medium text-text-primary">เปลี่ยนรหัสผ่าน</h2>
        <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit((d) => changePassword.mutate({ current_password: d.current_password, new_password: d.new_password }))} className="space-y-4">
            <FormField control={passwordForm.control} name="current_password" render={({ field }) => (
              <FormItem><FormLabel>รหัสผ่านปัจจุบัน</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={passwordForm.control} name="new_password" render={({ field }) => (
              <FormItem><FormLabel>รหัสผ่านใหม่</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={passwordForm.control} name="confirm_password" render={({ field }) => (
              <FormItem><FormLabel>ยืนยันรหัสผ่านใหม่</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <Button type="submit" variant="outline" className="rounded-[9999px]" disabled={changePassword.isPending}>
              {changePassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              เปลี่ยนรหัสผ่าน
            </Button>
          </form>
        </Form>
      </div>

      <Separator />

      <div className="bg-surface border border-border rounded-[8px] p-5 space-y-4">
        <div>
          <h2 className="font-medium text-text-primary">เปลี่ยนอีเมล</h2>
          <p className="text-xs text-text-secondary mt-0.5">อีเมลปัจจุบัน: <span className="font-mono">{profile?.email}</span></p>
        </div>
        <Form {...emailForm}>
          <form onSubmit={emailForm.handleSubmit((d) => changeEmail.mutate(d.email))} className="space-y-4">
            <FormField control={emailForm.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>อีเมลใหม่</FormLabel>
                <FormControl><Input type="email" placeholder="new@email.com" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" variant="outline" className="rounded-[9999px]" disabled={changeEmail.isPending}>
              {changeEmail.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              เปลี่ยนอีเมล
            </Button>
          </form>
        </Form>
      </div>
    </div>
  )
}
