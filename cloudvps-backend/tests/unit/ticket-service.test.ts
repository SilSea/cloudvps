import { mock, describe, it, expect, beforeEach } from "bun:test";

const mockAuditRecord = mock(() => {});
const mockSendTicketReply = mock(() => Promise.resolve());
const mockSendTicketClosed = mock(() => Promise.resolve());

mock.module("../../src/services/audit.service", () => ({
  auditService: { record: mockAuditRecord },
}));
mock.module("../../src/services/email.service", () => ({
  emailService: {
    sendTicketReply: mockSendTicketReply,
    sendTicketClosed: mockSendTicketClosed,
  },
}));
mock.module("../../src/utils/logger", () => ({
  logger: {
    info:    mock(() => {}),
    warn:    mock(() => {}),
    error:   mock(() => {}),
    auth:    mock(() => {}),
    payment: mock(() => {}),
    vps:     mock(() => {}),
    admin:   mock(() => {}),
  },
}));

const sampleCat = { id: 1, name: "Technical", description: null, status: true, created_at: new Date(), updated_at: null };
const sampleUser = { id: 1, email: "user@test.com" };
const sampleTicket = {
  id: 1, ref_no: "TKT-20260629-12345", title: "Test ticket",
  category_id: 1, priority: "MEDIUM", status: "OPEN",
  user_id: 1, assigned_to: null, closed_at: null,
  created_at: new Date(), updated_at: null,
};
const sampleMsg = {
  id: 1, ticket_id: 1, sender_id: 1, message: "Hello",
  is_internal: false, attachments: null, created_at: new Date(),
  sender: { id: 1, email: "user@test.com", users_info: { first_name: "Test", last_name: "User" } },
};

mock.module("../../src/config/database", () => ({
  prisma: {
    ticket_categories: {
      findMany: mock(() => Promise.resolve([])),
      findUnique: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve(sampleCat)),
      update: mock(() => Promise.resolve(sampleCat)),
    },
    tickets: {
      findUnique: mock(() => Promise.resolve(null)),
      findMany: mock(() => Promise.resolve([])),
      count: mock(() => Promise.resolve(0)),
      create: mock(() => Promise.resolve({ ...sampleTicket, category: sampleCat, user: sampleUser, messages: [sampleMsg] })),
      update: mock(() => Promise.resolve(sampleTicket)),
    },
    ticket_messages: {
      create: mock(() => Promise.resolve(sampleMsg)),
    },
    users: {
      findUnique: mock(() => Promise.resolve(null)),
    },
  },
}));

import { ticketService } from "../../src/services/ticket.service";
import { prisma } from "../../src/config/database";

const asMock = (fn: unknown) => fn as ReturnType<typeof mock<() => unknown>>;

beforeEach(() => {
  mockAuditRecord.mockClear();
  mockSendTicketReply.mockClear();
  mockSendTicketClosed.mockClear();
  asMock((prisma as any).ticket_categories.findMany).mockClear().mockResolvedValue([]);
  asMock((prisma as any).ticket_categories.findUnique).mockClear().mockResolvedValue(null);
  asMock((prisma as any).ticket_categories.create).mockClear().mockResolvedValue(sampleCat);
  asMock((prisma as any).ticket_categories.update).mockClear().mockResolvedValue(sampleCat);
  asMock((prisma as any).tickets.findUnique).mockClear().mockResolvedValue(null);
  asMock((prisma as any).tickets.findMany).mockClear().mockResolvedValue([]);
  asMock((prisma as any).tickets.count).mockClear().mockResolvedValue(0);
  asMock((prisma as any).tickets.create).mockClear().mockResolvedValue({ ...sampleTicket, category: sampleCat, user: sampleUser, messages: [sampleMsg] });
  asMock((prisma as any).tickets.update).mockClear().mockResolvedValue(sampleTicket);
  asMock((prisma as any).ticket_messages.create).mockClear().mockResolvedValue(sampleMsg);
  asMock((prisma as any).users.findUnique).mockClear().mockResolvedValue(null);
});

// ── Category tests ─────────────────────────────────────────────────────────

