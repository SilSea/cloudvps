import { ApiClient } from "./client"
import type {
  Ticket,
  TicketCategory,
  TicketListResponse,
  TicketMessage,
  CreateTicketInput,
  AddMessageInput,
  UpdateTicketStatusInput,
  AssignTicketInput,
  SetPriorityInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  TicketFilters,
} from "@/types/ticket"

export class TicketService extends ApiClient {
  // Categories
  static async listCategories(): Promise<TicketCategory[]> {
    return this.get<TicketCategory[]>("/api/tickets/categories")
  }

  static async listCategoriesAll(token: string): Promise<TicketCategory[]> {
    return this.get<TicketCategory[]>("/api/tickets/categories/all", { token })
  }

  static async createCategory(data: CreateCategoryInput, token: string): Promise<TicketCategory> {
    return this.post<TicketCategory>("/api/tickets/categories", data, { token })
  }

  static async updateCategory(id: number, data: UpdateCategoryInput, token: string): Promise<TicketCategory> {
    return this.put<TicketCategory>(`/api/tickets/categories/${id}`, data, { token })
  }

  static async toggleCategoryStatus(id: number, token: string): Promise<TicketCategory> {
    return this.patch<TicketCategory>(`/api/tickets/categories/${id}/status`, {}, { token })
  }

  // Tickets
  static async create(data: CreateTicketInput, token: string): Promise<Ticket> {
    return this.post<Ticket>("/api/tickets", data, { token })
  }

  static async list(token: string, filters?: TicketFilters): Promise<TicketListResponse> {
    const params = new URLSearchParams()
    if (filters?.page) params.set("page", String(filters.page))
    if (filters?.limit) params.set("limit", String(filters.limit))
    if (filters?.status) params.set("status", filters.status)
    if (filters?.priority) params.set("priority", filters.priority)
    if (filters?.category_id) params.set("category_id", String(filters.category_id))
    const qs = params.toString()
    return this.get<TicketListResponse>(`/api/tickets${qs ? `?${qs}` : ""}`, { token })
  }

  static async getById(id: number, token: string): Promise<Ticket> {
    return this.get<Ticket>(`/api/tickets/${id}`, { token })
  }

  static async updateStatus(id: number, data: UpdateTicketStatusInput, token: string): Promise<Ticket> {
    return this.patch<Ticket>(`/api/tickets/${id}/status`, data, { token })
  }

  static async assign(id: number, data: AssignTicketInput, token: string): Promise<Ticket> {
    return this.patch<Ticket>(`/api/tickets/${id}/assign`, data, { token })
  }

  static async setPriority(id: number, data: SetPriorityInput, token: string): Promise<Ticket> {
    return this.patch<Ticket>(`/api/tickets/${id}/priority`, data, { token })
  }

  static async addMessage(id: number, data: AddMessageInput, token: string): Promise<TicketMessage> {
    const form = new FormData()
    form.append("message", data.message)
    if (data.is_internal !== undefined) form.append("is_internal", String(data.is_internal))
    for (const file of data.attachments ?? []) form.append("attachments", file)
    return this.post<TicketMessage>(`/api/tickets/${id}/messages`, form, { token })
  }
}
