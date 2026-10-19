import { ApiClient } from "./client"
import { fileToBase64 } from "@/lib/utils"
import type { Transaction, TransactionListResponse, CreateTransactionInput } from "@/types/transaction"

export class TransactionService extends ApiClient {
  static async submit(data: CreateTransactionInput, token: string): Promise<Transaction> {
    const form = new FormData()
    form.append("order_id", String(data.order_id))
    form.append("payment_method", data.payment_method)
    if (data.voucher_code) form.append("voucher_code", data.voucher_code)
    if (data.slip_file) {
      // Sent for FILE mode; also base64-encoded for BASE64 mode — server ignores whichever is inactive
      form.append("slip_file", data.slip_file)
      form.append("slip_image", await fileToBase64(data.slip_file))
    }
    return this.post<Transaction>("/api/transactions", form, { token })
  }

  static async list(token: string): Promise<TransactionListResponse> {
    return this.get<TransactionListResponse>("/api/transactions", { token })
  }

  static async approve(id: number, token: string): Promise<void> {
    return this.patch<void>(`/api/transactions/${id}/approve`, undefined, { token })
  }

  static async reject(id: number, token: string): Promise<void> {
    return this.patch<void>(`/api/transactions/${id}/reject`, {}, { token })
  }
}