describe("ticketService.listCategories", () => {
  it("returns all categories when activeOnly=false", async () => {
    asMock((prisma as any).ticket_categories.findMany).mockResolvedValue([sampleCat, { ...sampleCat, id: 2, status: false }]);
    const result = await ticketService.listCategories(false);
    expect(result).toHaveLength(2);
    expect((prisma as any).ticket_categories.findMany).toHaveBeenCalledWith({ where: undefined, orderBy: { name: "asc" } });
  });

  it("filters inactive when activeOnly=true", async () => {
    asMock((prisma as any).ticket_categories.findMany).mockResolvedValue([sampleCat]);
    await ticketService.listCategories(true);
    expect((prisma as any).ticket_categories.findMany).toHaveBeenCalledWith({ where: { status: true }, orderBy: { name: "asc" } });
  });
});

describe("ticketService.createCategory", () => {
  it("creates category and records audit", async () => {
    asMock((prisma as any).ticket_categories.findUnique).mockResolvedValue(null);
    asMock((prisma as any).ticket_categories.create).mockResolvedValue(sampleCat);
    const result = await ticketService.createCategory({ name: "Technical" }, 1, "admin");
    expect(result).toHaveProperty("data");
    expect(mockAuditRecord).toHaveBeenCalledTimes(1);
  });

  it("returns CATEGORY_NAME_EXISTS when name already taken", async () => {
    asMock((prisma as any).ticket_categories.findUnique).mockResolvedValue(sampleCat);
    const result = await ticketService.createCategory({ name: "Technical" }, 1, "admin");
    expect(result).toHaveProperty("error", "CATEGORY_NAME_EXISTS");
    expect((prisma as any).ticket_categories.create).not.toHaveBeenCalled();
  });
});

describe("ticketService.updateCategory", () => {
  it("returns null when category not found", async () => {
    const result = await ticketService.updateCategory(99, { name: "New" }, 1, "admin");
    expect(result).toBeNull();
  });

  it("updates category description (no name change, no dup check)", async () => {
    asMock((prisma as any).ticket_categories.findUnique).mockResolvedValue(sampleCat);
    const result = await ticketService.updateCategory(1, { description: "New desc" }, 1, "admin");
    expect(result).toHaveProperty("data");
    expect(mockAuditRecord).toHaveBeenCalledTimes(1);
  });

  it("returns CATEGORY_NAME_EXISTS on duplicate name", async () => {
    // First call: get existing cat. Second call: dup check finds another cat with same name.
    asMock((prisma as any).ticket_categories.findUnique)
      .mockResolvedValueOnce(sampleCat)
      .mockResolvedValueOnce({ ...sampleCat, id: 2, name: "Other" });
    const result = await ticketService.updateCategory(1, { name: "Other" }, 1, "admin");
    expect(result).toHaveProperty("error", "CATEGORY_NAME_EXISTS");
  });
});

describe("ticketService.toggleCategoryStatus", () => {
  it("returns null when not found", async () => {
    expect(await ticketService.toggleCategoryStatus(99, 1, "admin")).toBeNull();
  });

  it("toggles status and records audit", async () => {
    asMock((prisma as any).ticket_categories.findUnique).mockResolvedValue(sampleCat);
    asMock((prisma as any).ticket_categories.update).mockResolvedValue({ ...sampleCat, status: false });
    const result = await ticketService.toggleCategoryStatus(1, 1, "admin");
    expect(result).toHaveProperty("status", false);
    expect(mockAuditRecord).toHaveBeenCalledTimes(1);
  });
});

// ── Ticket tests ───────────────────────────────────────────────────────────

describe("ticketService.createTicket", () => {
  it("returns CATEGORY_NOT_FOUND when category inactive or missing", async () => {
    asMock((prisma as any).ticket_categories.findUnique).mockResolvedValue(null);
    const result = await ticketService.createTicket({ title: "Help", category_id: 99, message: "Issue" }, 1, "users");
    expect(result).toHaveProperty("error", "CATEGORY_NOT_FOUND");
  });

  it("creates ticket with initial message and records audit", async () => {
    asMock((prisma as any).ticket_categories.findUnique).mockResolvedValue(sampleCat);
    const result = await ticketService.createTicket({ title: "Help", category_id: 1, message: "Issue" }, 1, "users");
    expect(result).toHaveProperty("data");
    expect(mockAuditRecord).toHaveBeenCalledTimes(1);
  });
});

