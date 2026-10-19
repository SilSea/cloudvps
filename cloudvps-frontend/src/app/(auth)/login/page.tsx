import { Suspense } from "react"
import { LoginForm } from "@/components/auth/login-form"

export const metadata = { title: "เข้าสู่ระบบ — CloudVPS" }

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
