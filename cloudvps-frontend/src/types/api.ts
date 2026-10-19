export interface ApiResponse<T> {
  success: true
  data: T
  message?: string
}

export interface ApiError {
  success: false
  message: string
  error?: string
  code?: string
}

export interface PaginatedResponse<T> {
  success: true
  data: T[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export type ApiResult<T> = ApiResponse<T> | ApiError
