import type { Role } from "./auth"

declare module "next-auth" {
  interface User {
    role: Role
    accessToken: string
    refreshToken: string
  }

  interface Session {
    user: {
      id: string
      email: string
      role: Role
      accessToken: string
    }
    error?: "RefreshTokenError"
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role
    accessToken: string
    refreshToken: string
    accessTokenExpiry: number
    error?: "RefreshTokenError"
  }
}
