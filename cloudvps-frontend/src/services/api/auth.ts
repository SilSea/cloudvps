import { ApiClient } from "./client"
import type { AuthResponse, LoginInput, RegisterInput, User } from "@/types/auth"

export class AuthService extends ApiClient {
  static async login(data: LoginInput): Promise<AuthResponse> {
    return this.post<AuthResponse>("/api/auth/login", data)
  }

  static async register(data: RegisterInput): Promise<void> {
    return this.post<void>("/api/auth/register", data)
  }

  static async logout(token: string): Promise<void> {
    return this.post<void>("/api/auth/logout", undefined, { token })
  }

  static async refresh(refreshToken: string): Promise<{ access_token: string }> {
    return this.post<{ access_token: string }>(
      "/api/auth/refresh",
      { refresh_token: refreshToken },
    )
  }

  static async me(token: string): Promise<User> {
    return this.get<User>("/api/auth/me", { token })
  }

  static async verify(verifyToken: string): Promise<void> {
    return this.get<void>(`/api/auth/verify/${verifyToken}`)
  }
}
