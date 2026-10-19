// Status matches backend DB enum exactly
export type TransactionStatus = "PENDING" | "SUCCESSFUL" | "REJECT"
export type PaymentMethod = "TRUEMONEY" | "SLIP" | "PROMPTPAY"

export interface Transaction {
  id: number
  order_id: number
  provider_ref_id?: string
  amount: number
  payment_method: PaymentMethod
  status: TransactionStatus
  slip_url?: string | null
  created_at: string
  updated_at?: string | null
}

export interface TransactionListResponse {
  transactions: Transaction[]
  total: number
  page: number
  limit: number
}

export interface CreateTransactionInput {
  order_id: number
  payment_method: PaymentMethod
  voucher_code?: string
  // Backend POST /api/transactions is multipart/form-data (2026-07 phase15).
  // Admin picks the active slip mode via system config `payment.slip_mode`;
  // frontend can't reliably read that (USER role has no access to
  // GET /api/system-configs), so both fields are sent and the inactive one
  // is ignored server-side.
  slip_file?: File
}
