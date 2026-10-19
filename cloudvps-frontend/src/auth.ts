import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"

// Slightly under backend's 15-min TTL to refresh before expiry
const ACCESS_TOKEN_TTL = 14 * 60 * 1000

function normalizeRole(backendRole: string): "ADMIN" | "SUPPORT" | "USER" {
  const map: Record<string, "ADMIN" | "SUPPORT" | "USER"> = {
    admin: "ADMIN",
    support: "SUPPORT",
    users: "USER",
    user: "USER",
  }
  return map[backendRole.toLowerCase()] ?? "USER"
}

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/auth/refresh`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
    )
    if (!res.ok) return null
    const json = await res.json()
    return json.success ? (json.data.access_token as string) : null
  } catch {
    return null
  }
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const res = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email: credentials.email,
                password: credentials.password,
              }),
            },
          )

          if (!res.ok) return null

          const json = await res.json()
          if (!json.success) return null

          const data = json.data
          const role = normalizeRole(data.user.role)

          return {
            id: String(data.user.id),
            email: data.user.email,
            role,
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
          }
        } catch {
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign-in: store tokens + expiry
      if (user) {
        return {
          ...token,
          role: user.role,
          accessToken: user.accessToken,
          refreshToken: user.refreshToken,
          accessTokenExpiry: Date.now() + ACCESS_TOKEN_TTL,
        }
      }

      // Access token still valid
      if (Date.now() < (token.accessTokenExpiry as number)) {
        return token
      }

      // Access token expired — attempt refresh
      const newAccessToken = await refreshAccessToken(token.refreshToken as string)
      if (!newAccessToken) {
        return { ...token, error: "RefreshTokenError" as const }
      }

      return {
        ...token,
        accessToken: newAccessToken,
        accessTokenExpiry: Date.now() + ACCESS_TOKEN_TTL,
        error: undefined,
      }
    },
    async session({ session, token }) {
      if (token) {
        session.user.role = token.role as import("@/types/auth").Role
        session.user.accessToken = token.accessToken as string
        if (token.error === "RefreshTokenError") session.error = "RefreshTokenError"
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
})
