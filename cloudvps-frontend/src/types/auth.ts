export type Role = "ADMIN" | "SUPPORT" | "USER"

// Matches backend authService.getMe() response
export interface User {
  id: number
  email: string
  role: string  // backend sends lowercase: "admin" | "support" | "users"
  status: boolean
  is_verify: boolean
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
}

// Matches backend authService.login() response (via ApiClient .data extraction)
export interface AuthResponse {
  access_token: string
  refresh_token: string
  user: {
    id: number
    email: string
    role: string  // lowercase: "admin" | "support" | "users"
    is_verify: boolean
  }
  pending_policy_ids: number[]
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  email: string
  password: string
  first_name: string
  last_name: string
  phone: string
  address1: string
  address2?: string
  address3: string
  address4: string
  address5: string
  address6: string
  policy_ids: number[]
}
