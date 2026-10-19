// Matches GET /api/users/me response (raw Prisma with nested users_info)
export interface UserProfile {
  id: number
  email: string
  status: boolean
  is_verify: boolean
  created_at: string
  role: { role_name: string }
  users_info: {
    user_id: number
    first_name: string
    last_name: string
    phone?: string | null
    address1?: string | null
    address2?: string | null
    address3?: string | null
    address4?: string | null
    address5?: string | null
    address6?: string | null
    created_at: string
    updated_at?: string | null
  } | null
}

export interface UpdateProfileInput {
  first_name?: string
  last_name?: string
  phone?: string
  address1?: string
  address2?: string
  address3?: string
  address4?: string
  address5?: string
  address6?: string
}

export interface ChangePasswordInput {
  current_password: string
  new_password: string
}

// Matches GET /api/users (paginated list item — role is nested)
export interface AdminUserListItem {
  id: number
  email: string
  status: boolean
  is_verify: boolean
  created_at: string
  role: { role_name: string }
}

// Paginated response shape from GET /api/users
export interface AdminUsersResponse {
  users: AdminUserListItem[]
  total: number
  page: number
  limit: number
}

// POST /api/users body (admin/support create user)
export interface AdminCreateUserInput {
  email: string
  password?: string
  first_name: string
  last_name: string
  phone: string
  address1: string
  address2?: string
  address3: string
  address4: string
  address5: string
  address6: string
}

// POST /api/users response data
export interface AdminCreateUserResponse {
  id: number
  email: string
  is_verify: boolean
  created_at: string
  role: { role_name: string }
}
