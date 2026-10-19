import { mock, describe, it, expect, beforeEach } from "bun:test";

mock.module("../../src/config/database", () => ({
  prisma: {
    orders: { findUnique: mock(() => Promise.resolve(null)) },
    transactions: {
      findFirst: mock(() => Promise.resolve(null)),
      findUnique: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({ id: 10, status: "PENDING" })),
      update: mock(() => Promise.resolve({ id: 10, status: "SUCCESSFUL" })),
      findMany: mock(() => Promise.resolve([])),
      count: mock(() => Promise.resolve(0)),
    },
    $transaction: mock(async (cb: any) => cb({
      transactions: {
        create: mock(() => Promise.resolve({ id: 10, status: "SUCCESSFUL" })),
        update: mock(() => Promise.resolve({ id: 10, status: "SUCCESSFUL" })),
      },
      orders: { update: mock(() => Promise.resolve({})) },
      temp_vps: { create: mock(() => Promise.resolve({})) },
    })),
  },
}));

mock.module("../../src/utils/logger", () => ({
  logger: {
    payment: mock(() => {}),
    error: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    vps: mock(() => {}),
    auth: mock(() => {}),
    admin: mock(() => {}),
  },
}));

mock.module("../../src/services/audit.service", () => ({
  auditService: { record: mock(() => {}) },
}));

mock.module("../../src/services/payment/truemoney.service", () => ({
  truemoneyService: { redeem: mock(() => Promise.resolve({ success: false, error: "Not configured" })) },
}));

mock.module("../../src/services/payment/slipok.service", () => ({
  slipokService: {
    verify: mock(() => Promise.resolve({ success: false, error: "Not configured" })),
    verifyBase64: mock(() => Promise.resolve({ success: false, error: "Not configured" })),
  },
}));

mock.module("../../src/services/system-config.service", () => ({
  systemConfigService: { get: mock(async () => "FILE") },
}));

mock.module("../../src/services/payment/promptpay.service", () => ({
  promptpayService: { generateRef: mock(() => "PP-ABC123-XYZ") },
}));

// vps.service is NOT mocked here to avoid contaminating vps-service.test.ts.
// provision() is fire-and-forget; we verify the transaction result directly.

import { transactionService } from "../../src/services/transaction.service";
import { prisma } from "../../src/config/database";
import { truemoneyService } from "../../src/services/payment/truemoney.service";
import { slipokService } from "../../src/services/payment/slipok.service";
import { systemConfigService } from "../../src/services/system-config.service";

const asMock = (fn: unknown) => fn as ReturnType<typeof mock<() => unknown>>;

// vps.service imports need mocking to prevent real Redis/Proxmox connections in bg
mock.module("../../src/config/redis", () => ({
  redis: {
    setex: mock(() => Promise.resolve("OK")),
    get: mock(() => Promise.resolve(null)),
    del: mock(() => Promise.resolve(1)),
    set: mock(() => Promise.resolve(null)), // provision lock (SET NX) returns null = not acquired
    incr: mock(() => Promise.resolve(1)),
    expire: mock(() => Promise.resolve(1)),
  },
}));

const pendingOrder = {
  id: 1,
  users_id: 1,
  status: "PENDING",
  amount: 500,
  expired_at: new Date(Date.now() + 86400_000),
  ref_no: "QC-20260101-AAA",
};

beforeEach(() => {
  asMock((prisma as any).orders.findUnique).mockResolvedValue(null);
  asMock((prisma as any).transactions.findFirst).mockResolvedValue(null);
  asMock((prisma as any).transactions.findUnique).mockResolvedValue(null);
  asMock((prisma as any).transactions.create).mockResolvedValue({ id: 10, status: "PENDING" });
  asMock((prisma as any).transactions.update).mockResolvedValue({ id: 10, status: "SUCCESSFUL" });
  asMock((prisma as any).transactions.findMany).mockResolvedValue([]);
  asMock((prisma as any).transactions.count).mockResolvedValue(0);
  asMock((prisma as any).$transaction).mockImplementation(async (cb: any) =>
    cb({
      transactions: {
        findFirst: (prisma as any).transactions.findFirst,
        create: () => Promise.resolve({ id: 10, status: "SUCCESSFUL" }),
        update: () => Promise.resolve({ id: 10, status: "SUCCESSFUL" }),
      },
      orders: { update: () => Promise.resolve({}) },
      temp_vps: { create: () => Promise.resolve({}) },
    })
  );
  asMock(truemoneyService.redeem).mockReset();
  asMock(truemoneyService.redeem).mockResolvedValue({ success: false, error: "Not configured" });
  asMock(slipokService.verify).mockReset();
  asMock(slipokService.verify).mockResolvedValue({ success: false, error: "Not configured" });
  asMock((slipokService as any).verifyBase64).mockReset();
  asMock((slipokService as any).verifyBase64).mockResolvedValue({ success: false, error: "Not configured" });
  asMock(systemConfigService.get).mockReset();
  asMock(systemConfigService.get).mockResolvedValue("FILE");
});

