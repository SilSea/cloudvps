import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { ROLE_HOME } from "@/lib/constants"
import type { Role } from "@/types/auth"

const PUBLIC_PATHS = ["/login", "/register", "/verify", "/packages", "/about", "/contact", "/"]
const USER_PATHS = ["/dashboard", "/vps", "/billing", "/profile", "/tickets"]
const ADMIN_PATHS = ["/admin"]
const SUPPORT_PATHS = ["/support"]

function matchesPath(pathname: string, paths: string[]): boolean {
  return paths.some((p) => pathname === p || pathname.startsWith(p + "/"))
}

export default auth((req) => {
  const { pathname } = req.nextUrl
  const role = (req.auth?.user as { role?: string } | undefined)?.role as Role | undefined

  if (matchesPath(pathname, PUBLIC_PATHS)) {
    // Redirect logged-in users away from auth/root pages to their role home
    if (role && (pathname === "/login" || pathname === "/")) {
      return NextResponse.redirect(new URL(ROLE_HOME[role], req.url))
    }
    return NextResponse.next()
  }

  if (!role) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  if (matchesPath(pathname, ADMIN_PATHS) && role !== "ADMIN") {
    return NextResponse.redirect(new URL(ROLE_HOME[role], req.url))
  }

  if (matchesPath(pathname, SUPPORT_PATHS) && role !== "SUPPORT") {
    return NextResponse.redirect(new URL(ROLE_HOME[role], req.url))
  }

  if (matchesPath(pathname, USER_PATHS) && role !== "USER") {
    return NextResponse.redirect(new URL(ROLE_HOME[role], req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/|api/).*)"],
}
