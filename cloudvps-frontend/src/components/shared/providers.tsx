"use client"

import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query"
import { SessionProvider, useSession, signOut } from "next-auth/react"
import { useEffect, useState } from "react"
import { Toaster } from "@/components/ui/sonner"
import { ApiClientError } from "@/services/api/client"

function handle401(error: unknown) {
  if (error instanceof ApiClientError && error.status === 401) {
    signOut({ callbackUrl: "/login" })
  }
}

function SessionErrorWatcher() {
  const { data: session } = useSession()
  useEffect(() => {
    if (session?.error === "RefreshTokenError") {
      signOut({ callbackUrl: "/login" })
    }
  }, [session?.error])
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handle401 }),
        mutationCache: new MutationCache({ onError: handle401 }),
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: (failureCount, error) => {
              if (error instanceof ApiClientError && error.status === 401) return false
              return failureCount < 1
            },
          },
        },
      }),
  )

  return (
    <SessionProvider>
      <SessionErrorWatcher />
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster position="top-right" richColors />
      </QueryClientProvider>
    </SessionProvider>
  )
}