describe("ticketService.listTickets", () => {
  it("returns paginated results", async () => {
    asMock((prisma as any).tickets.count).mockResolvedValue(5);
    asMock((prisma as any).tickets.findMany).mockResolvedValue([sampleTicket]);
    const result = await ticketService.listTickets({ page: 1, limit: 20 });
    expect(result.total).toBe(5);
    expect(result.data).toHaveLength(1);
  });

  it("filters by userId when provided", async () => {
    await ticketService.listTickets({ userId: 2 });
    expect((prisma as any).tickets.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ user_id: 2 }) })
    );
  });
});

describe("ticketService.getTicketById", () => {
  it("returns null when ticket not found", async () => {
    expect(await ticketService.getTicketById(99, { id: 1, role: "users" })).toBeNull();
  });

  it("returns FORBIDDEN when user accesses another's ticket", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue({ ...sampleTicket, user_id: 2, messages: [] });
    const result = await ticketService.getTicketById(1, { id: 1, role: "users" });
    expect(result).toHaveProperty("error", "FORBIDDEN");
  });

  it("allows user to view own ticket", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue({ ...sampleTicket, user_id: 1, messages: [] });
    const result = await ticketService.getTicketById(1, { id: 1, role: "users" });
    expect(result).toHaveProperty("data");
  });

  it("allows admin to view any ticket", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue({ ...sampleTicket, user_id: 99, messages: [] });
    const result = await ticketService.getTicketById(1, { id: 1, role: "admin" });
    expect(result).toHaveProperty("data");
  });
});

describe("ticketService.updateStatus", () => {
  it("returns null when ticket not found", async () => {
    expect(await ticketService.updateStatus(99, "CLOSED", { id: 1, role: "admin" })).toBeNull();
  });

  it("returns INVALID_STATUS for unknown status", async () => {
    const result = await ticketService.updateStatus(1, "INVALID", { id: 1, role: "admin" });
    expect(result).toHaveProperty("error", "INVALID_STATUS");
  });

  it("returns FORBIDDEN when user tries non-CLOSED status", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue({ ...sampleTicket, user_id: 1 });
    const result = await ticketService.updateStatus(1, "RESOLVED", { id: 1, role: "users" });
    expect(result).toHaveProperty("error", "FORBIDDEN");
  });

  it("returns FORBIDDEN when user tries to update another's ticket", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue({ ...sampleTicket, user_id: 2 });
    const result = await ticketService.updateStatus(1, "CLOSED", { id: 1, role: "users" });
    expect(result).toHaveProperty("error", "FORBIDDEN");
  });

  it("sends email on CLOSED and records audit", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue({ ...sampleTicket, user_id: 1 });
    asMock((prisma as any).tickets.update).mockResolvedValue({ ...sampleTicket, status: "CLOSED" });
    asMock((prisma as any).users.findUnique).mockResolvedValue(sampleUser);
    await ticketService.updateStatus(1, "CLOSED", { id: 1, role: "admin" });
    expect(mockAuditRecord).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSendTicketClosed).toHaveBeenCalledTimes(1);
  });

  it("blocks status update on already closed ticket", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue({ ...sampleTicket, status: "CLOSED", user_id: 1 });
    const result = await ticketService.updateStatus(1, "OPEN", { id: 1, role: "admin" });
    expect(result).toHaveProperty("error", "TICKET_ALREADY_CLOSED");
  });
});

describe("ticketService.assignTicket", () => {
  it("returns null when ticket not found", async () => {
    expect(await ticketService.assignTicket(99, 2, { id: 1, role: "admin" })).toBeNull();
  });

  it("returns INVALID_ASSIGNEE when assigning to a regular user", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue(sampleTicket);
    asMock((prisma as any).users.findUnique).mockResolvedValue({ id: 2, role: { role_name: "users" } });
    const result = await ticketService.assignTicket(1, 2, { id: 1, role: "admin" });
    expect(result).toHaveProperty("error", "INVALID_ASSIGNEE");
  });

  it("support cannot assign to another staff member", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue(sampleTicket);
    asMock((prisma as any).users.findUnique).mockResolvedValue({ id: 3, role: { role_name: "support" } });
    const result = await ticketService.assignTicket(1, 3, { id: 2, role: "support" });
    expect(result).toHaveProperty("error", "FORBIDDEN");
  });

  it("support can self-assign", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue(sampleTicket);
    asMock((prisma as any).users.findUnique).mockResolvedValue({ id: 2, role: { role_name: "support" } });
    asMock((prisma as any).tickets.update).mockResolvedValue({ ...sampleTicket, assigned_to: 2, status: "IN_PROGRESS" });
    const result = await ticketService.assignTicket(1, 2, { id: 2, role: "support" });
    expect(result).toHaveProperty("data");
  });
});

