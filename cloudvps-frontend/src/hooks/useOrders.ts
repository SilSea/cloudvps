"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { OrderService } from "@/services/api/orders"
import { TransactionService } from "@/services/api/transactions"
import { PromotionService } from "@/services/api/promotions"
import { SystemConfigService } from "@/services/api/system-configs"
import { ApiClientError } from "@/services/api/client"
import { useAuth } from "./useAuth"
import type { CreateOrderInput } from "@/types/order"
import type { CreateTransactionInput } from "@/types/transaction"
import type { PromoValidateInput } from "@/types/promotion"

export function useOrders() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["orders"],
    queryFn: () => OrderService.list(accessToken!),
    enabled: !!accessToken,
  })
}

export function useOrder(id: number) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["orders", id],
    queryFn: () => OrderService.getById(id, accessToken!),
    enabled: !!accessToken && !!id,
    // Poll while the order is still PENDING (awaiting payment or admin/support approval)
    // so the page flips to the paid summary on its own — no reload needed when e.g. an
    // admin approves a PROMPTPAY slip while the user is sitting on this page. Stops polling
    // once the order reaches a final state (PAID/CANCEL/EXPIRE).
    refetchInterval: (query) => (query.state.data?.status === "PENDING" ? 8000 : false),
  })
}

export function useCreateOrder() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateOrderInput) => OrderService.create(data, accessToken!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  })
}

export function useSubmitTransaction() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateTransactionInput) => TransactionService.submit(data, accessToken!),
    onSuccess: () => {
      toast.success("ส่งข้อมูลการชำระเงินแล้ว")
      qc.invalidateQueries({ queryKey: ["orders"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useCancelOrder() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => OrderService.cancel(id, accessToken!),
    onSuccess: () => {
      toast.success("ยกเลิกคำสั่งซื้อแล้ว")
      qc.invalidateQueries({ queryKey: ["orders"] })
    },
    onError: (e: Error) => {
      // PENDING upgrade orders can be cancelled now — only an already-applied (PAID) upgrade
      // is blocked (docs/frontend.md §16). This is a race-condition safety net: the cancel
      // button is only shown for PENDING orders, but status can change between page load
      // and click (e.g. admin just approved it).
      if (e instanceof ApiClientError) {
        switch (e.code) {
          case "CANNOT_CANCEL_UPGRADE":
            toast.error("อัปเกรดนี้ถูกดำเนินการไปแล้ว ไม่สามารถยกเลิกได้")
            return
          case "ALREADY_PAID":
            toast.error("คำสั่งซื้อนี้ชำระเงินแล้ว ไม่สามารถยกเลิกได้")
            return
          case "ALREADY_CANCELLED":
            toast.error("คำสั่งซื้อนี้ถูกยกเลิกไปแล้ว")
            return
          case "EXPIRED":
            toast.error("คำสั่งซื้อนี้หมดอายุแล้ว")
            return
        }
      }
      toast.error(e.message)
    },
  })
}

// PromptPay number + bank account for checkout display — any authenticated role can read
// this (GET /api/system-configs/payment-info, non-secret). Used to hide a payment method
// entirely when admin hasn't configured it, instead of showing a broken/empty option.
export function usePaymentInfo() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["payment-info"],
    queryFn: () => SystemConfigService.getPaymentInfo(accessToken!),
    enabled: !!accessToken,
  })
}

export function useValidatePromo() {
  const { accessToken } = useAuth()
  return useMutation({
    mutationFn: (data: PromoValidateInput) => PromotionService.validate(data, accessToken!),
    onError: (e: Error) => toast.error(e.message),
  })
}
