import { prisma } from "../config/database";
import { auditService } from "./audit.service";
import { emailService } from "./email.service";
import { logger } from "../utils/logger";
import type { TicketStatus, TicketPriority } from "@prisma/client";

const TICKET_STATUS_VALUES = new Set(["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"]);
const TICKET_PRIORITY_VALUES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

function generateRefNo(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `TKT-${date}-${rand}`;
}

const userSelect = {
  id: true,
  email: true,
  users_info: { select: { first_name: true, last_name: true } },
};

export const ticketService = {
  // ── Categories ─────────────────────────────────────────────────────────────

  async listCategories(activeOnly = false) {
    return prisma.ticket_categories.findMany({
      where: activeOnly ? { status: true } : undefined,
      orderBy: { name: "asc" },
    });
  },

  async createCategory(
    data: { name: string; description?: string },
    actorId: number,
    actorRole: string,
    ip?: string
  ) {
    const exists = await prisma.ticket_categories.findUnique({ where: { name: data.name } });
    if (exists) return { error: "CATEGORY_NAME_EXISTS" as const };
    const cat = await prisma.ticket_categories.create({ data: { ...data, status: true } });
    auditService.record({
      actorId, actorRole, action: "CREATE", entity: "TICKET_CATEGORY",
      entityId: cat.id, metadata: { name: data.name }, ipAddress: ip,
    });
    return { data: cat };
  },

  async updateCategory(
    id: number,
    data: { name?: string; description?: string },
    actorId: number,
    actorRole: string,
    ip?: string
  ) {
    const cat = await prisma.ticket_categories.findUnique({ where: { id } });
    if (!cat) return null;
    if (data.name && data.name !== cat.name) {
      const dup = await prisma.ticket_categories.findUnique({ where: { name: data.name } });
      if (dup) return { error: "CATEGORY_NAME_EXISTS" as const };
    }
    const updated = await prisma.ticket_categories.update({ where: { id }, data });
    auditService.record({
      actorId, actorRole, action: "UPDATE", entity: "TICKET_CATEGORY",
      entityId: id, metadata: data, ipAddress: ip,
    });
    return { data: updated };
  },

  async toggleCategoryStatus(id: number, actorId: number, actorRole: string, ip?: string) {
    const cat = await prisma.ticket_categories.findUnique({ where: { id } });
    if (!cat) return null;
    const updated = await prisma.ticket_categories.update({
      where: { id },
      data: { status: !cat.status },
    });
    auditService.record({
      actorId, actorRole,
      action: updated.status ? "ENABLE" : "DISABLE",
      entity: "TICKET_CATEGORY",
      entityId: id,
      ipAddress: ip,
    });
    return updated;
  },

  // ── Tickets ────────────────────────────────────────────────────────────────

  async createTicket(
    data: { title: string; category_id: number; message: string },
    userId: number,
    actorRole: string,
    ip?: string
  ) {
    const cat = await prisma.ticket_categories.findUnique({
      where: { id: data.category_id, status: true },
    });
    if (!cat) return { error: "CATEGORY_NOT_FOUND" as const };

    const ticket = await prisma.tickets.create({
      data: {
        ref_no: generateRefNo(),
        title: data.title,
        category_id: data.category_id,
        user_id: userId,
        messages: {
          create: { sender_id: userId, message: data.message, is_internal: false },
        },
      },
      include: {
        category: true,
        user: { select: userSelect },
        messages: {
          include: { sender: { select: userSelect } },
        },
      },
    });

    auditService.record({
      actorId: userId, actorRole, action: "CREATE", entity: "TICKET",
      entityId: ticket.id,
      metadata: { ref_no: ticket.ref_no, title: ticket.title },
      ipAddress: ip,
    });
    return { data: ticket };
  },

  async listTickets(query: {
    userId?: number;
    status?: string;
    priority?: string;
    category_id?: number;
    assigned_to?: number;
    page?: number;
    limit?: number;
  }) {
    const { userId, status, priority, category_id, assigned_to, page = 1, limit = 20 } = query;
    const where: any = {};
    if (userId !== undefined) where.user_id = userId;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category_id) where.category_id = category_id;
    if (assigned_to !== undefined) where.assigned_to = assigned_to;

    const [total, items] = await Promise.all([
      prisma.tickets.count({ where }),
      prisma.tickets.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          user: { select: userSelect },
          assignee: { select: userSelect },
          _count: { select: { messages: true } },
        },
        orderBy: { created_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data: items, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  async getTicketById(id: number, requestingUser: { id: number; role: string }) {
    const ticket = await prisma.tickets.findUnique({
      where: { id },
      include: {
        category: true,
        user: { select: userSelect },
        assignee: { select: userSelect },
        messages: {
          where: requestingUser.role === "users" ? { is_internal: false } : undefined,
          include: { sender: { select: userSelect } },
          orderBy: { created_at: "asc" },
        },
      },
    });

    if (!ticket) return null;
    if (requestingUser.role === "users" && ticket.user_id !== requestingUser.id) {
      return { error: "FORBIDDEN" as const };
    }
    return { data: ticket };
  },

  async updateStatus(
    id: number,
    status: string,
    requestingUser: { id: number; role: string },
    ip?: string
  ) {
    if (!TICKET_STATUS_VALUES.has(status)) return { error: "INVALID_STATUS" as const };

    const ticket = await prisma.tickets.findUnique({ where: { id } });
    if (!ticket) return null;

    if (requestingUser.role === "users") {
      if (ticket.user_id !== requestingUser.id) return { error: "FORBIDDEN" as const };
      if (status !== "CLOSED") return { error: "FORBIDDEN" as const };
    }

    if (ticket.status === "CLOSED") return { error: "TICKET_ALREADY_CLOSED" as const };

    const updateData: any = { status };
    if (status === "CLOSED") updateData.closed_at = new Date();

    const updated = await prisma.tickets.update({ where: { id }, data: updateData });

    auditService.record({
      actorId: requestingUser.id, actorRole: requestingUser.role,
      action: "UPDATE", entity: "TICKET", entityId: id,
      metadata: { status, ref_no: ticket.ref_no },
      ipAddress: ip,
    });

    if (status === "CLOSED") {
      const owner = await prisma.users.findUnique({
        where: { id: ticket.user_id },
        select: { email: true },
      });
      if (owner) {
        emailService
          .sendTicketClosed(owner.email, ticket.ref_no, ticket.title)
          .catch((e) => logger.error("ticket_closed_email_failed", { error: e.message, ticket_id: id }));
      }
    }

    return { data: updated };
  },

  async assignTicket(
    id: number,
    assigned_to: number | null,
    requestingUser: { id: number; role: string },
    ip?: string
  ) {
    const ticket = await prisma.tickets.findUnique({ where: { id } });
    if (!ticket) return null;

    if (assigned_to !== null) {
      const assignee = await prisma.users.findUnique({
        where: { id: assigned_to },
        include: { role: true },
      });
      if (!assignee || assignee.role.role_name === "users") {
        return { error: "INVALID_ASSIGNEE" as const };
      }
      // SUPPORT can only self-assign
      if (requestingUser.role === "support" && assigned_to !== requestingUser.id) {
        return { error: "FORBIDDEN" as const };
      }
    }

    const newStatus =
      assigned_to && ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status;

    const updated = await prisma.tickets.update({
      where: { id },
      data: { assigned_to, status: newStatus },
    });

    auditService.record({
      actorId: requestingUser.id, actorRole: requestingUser.role,
      action: "ASSIGN", entity: "TICKET", entityId: id,
      metadata: { assigned_to, ref_no: ticket.ref_no },
      ipAddress: ip,
    });

    return { data: updated };
  },

  async setPriority(
    id: number,
    priority: string,
    actorId: number,
    actorRole: string,
    ip?: string
  ) {
    if (!TICKET_PRIORITY_VALUES.has(priority)) return { error: "INVALID_PRIORITY" as const };

    const ticket = await prisma.tickets.findUnique({ where: { id } });
    if (!ticket) return null;

    const updated = await prisma.tickets.update({
      where: { id },
      data: { priority: priority as TicketPriority },
    });

    auditService.record({
      actorId, actorRole, action: "UPDATE", entity: "TICKET", entityId: id,
      metadata: { priority, ref_no: ticket.ref_no },
      ipAddress: ip,
    });

    return { data: updated };
  },

  // ── Messages ───────────────────────────────────────────────────────────────

  async addMessage(
    ticketId: number,
    data: { message: string; is_internal?: boolean; attachments?: { name: string; mime_type: string; url: string; size: number }[] },
    requestingUser: { id: number; role: string },
    ip?: string
  ) {
    const ticket = await prisma.tickets.findUnique({ where: { id: ticketId } });
    if (!ticket) return null;

    if (requestingUser.role === "users" && ticket.user_id !== requestingUser.id) {
      return { error: "FORBIDDEN" as const };
    }
    if (ticket.status === "CLOSED") return { error: "TICKET_CLOSED" as const };

    const is_internal = requestingUser.role !== "users" ? (data.is_internal ?? false) : false;

    const msg = await prisma.ticket_messages.create({
      data: {
        ticket_id: ticketId,
        sender_id: requestingUser.id,
        message: data.message,
        is_internal,
        attachments: data.attachments ? (data.attachments as any) : undefined,
      },
      include: { sender: { select: userSelect } },
    });

    // Auto-advance ticket status based on who replied
    let newStatus: TicketStatus | undefined;
    if (requestingUser.role === "users" && ticket.status === "WAITING_USER") {
      newStatus = "IN_PROGRESS";
    } else if (requestingUser.role !== "users" && ticket.status === "OPEN") {
      newStatus = "IN_PROGRESS";
    } else if (requestingUser.role !== "users" && !is_internal && ticket.status === "IN_PROGRESS") {
      newStatus = "WAITING_USER";
    }

    await prisma.tickets.update({
      where: { id: ticketId },
      data: { ...(newStatus ? { status: newStatus } : {}), updated_at: new Date() },
    });

    auditService.record({
      actorId: requestingUser.id, actorRole: requestingUser.role,
      action: "REPLY", entity: "TICKET", entityId: ticketId,
      metadata: { is_internal, ref_no: ticket.ref_no },
      ipAddress: ip,
    });

    // Email owner when staff sends a non-internal reply
    if (requestingUser.role !== "users" && !is_internal) {
      const owner = await prisma.users.findUnique({
        where: { id: ticket.user_id },
        select: { email: true },
      });
      if (owner) {
        const preview =
          data.message.length > 100
            ? data.message.slice(0, 100) + "..."
            : data.message;
        emailService
          .sendTicketReply(owner.email, ticket.ref_no, ticket.title, preview)
          .catch((e) =>
            logger.error("ticket_reply_email_failed", { error: e.message, ticket_id: ticketId })
          );
      }
    }

    return { data: msg };
  },
};
