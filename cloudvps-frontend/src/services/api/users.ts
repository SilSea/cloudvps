import { ApiClient } from "./client"
import type { UserProfile, UpdateProfileInput, ChangePasswordInput, AdminUsersResponse, AdminCreateUserInput, AdminCreateUserResponse } from "@/types/user"

export class UserService extends ApiClient {
  static async getMe(token: string): Promise<UserProfile> {
    return this.get<UserProfile>("/api/users/me", { token })
  }

  static async updateMe(data: UpdateProfileInput, token: string): Promise<UserProfile> {
    return this.put<UserProfile>("/api/users/me", data, { token })
  }

  static async changePassword(data: ChangePasswordInput, token: string): Promise<void> {
    return this.put<void>("/api/users/me/password", data, { token })
  }

  static async listAll(token: string): Promise<AdminUsersResponse> {
    return this.get<AdminUsersResponse>("/api/users", { token })
  }

  static async toggleActive(id: number, token: string): Promise<void> {
    return this.patch<void>(`/api/users/${id}/status`, undefined, { token })
  }

  static async changeRole(id: number, roleName: string, token: string): Promise<void> {
    return this.patch<void>(`/api/users/${id}/role`, { role_name: roleName }, { token })
  }

  static async updateUser(id: number, data: UpdateProfileInput, token: string): Promise<void> {
    return this.put<void>(`/api/users/${id}`, data, { token })
  }

  static async changeEmail(email: string, token: string): Promise<void> {
    return this.put<void>("/api/users/me/email", { email }, { token })
  }

  static async adminCreate(data: AdminCreateUserInput, token: string): Promise<AdminCreateUserResponse> {
    return this.post<AdminCreateUserResponse>("/api/users", data, { token })
  }
}
