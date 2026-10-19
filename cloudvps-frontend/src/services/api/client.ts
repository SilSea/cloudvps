import type { ApiError, ApiResponse, PaginatedResponse } from "@/types/api"

const BASE_URL = process.env.NEXT_PUBLIC_API_URL

if (!BASE_URL && typeof window !== "undefined") {
  console.error("[ApiClient] NEXT_PUBLIC_API_URL is not set. All API calls will fail.")
}

export class ApiClientError extends Error {
  constructor(
    public readonly code: string | undefined,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = "ApiClientError"
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown
  token?: string
}

export class ApiClient {
  protected static async request<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { body, token, headers, ...rest } = options

    if (!BASE_URL) throw new Error("NEXT_PUBLIC_API_URL is not set in .env.local")

    const isFormData = body instanceof FormData

    const res = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: {
        // Omit Content-Type for FormData — browser sets the multipart boundary itself
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
    })

    if (!res.ok) {
      const err = (await res.json().catch(() => ({
        success: false,
        message: "Unknown error",
      }))) as ApiError
      throw new ApiClientError(err.error ?? err.code, err.message, res.status)
    }

    const json = (await res.json()) as ApiResponse<T> | PaginatedResponse<T>
    return (json as ApiResponse<T>).data
  }

  protected static async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" })
  }

  protected static async post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>(path, { ...options, method: "POST", body })
  }

  protected static async put<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>(path, { ...options, method: "PUT", body })
  }

  protected static async patch<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>(path, { ...options, method: "PATCH", body })
  }

  protected static async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE" })
  }
}
