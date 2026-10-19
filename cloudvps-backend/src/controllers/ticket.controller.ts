import { ticketService } from "../services/ticket.service";
import { saveUploadedFile, deleteFile, validateFile, type AttachmentMeta } from "../utils/file.utils";
import { UPLOAD_CONFIG } from "../config/upload.config";

function ip(request: Request): string | undefined {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim();
}

function parseId(raw: string, set: any): number | null {
  const n = parseInt(raw, 10);
  if (isNaN(n)) { set.status = 400; return null; }
  return n;
}

export const ticketController = {
  // ── Categories ─────────────────────────────────────────────────────────────

  async listCategories({ set }: any) {
    const data = await ticketService.listCategories(true);
    return { success: true, data };
  },

  async listCategoriesAdmin({ set }: any) {
    const data = await ticketService.listCategories(false);
    return { success: true, data };
  },

  async createCategory({ body, user, request, set }: any) {
    const result = await ticketService.createCategory(
      { name: body.name, description: body.description },
      user.id, user.role, ip(request)
    );
    if (!result) { set.status = 500; return { success: false, message: "Failed to create category." }; }
    if ("error" in result) {
      set.status = 409;
      return { success: false, message: "Category name already exists.", error: result.error };
    }
    set.status = 201;
    return { success: true, data: result.data };
  },

  async updateCategory({ params, body, user, request, set }: any) {
    const id = parseId(params.id, set);
    if (!id) return { success: false, message: "Invalid ID." };
    const result = await ticketService.updateCategory(id, body, user.id, user.role, ip(request));
    if (!result) { set.status = 404; return { success: false, message: "Category not found." }; }
    if ("error" in result) {
      set.status = 409;
      return { success: false, message: "Category name already exists.", error: result.error };
    }
    return { success: true, data: result.data };
  },

  async toggleCategoryStatus({ params, user, request, set }: any) {
    const id = parseId(params.id, set);
    if (!id) return { success: false, message: "Invalid ID." };
    const result = await ticketService.toggleCategoryStatus(id, user.id, user.role, ip(request));
    if (!result) { set.status = 404; return { success: false, message: "Category not found." }; }
    return { success: true, data: result };
  },

  // ── Tickets ────────────────────────────────────────────────────────────────

  async createTicket({ body, user, request, set }: any) {
    const result = await ticketService.createTicket(
      { title: body.title, category_id: body.category_id, message: body.message },
      user.id, user.role, ip(request)
    );
    if ("error" in result) {
      set.status = 404;
      return { success: false, message: "Category not found or inactive.", error: result.error };
    }
    set.status = 201;
    return { success: true, data: result.data };
  },

  async listTickets({ query, user, set }: any) {
    const page = parseInt(query.page ?? "1", 10);
    const limit = Math.min(parseInt(query.limit ?? "20", 10), 100);
    const filters: any = { page, limit };

    // USER sees only own tickets
    if (user.role === "users") {
      filters.userId = user.id;
    } else {
      // Admin/Support can filter by user_id, assigned_to
      if (query.user_id) filters.userId = parseInt(query.user_id, 10);
      if (query.assigned_to) filters.assigned_to = parseInt(query.assigned_to, 10);
    }
    if (query.status) filters.status = query.status;
    if (query.priority) filters.priority = query.priority;
    if (query.category_id) filters.category_id = parseInt(query.category_id, 10);

    const result = await ticketService.listTickets(filters);
    return { success: true, ...result };
  },

  async getTicketById({ params, user, set }: any) {
    const id = parseId(params.id, set);
    if (!id) return { success: false, message: "Invalid ID." };
    const result = await ticketService.getTicketById(id, { id: user.id, role: user.role });
    if (!result) { set.status = 404; return { success: false, message: "Ticket not found." }; }
    if ("error" in result) { set.status = 403; return { success: false, message: "Forbidden." }; }
    return { success: true, data: result.data };
  },

  async updateStatus({ params, body, user, request, set }: any) {
    const id = parseId(params.id, set);
    if (!id) return { success: false, message: "Invalid ID." };
    const result = await ticketService.updateStatus(
      id, body.status, { id: user.id, role: user.role }, ip(request)
    );
    if (!result) { set.status = 404; return { success: false, message: "Ticket not found." }; }
    if ("error" in result) {
      if (result.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Forbidden." }; }
      if (result.error === "INVALID_STATUS") { set.status = 400; return { success: false, message: "Invalid status value." }; }
      if (result.error === "TICKET_ALREADY_CLOSED") { set.status = 409; return { success: false, message: "Ticket is already closed." }; }
    }
    return { success: true, data: (result as any).data };
  },

  async assignTicket({ params, body, user, request, set }: any) {
    const id = parseId(params.id, set);
    if (!id) return { success: false, message: "Invalid ID." };
    const result = await ticketService.assignTicket(
      id, body.assigned_to ?? null, { id: user.id, role: user.role }, ip(request)
    );
    if (!result) { set.status = 404; return { success: false, message: "Ticket not found." }; }
    if ("error" in result) {
      if (result.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Forbidden." }; }
      if (result.error === "INVALID_ASSIGNEE") { set.status = 400; return { success: false, message: "Assignee must be an Admin or Support user." }; }
    }
    return { success: true, data: (result as any).data };
  },

  async setPriority({ params, body, user, request, set }: any) {
    const id = parseId(params.id, set);
    if (!id) return { success: false, message: "Invalid ID." };
    const result = await ticketService.setPriority(id, body.priority, user.id, user.role, ip(request));
    if (!result) { set.status = 404; return { success: false, message: "Ticket not found." }; }
    if ("error" in result) { set.status = 400; return { success: false, message: "Invalid priority value." }; }
    return { success: true, data: (result as any).data };
  },

  // ── Messages ───────────────────────────────────────────────────────────────

  async addMessage({ params, body, user, request, set }: any) {
    const id = parseId(params.id, set);
    if (!id) return { success: false, message: "Invalid ID." };

    // Parse boolean from form string ("true"/"false") or native boolean
    const is_internal = body.is_internal === "true" || body.is_internal === true;

    // Process optional file attachments
    const savedAttachments: AttachmentMeta[] = [];
    const rawFiles: File[] = body.attachments
      ? (Array.isArray(body.attachments) ? body.attachments : [body.attachments]).filter(
          (f: any) => f instanceof File
        )
      : [];

    if (rawFiles.length > UPLOAD_CONFIG.ticket.maxFiles) {
      set.status = 400;
      return { success: false, message: `Maximum ${UPLOAD_CONFIG.ticket.maxFiles} attachments per message.`, error: "TOO_MANY_FILES" };
    }

    for (const file of rawFiles) {
      const err = validateFile(file, UPLOAD_CONFIG.ticket);
      if (err === "FILE_TOO_LARGE") {
        set.status = 400;
        return { success: false, message: `Each attachment must not exceed ${UPLOAD_CONFIG.ticket.maxSizeMB}MB.`, error: "FILE_TOO_LARGE" };
      }
      if (err === "INVALID_FILE_TYPE") {
        set.status = 400;
        return { success: false, message: "Attachments must be images (JPEG, PNG, WebP, or GIF).", error: "INVALID_FILE_TYPE" };
      }
      const saved = await saveUploadedFile(file, UPLOAD_CONFIG.ticket.dir);
      savedAttachments.push({ name: file.name, mime_type: file.type, url: saved.url, size: saved.size });
    }

    const result = await ticketService.addMessage(
      id,
      {
        message: body.message,
        is_internal,
        attachments: savedAttachments.length > 0 ? savedAttachments : undefined,
      },
      { id: user.id, role: user.role },
      ip(request)
    );

    if (!result) {
      // Clean up saved files if ticket not found
      for (const att of savedAttachments) {
        const filePath = att.url.replace(/^\//, "");
        await deleteFile(filePath);
      }
      set.status = 404;
      return { success: false, message: "Ticket not found." };
    }
    if ("error" in result) {
      // Clean up saved files on error
      for (const att of savedAttachments) {
        const filePath = att.url.replace(/^\//, "");
        await deleteFile(filePath);
      }
      if (result.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Forbidden." }; }
      if (result.error === "TICKET_CLOSED") { set.status = 409; return { success: false, message: "Cannot reply to a closed ticket." }; }
    }
    set.status = 201;
    return { success: true, data: (result as any).data };
  },
};