describe("ticketService.setPriority", () => {
  it("returns INVALID_PRIORITY for unknown value", async () => {
    const result = await ticketService.setPriority(1, "EXTREME", 1, "admin");
    expect(result).toHaveProperty("error", "INVALID_PRIORITY");
  });

  it("updates priority and records audit", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue(sampleTicket);
    asMock((prisma as any).tickets.update).mockResolvedValue({ ...sampleTicket, priority: "HIGH" });
    const result = await ticketService.setPriority(1, "HIGH", 1, "admin");
    expect(result).toHaveProperty("data");
    expect(mockAuditRecord).toHaveBeenCalledTimes(1);
  });
});

// ── Message tests ──────────────────────────────────────────────────────────

describe("ticketService.addMessage", () => {
  it("returns null when ticket not found", async () => {
    expect(await ticketService.addMessage(99, { message: "Hi" }, { id: 1, role: "users" })).toBeNull();
  });

  it("returns FORBIDDEN when user replies to another's ticket", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue({ ...sampleTicket, user_id: 2 });
    const result = await ticketService.addMessage(1, { message: "Hi" }, { id: 1, role: "users" });
    expect(result).toHaveProperty("error", "FORBIDDEN");
  });

  it("returns TICKET_CLOSED for closed tickets", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue({ ...sampleTicket, status: "CLOSED", user_id: 1 });
    const result = await ticketService.addMessage(1, { message: "Hi" }, { id: 1, role: "users" });
    expect(result).toHaveProperty("error", "TICKET_CLOSED");
  });

  it("forces is_internal=false for USER role", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue({ ...sampleTicket, user_id: 1 });
    asMock((prisma as any).ticket_messages.create).mockResolvedValue(sampleMsg);
    asMock((prisma as any).tickets.update).mockResolvedValue(sampleTicket);
    await ticketService.addMessage(1, { message: "Hi", is_internal: true }, { id: 1, role: "users" });
    expect((prisma as any).ticket_messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ is_internal: false }) })
    );
  });

  it("sends email to owner when staff replies (non-internal)", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue({ ...sampleTicket, user_id: 1 });
    asMock((prisma as any).ticket_messages.create).mockResolvedValue(sampleMsg);
    asMock((prisma as any).tickets.update).mockResolvedValue(sampleTicket);
    asMock((prisma as any).users.findUnique).mockResolvedValue(sampleUser);
    await ticketService.addMessage(1, { message: "We are checking" }, { id: 2, role: "support" });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSendTicketReply).toHaveBeenCalledTimes(1);
  });

  it("does NOT send email for internal notes", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue({ ...sampleTicket, user_id: 1 });
    asMock((prisma as any).ticket_messages.create).mockResolvedValue({ ...sampleMsg, is_internal: true });
    asMock((prisma as any).tickets.update).mockResolvedValue(sampleTicket);
    await ticketService.addMessage(1, { message: "Internal note", is_internal: true }, { id: 2, role: "support" });
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSendTicketReply).not.toHaveBeenCalled();
  });

  it("records audit on every message", async () => {
    asMock((prisma as any).tickets.findUnique).mockResolvedValue({ ...sampleTicket, user_id: 1 });
    asMock((prisma as any).ticket_messages.create).mockResolvedValue(sampleMsg);
    asMock((prisma as any).tickets.update).mockResolvedValue(sampleTicket);
    await ticketService.addMessage(1, { message: "Hi" }, { id: 1, role: "users" });
    expect(mockAuditRecord).toHaveBeenCalledTimes(1);
  });
});
