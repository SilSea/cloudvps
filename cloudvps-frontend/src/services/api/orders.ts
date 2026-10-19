import { ApiClient } from "./client"
import type { Order, OrderListResponse, CreateOrderInput } from "@/types/order"

export class OrderService extends ApiClient {
  static async create(data: CreateOrderInput, token: string): Promise<Order> {
    return this.post<Order>("/api/orders", data, { token })
  }

  static async list(token: string): Promise<OrderListResponse> {
    return this.get<OrderListResponse>("/api/orders", { token })
  }

  static async getById(id: number, token: string): Promise<Order> {
    return this.get<Order>(`/api/orders/${id}`, { token })
  }

  static async cancel(id: number, token: string): Promise<void> {
    return this.patch<void>(`/api/orders/${id}/cancel`, {}, { token })
  }
}
