"use client"

import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { ROLE_HOME } from "@/lib/constants"
import type { Role } from "@/types/auth"

export function useAuth() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const role = session?.user?.role as Role | undefined

  const logout = async () => {
    await signOut({ redirect: false })
    router.push("/login")
  }

  return {
    user: session?.user,
    role,
    accessToken: session?.user?.accessToken,
    isLoading: status === "loading",
    isAuthenticated: status === "authenticated",
    roleHome: role ? ROLE_HOME[role] : "/login",
    logout,
  }
}