// =============================================================================
// transactionService.submit — validation guards
// =============================================================================

describe("transactionService.submit — validation", () => {
  it("returns ORDER_NOT_FOUND when order does not exist", async () => {
    const result = await transactionService.submit({ userId: 1, orderId: 999, paymentMethod: "PROMPTPAY" });
    expect(result).toEqual({ error: "ORDER_NOT_FOUND" });
  });

  it("returns FORBIDDEN when userId does not match order owner", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce({ ...pendingOrder, users_id: 99 });
    const result = await transactionService.submit({ userId: 1, orderId: 1, paymentMethod: "PROMPTPAY" });
    expect(result).toEqual({ error: "FORBIDDEN" });
  });

  it("returns ORDER_NOT_PENDING when order is not in PENDING status", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce({ ...pendingOrder, status: "PAID" });
    const result = await transactionService.submit({ userId: 1, orderId: 1, paymentMethod: "PROMPTPAY" });
    expect(result).toEqual({ error: "ORDER_NOT_PENDING" });
  });

  it("returns ORDER_EXPIRED when order is past expiry", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce({
      ...pendingOrder,
      expired_at: new Date(Date.now() - 1000),
    });
    const result = await transactionService.submit({ userId: 1, orderId: 1, paymentMethod: "PROMPTPAY" });
    expect(result).toEqual({ error: "ORDER_EXPIRED" });
  });

  it("returns ALREADY_PAID when a SUCCESSFUL transaction exists", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder);
    asMock((prisma as any).transactions.findFirst).mockResolvedValueOnce({ id: 5, status: "SUCCESSFUL" });
    const result = await transactionService.submit({ userId: 1, orderId: 1, paymentMethod: "PROMPTPAY" });
    expect(result).toEqual({ error: "ALREADY_PAID" });
  });

  it("TX-DUP-1: PROMPTPAY returns ALREADY_PAID when PENDING tx already exists", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder);
    // First findFirst call returns null (no SUCCESSFUL tx), second returns PENDING tx
    asMock((prisma as any).transactions.findFirst)
      .mockResolvedValueOnce(null)               // SUCCESSFUL check
      .mockResolvedValueOnce({ id: 6, status: "PENDING" }); // PENDING check
    const result = await transactionService.submit({ userId: 1, orderId: 1, paymentMethod: "PROMPTPAY" });
    expect(result).toEqual({ error: "ALREADY_PAID" });
  });
});

// =============================================================================
// transactionService.submit — TRUEMONEY
// =============================================================================

describe("transactionService.submit — TRUEMONEY", () => {
  it("returns VOUCHER_REQUIRED when voucherCode is missing", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder);
    const result = await transactionService.submit({ userId: 1, orderId: 1, paymentMethod: "TRUEMONEY" });
    expect(result).toEqual({ error: "VOUCHER_REQUIRED" });
  });

  it("returns PAYMENT_FAILED when truemoney.redeem fails", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder);
    asMock(truemoneyService.redeem).mockResolvedValueOnce({ success: false, error: "Invalid voucher" });
    const result = await transactionService.submit({
      userId: 1, orderId: 1, paymentMethod: "TRUEMONEY", voucherCode: "ABCDE",
    });
    expect(result).toEqual({ error: "PAYMENT_FAILED", detail: "Invalid voucher" });
  });

  it("returns AMOUNT_MISMATCH when redeemed amount is less than order total", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder); // amount=500
    asMock(truemoneyService.redeem).mockResolvedValueOnce({ success: true, amount: 100, ref_id: "REF1" });
    const result = await transactionService.submit({
      userId: 1, orderId: 1, paymentMethod: "TRUEMONEY", voucherCode: "VOUCHER123",
    });
    expect(result).toEqual({ error: "AMOUNT_MISMATCH" });
  });

  it("creates SUCCESSFUL transaction when redeem succeeds and amount covers order", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder); // amount=500
    asMock(truemoneyService.redeem).mockResolvedValueOnce({ success: true, amount: 500, ref_id: "REF-TM-1" });
    const result = await transactionService.submit({
      userId: 1, orderId: 1, paymentMethod: "TRUEMONEY", voucherCode: "VOUCHER500",
    }) as any;
    expect(result.data).toBeDefined();
    expect(asMock((prisma as any).$transaction)).toHaveBeenCalled();
  });
});

// =============================================================================
// transactionService.submit — SLIP
// =============================================================================

