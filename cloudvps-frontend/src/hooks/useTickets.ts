"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { TicketService } from "@/services/api/tickets"
import { useAuth } from "./useAuth"
import type {
  CreateTicketInput,
  AddMessageInput,
  UpdateTicketStatusInput,
  AssignTicketInput,
  SetPriorityInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  TicketFilters,
} from "@/types/ticket"

export function useTicketCategories() {
  return useQuery({
    queryKey: ["ticket-categories"],
    queryFn: () => TicketService.listCategories(),
    select: (data) => [...data].sort((a, b) => a.name.localeCompare(b.name)),
  })
}

export function useAdminTicketCategories() {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["ticket-categories-all"],
    queryFn: () => TicketService.listCategoriesAll(accessToken!),
    enabled: !!accessToken,
    select: (data) => [...data].sort((a, b) => a.name.localeCompare(b.name)),
  })
}

export function useCreateTicketCategory() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateCategoryInput) => TicketService.createCategory(data, accessToken!),
    onSuccess: () => {
      toast.success("สร้างหมวดหมู่แล้ว")
      qc.invalidateQueries({ queryKey: ["ticket-categories-all"] })
      qc.invalidateQueries({ queryKey: ["ticket-categories"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateTicketCategory() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCategoryInput }) =>
      TicketService.updateCategory(id, data, accessToken!),
    onSuccess: () => {
      toast.success("อัปเดตหมวดหมู่แล้ว")
      qc.invalidateQueries({ queryKey: ["ticket-categories-all"] })
      qc.invalidateQueries({ queryKey: ["ticket-categories"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useToggleTicketCategory() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => TicketService.toggleCategoryStatus(id, accessToken!),
    onSuccess: () => {
      toast.success("อัปเดตสถานะแล้ว")
      qc.invalidateQueries({ queryKey: ["ticket-categories-all"] })
      qc.invalidateQueries({ queryKey: ["ticket-categories"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useTickets(filters?: TicketFilters) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["tickets", filters],
    queryFn: () => TicketService.list(accessToken!, filters),
    enabled: !!accessToken,
  })
}

export function useTicket(id: number) {
  const { accessToken } = useAuth()
  return useQuery({
    queryKey: ["tickets", id],
    queryFn: () => TicketService.getById(id, accessToken!),
    enabled: !!accessToken && !!id,
    // Poll while the ticket is still open so a new reply/status change from the other side
    // (support/admin, or the user themselves from another tab) shows up without a manual
    // reload. Stops once the ticket reaches a final state.
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && status !== "RESOLVED" && status !== "CLOSED" ? 10000 : false
    },
  })
}

export function useCreateTicket() {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateTicketInput) => TicketService.create(data, accessToken!),
    onSuccess: () => {
      toast.success("เปิด Ticket แล้ว")
      qc.invalidateQueries({ queryKey: ["tickets"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAddMessage(ticketId: number) {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AddMessageInput) => TicketService.addMessage(ticketId, data, accessToken!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets", ticketId] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useUpdateTicketStatus(ticketId: number) {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateTicketStatusInput) => TicketService.updateStatus(ticketId, data, accessToken!),
    onSuccess: () => {
      toast.success("อัปเดตสถานะแล้ว")
      qc.invalidateQueries({ queryKey: ["tickets", ticketId] })
      qc.invalidateQueries({ queryKey: ["tickets"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useAssignTicket(ticketId: number) {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AssignTicketInput) => TicketService.assign(ticketId, data, accessToken!),
    onSuccess: () => {
      toast.success("มอบหมายแล้ว")
      qc.invalidateQueries({ queryKey: ["tickets", ticketId] })
      qc.invalidateQueries({ queryKey: ["tickets"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useSetTicketPriority(ticketId: number) {
  const { accessToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: SetPriorityInput) => TicketService.setPriority(ticketId, data, accessToken!),
    onSuccess: () => {
      toast.success("อัปเดต Priority แล้ว")
      qc.invalidateQueries({ queryKey: ["tickets", ticketId] })
      qc.invalidateQueries({ queryKey: ["tickets"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
