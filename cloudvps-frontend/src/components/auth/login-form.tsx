"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { signIn } from "next-auth/react"
import { useSearchParams } from "next/navigation"
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
import { loginSchema, type LoginInput } from "@/lib/validators/auth"

export function LoginForm() {
  const searchParams = useSearchParams()
  const rawCallback = searchParams.get("callbackUrl")
  // Restrict to same-origin relative paths to prevent open redirect attacks
  const callbackUrl =
    rawCallback && rawCallback.startsWith("/") && !rawCallback.startsWith("//")
      ? rawCallback
      : "/"

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = async (data: LoginInput) => {
    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    })

    if (!result?.ok || result.error) {
      toast.error("อีเมลหรือรหัสผ่านไม่ถูกต้อง")
      return
    }

    // full reload — let middleware redirect to role home from fresh session cookie
    window.location.replace(callbackUrl ?? "/")
  }

  const isLoading = form.formState.isSubmitting

  return (
    <div className="bg-surface rounded-[12px] border border-border p-6 shadow-[0_1px_3px_rgba(25,25,25,0.08)]">
      <h2 className="text-[22px] font-bold text-text-primary mb-6">เข้าสู่ระบบ</h2>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full rounded-[9999px]" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            เข้าสู่ระบบ
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-text-secondary mt-4">
        ยังไม่มีบัญชี?{" "}
        <a href="/register" className="text-primary hover:underline font-medium">
          สมัครสมาชิก
        </a>
      </p>
    </div>
  )
}