describe("transactionService.submit — SLIP", () => {
  it("returns SLIP_REQUIRED when slipFilePath is missing", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder);
    const result = await transactionService.submit({ userId: 1, orderId: 1, paymentMethod: "SLIP" });
    expect(result).toEqual({ error: "SLIP_REQUIRED" });
  });

  it("returns AMOUNT_MISMATCH when SlipOK returns AMOUNT_MISMATCH", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder);
    asMock(slipokService.verify).mockResolvedValueOnce({ success: false, error: "AMOUNT_MISMATCH" });
    const result = await transactionService.submit({
      userId: 1, orderId: 1, paymentMethod: "SLIP", slipFilePath: "/tmp/slip.jpg", slipUrl: "/uploads/slips/2026-07/abc.jpg",
    });
    expect(result).toEqual({ error: "AMOUNT_MISMATCH" });
  });

  it("returns PAYMENT_FAILED when SlipOK verification fails with other error", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder);
    asMock(slipokService.verify).mockResolvedValueOnce({ success: false, error: "INVALID_QR" });
    const result = await transactionService.submit({
      userId: 1, orderId: 1, paymentMethod: "SLIP", slipFilePath: "/tmp/slip.jpg", slipUrl: "/uploads/slips/2026-07/abc.jpg",
    });
    expect((result as any).error).toBe("PAYMENT_FAILED");
  });

  it("creates SUCCESSFUL transaction when slip verification passes", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder);
    asMock(slipokService.verify).mockResolvedValueOnce({ success: true, amount: 500, ref_id: "SLIPREF1" });
    const result = await transactionService.submit({
      userId: 1, orderId: 1, paymentMethod: "SLIP", slipFilePath: "/tmp/slip.jpg", slipUrl: "/uploads/slips/2026-07/abc.jpg",
    }) as any;
    expect(result.data).toBeDefined();
  });
});

// =============================================================================
// transactionService.submit — SLIP (BASE64 mode)
// =============================================================================

describe("transactionService.submit — SLIP BASE64 mode", () => {
  it("returns SLIP_REQUIRED when slipBase64 is missing in BASE64 mode", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder);
    asMock(systemConfigService.get).mockResolvedValueOnce("BASE64");
    const result = await transactionService.submit({ userId: 1, orderId: 1, paymentMethod: "SLIP" });
    expect(result).toEqual({ error: "SLIP_REQUIRED" });
  });

  it("calls verifyBase64 (not verify) in BASE64 mode", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder);
    asMock(systemConfigService.get).mockResolvedValueOnce("BASE64");
    asMock((slipokService as any).verifyBase64).mockResolvedValueOnce({ success: true, amount: 500, ref_id: "B64REF" });
    await transactionService.submit({
      userId: 1, orderId: 1, paymentMethod: "SLIP",
      slipBase64: "data:image/png;base64,abc123",
    });
    expect(asMock((slipokService as any).verifyBase64)).toHaveBeenCalledWith("data:image/png;base64,abc123", 500);
    expect(asMock(slipokService.verify)).not.toHaveBeenCalled();
  });

  it("creates SUCCESSFUL transaction and stores base64 as slip_url in BASE64 mode", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder);
    asMock(systemConfigService.get).mockResolvedValueOnce("BASE64");
    asMock((slipokService as any).verifyBase64).mockResolvedValueOnce({ success: true, amount: 500, ref_id: "B64REF" });
    const result = await transactionService.submit({
      userId: 1, orderId: 1, paymentMethod: "SLIP",
      slipBase64: "data:image/png;base64,abc123",
    }) as any;
    expect(result.data).toBeDefined();
    expect(asMock((prisma as any).$transaction)).toHaveBeenCalled();
  });
});

// =============================================================================
// transactionService.submit — PROMPTPAY
// =============================================================================

describe("transactionService.submit — PROMPTPAY", () => {
  it("creates PENDING transaction on happy path", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder);
    asMock((prisma as any).transactions.create).mockResolvedValueOnce({ id: 10, status: "PENDING" });
    const result = await transactionService.submit({ userId: 1, orderId: 1, paymentMethod: "PROMPTPAY" }) as any;
    expect(result.data).toBeDefined();
    expect(result.data.status).toBe("PENDING");
  });

  it("stores slip_url when optional slip file is provided", async () => {
    asMock((prisma as any).orders.findUnique).mockResolvedValueOnce(pendingOrder);
    asMock((prisma as any).transactions.create).mockResolvedValueOnce({ id: 11, status: "PENDING", slip_url: "/uploads/slips/2026-07/abc.jpg" });
    const result = await transactionService.submit({
      userId: 1, orderId: 1, paymentMethod: "PROMPTPAY",
      slipUrl: "/uploads/slips/2026-07/abc.jpg",
    }) as any;
    expect(result.data).toBeDefined();
    expect(result.data.slip_url).toBe("/uploads/slips/2026-07/abc.jpg");
  });
});

// =============================================================================
// transactionService.approve
// =============================================================================

describe("transactionService.approve", () => {
  const pendingTx = {
    id: 10,
    status: "PENDING",
    payment_method: "PROMPTPAY",
    order_id: 1,
    amount: 500,
    order: { id: 1, users_id: 1, ref_no: "QC-001", status: "PENDING" },
  };

  it("returns NOT_FOUND when transaction does not exist", async () => {
    const result = await transactionService.approve(999, 1, "admin");
    expect(result).toEqual({ error: "NOT_FOUND" });
  });

  it("returns NOT_PENDING when tx is not in PENDING status", async () => {
    asMock((prisma as any).transactions.findUnique).mockResolvedValueOnce({ ...pendingTx, status: "SUCCESSFUL" });
    const result = await transactionService.approve(10, 1, "admin");
    expect(result).toEqual({ error: "NOT_PENDING" });
  });

  it("returns NOT_PROMPTPAY when payment method is not PROMPTPAY", async () => {
    asMock((prisma as any).transactions.findUnique).mockResolvedValueOnce({
      ...pendingTx, payment_method: "TRUEMONEY",
    });
    const result = await transactionService.approve(10, 1, "admin");
    expect(result).toEqual({ error: "NOT_PROMPTPAY" });
  });

  it("returns ALREADY_PAID when another SUCCESSFUL tx exists for same order", async () => {
    asMock((prisma as any).transactions.findUnique).mockResolvedValueOnce(pendingTx);
    asMock((prisma as any).transactions.findFirst).mockResolvedValueOnce({ id: 5, status: "SUCCESSFUL" });
    const result = await transactionService.approve(10, 1, "admin");
    expect(result).toEqual({ error: "ALREADY_PAID" });
  });

  it("approves transaction and returns SUCCESSFUL status on happy path", async () => {
    asMock((prisma as any).transactions.findUnique).mockResolvedValueOnce(pendingTx);
    asMock((prisma as any).transactions.findFirst).mockResolvedValueOnce(null);
    const result = await transactionService.approve(10, 1, "admin") as any;
    expect(result.data).toBeDefined();
    expect(asMock((prisma as any).$transaction)).toHaveBeenCalled();
  });
});

// =============================================================================
// transactionService.reject
// =============================================================================

describe("transactionService.reject", () => {
  const pendingTx = {
    id: 10,
    status: "PENDING",
    payment_method: "PROMPTPAY",
    order_id: 1,
    amount: 500,
    order: { id: 1, users_id: 1, ref_no: "QC-001" },
  };

  it("returns NOT_FOUND when transaction does not exist", async () => {
    const result = await transactionService.reject(999, 1, "admin", "Fake slip");
    expect(result).toEqual({ error: "NOT_FOUND" });
  });

  it("returns NOT_PENDING when tx is already processed", async () => {
    asMock((prisma as any).transactions.findUnique).mockResolvedValueOnce({ ...pendingTx, status: "REJECT" });
    const result = await transactionService.reject(10, 1, "admin", "reason");
    expect(result).toEqual({ error: "NOT_PENDING" });
  });

  it("returns NOT_PROMPTPAY when method is not PROMPTPAY", async () => {
    asMock((prisma as any).transactions.findUnique).mockResolvedValueOnce({
      ...pendingTx, payment_method: "SLIP",
    });
    const result = await transactionService.reject(10, 1, "admin", "reason");
    expect(result).toEqual({ error: "NOT_PROMPTPAY" });
  });

  it("rejects transaction and returns updated data", async () => {
    asMock((prisma as any).transactions.findUnique).mockResolvedValueOnce(pendingTx);
    asMock((prisma as any).transactions.update).mockResolvedValueOnce({ id: 10, status: "REJECT" });
    const result = await transactionService.reject(10, 1, "admin", "Invalid slip") as any;
    expect(result.data.status).toBe("REJECT");
  });
});

// =============================================================================
// transactionService.list
// =============================================================================

describe("transactionService.list", () => {
  it("USER sees only own transactions (where filter includes users_id)", async () => {
    await transactionService.list({ userId: 5, role: "users", page: 1, limit: 10 });
    const callArg = asMock((prisma as any).transactions.findMany).mock.calls[0][0];
    expect(callArg.where).toEqual({ order: { users_id: 5 } });
  });

  it("ADMIN sees all transactions (no where filter)", async () => {
    await transactionService.list({ userId: 1, role: "admin", page: 1, limit: 10 });
    const callArg = asMock((prisma as any).transactions.findMany).mock.calls.at(-1)![0];
    expect(callArg.where).toEqual({});
  });
});
