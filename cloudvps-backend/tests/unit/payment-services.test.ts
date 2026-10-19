import { mock, describe, it, expect, beforeEach } from "bun:test";

// Mock file.utils so slipokService.verify doesn't need real files on disk
mock.module("../../src/utils/file.utils", () => ({
  fileToBase64: mock(async (_path: string) => "mockedbase64content"),
  saveUploadedFile: mock(async () => ({ url: "/uploads/test.png", filePath: "uploads/test.png", size: 100, mimeType: "image/png" })),
  deleteFile: mock(async () => {}),
  validateFile: mock(() => null),
}));

// ---------------------------------------------------------------------------
// Mock env so services see either "configured" or "unconfigured" credentials.
// ---------------------------------------------------------------------------
let mockSlipokApiKey = "test_api_key";
let mockSlipokBranchId = "test_branch";
let mockTruemoneyApiUrl = "https://gift.truemoney.com/campaign/vouchers";
let mockTruemoneyMobile = "0812345678";

mock.module("../../src/config/env", () => ({
  env: {
    slipok: {
      get apiKey() { return mockSlipokApiKey; },
      get branchId() { return mockSlipokBranchId; },
    },
    truemoney: {
      get apiUrl() { return mockTruemoneyApiUrl; },
      get mobile() { return mockTruemoneyMobile; },
    },
    redis: { host: "localhost", port: 6379, password: "" },
    jwt: { accessSecret: "test-access-secret", refreshSecret: "test-refresh-secret" },
    email: { host: "localhost", port: 587, user: "", pass: "" },
    proxmox: { host: "", tokenId: "", tokenSecret: "", node: "", storage: "", bridge: "", gatewayPublic: "", gatewayPrivate: "", subnet: "", defaultUser: "ubuntu" },
    app: { port: 3000, nodeEnv: "test" },
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

// ---------------------------------------------------------------------------
// Intercept global fetch for HTTP mocking.
// ---------------------------------------------------------------------------
let mockFetchResponse: { ok: boolean; json: () => Promise<any> } = {
  ok: true,
  json: () => Promise.resolve({}),
};

(globalThis as any).fetch = mock(async () => mockFetchResponse);

import { slipokService } from "../../src/services/payment/slipok.service";
import { truemoneyService } from "../../src/services/payment/truemoney.service";
import { promptpayService } from "../../src/services/payment/promptpay.service";

const asMock = (fn: unknown) => fn as ReturnType<typeof mock<() => unknown>>;

beforeEach(() => {
  mockSlipokApiKey = "test_api_key";
  mockSlipokBranchId = "test_branch";
  mockTruemoneyApiUrl = "https://gift.truemoney.com/campaign/vouchers";
  mockTruemoneyMobile = "0812345678";
  mockFetchResponse = { ok: true, json: () => Promise.resolve({}) };
  asMock((globalThis as any).fetch).mockResolvedValue(mockFetchResponse);
});

// =============================================================================
// promptpayService.generateRef
// =============================================================================

describe("promptpayService.generateRef", () => {
  it("returns a string starting with PP-", () => {
    const ref = promptpayService.generateRef();
    expect(ref).toMatch(/^PP-/);
  });

  it("generates unique refs across calls", () => {
    const refs = new Set(Array.from({ length: 20 }, () => promptpayService.generateRef()));
    expect(refs.size).toBe(20);
  });
});

// =============================================================================
// slipokService.verify
// =============================================================================

// slipokService.verify now accepts a file path; fileToBase64 is mocked to return "mockedbase64content"
describe("slipokService.verify", () => {
  it("returns not available when SLIPOK_API_KEY is missing", async () => {
    mockSlipokApiKey = "";
    const result = await slipokService.verify("/tmp/slip.jpg");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not available/i);
  });

  it("returns not available when SLIPOK_BRANCH_ID is missing", async () => {
    mockSlipokBranchId = "";
    const result = await slipokService.verify("/tmp/slip.jpg");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not available/i);
  });

  it("returns AMOUNT_MISMATCH for SlipOK error code 1013", async () => {
    mockFetchResponse = { ok: false, json: () => Promise.resolve({ code: 1013, message: "amount mismatch" }) };
    asMock((globalThis as any).fetch).mockResolvedValueOnce(mockFetchResponse);
    const result = await slipokService.verify("/tmp/slip.jpg", 500);
    expect(result.success).toBe(false);
    expect(result.error).toBe("AMOUNT_MISMATCH");
  });

  it("returns DUPLICATE_SLIP for error code 1012", async () => {
    mockFetchResponse = { ok: false, json: () => Promise.resolve({ code: 1012, message: "dup" }) };
    asMock((globalThis as any).fetch).mockResolvedValueOnce(mockFetchResponse);
    const result = await slipokService.verify("/tmp/slip.jpg");
    expect(result.error).toBe("DUPLICATE_SLIP");
  });

  it("returns WRONG_RECEIVER for error code 1014", async () => {
    mockFetchResponse = { ok: false, json: () => Promise.resolve({ code: 1014, message: "wrong" }) };
    asMock((globalThis as any).fetch).mockResolvedValueOnce(mockFetchResponse);
    const result = await slipokService.verify("/tmp/slip.jpg");
    expect(result.error).toBe("WRONG_RECEIVER");
  });

  it("returns success with amount and ref_id on happy path", async () => {
    mockFetchResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { success: true, transRef: "TXN123", amount: 500, receivingBank: "KBANK" },
        }),
    };
    asMock((globalThis as any).fetch).mockResolvedValueOnce(mockFetchResponse);
    const result = await slipokService.verify("/tmp/slip.jpg", 500);
    expect(result.success).toBe(true);
    expect(result.amount).toBe(500);
    expect(result.ref_id).toBe("TXN123");
  });

  it("sends the base64 content (from fileToBase64) to SlipOK API", async () => {
    mockFetchResponse = {
      ok: true,
      json: () => Promise.resolve({ success: true, data: { success: true, transRef: "R1", amount: 0 } }),
    };
    asMock((globalThis as any).fetch).mockResolvedValueOnce(mockFetchResponse);
    await slipokService.verify("/tmp/slip.jpg");
    const callArg = JSON.parse(asMock((globalThis as any).fetch).mock.calls.at(-1)![1].body);
    expect(callArg.files).toBe("mockedbase64content");
  });

  it("returns error when fetch throws (network error)", async () => {
    asMock((globalThis as any).fetch).mockRejectedValueOnce(new Error("Network failure"));
    const result = await slipokService.verify("/tmp/slip.jpg");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unavailable/i);
  });
});

// =============================================================================
// slipokService.verifyBase64
// =============================================================================

describe("slipokService.verifyBase64", () => {
  it("returns not available when SLIPOK_API_KEY is missing", async () => {
    mockSlipokApiKey = "";
    const result = await slipokService.verifyBase64("base64data");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not available/i);
  });

  it("sends base64 directly to SlipOK API without calling fileToBase64", async () => {
    mockFetchResponse = {
      ok: true,
      json: () => Promise.resolve({ success: true, data: { success: true, transRef: "B64-REF", amount: 0 } }),
    };
    asMock((globalThis as any).fetch).mockResolvedValueOnce(mockFetchResponse);
    await slipokService.verifyBase64("mybase64imagedata");
    const callArg = JSON.parse(asMock((globalThis as any).fetch).mock.calls.at(-1)![1].body);
    expect(callArg.files).toBe("mybase64imagedata");
  });

  it("returns success with amount and ref_id on happy path", async () => {
    mockFetchResponse = {
      ok: true,
      json: () => Promise.resolve({ success: true, data: { success: true, transRef: "B64-TXN", amount: 300, receivingBank: "SCB" } }),
    };
    asMock((globalThis as any).fetch).mockResolvedValueOnce(mockFetchResponse);
    const result = await slipokService.verifyBase64("mybase64imagedata", 300);
    expect(result.success).toBe(true);
    expect(result.amount).toBe(300);
    expect(result.ref_id).toBe("B64-TXN");
  });

  it("returns AMOUNT_MISMATCH for SlipOK error code 1013", async () => {
    mockFetchResponse = { ok: false, json: () => Promise.resolve({ code: 1013, message: "mismatch" }) };
    asMock((globalThis as any).fetch).mockResolvedValueOnce(mockFetchResponse);
    const result = await slipokService.verifyBase64("base64data", 500);
    expect(result.success).toBe(false);
    expect(result.error).toBe("AMOUNT_MISMATCH");
  });

  it("returns error when fetch throws (network error)", async () => {
    asMock((globalThis as any).fetch).mockRejectedValueOnce(new Error("Timeout"));
    const result = await slipokService.verifyBase64("base64data");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unavailable/i);
  });
});

// =============================================================================
// truemoneyService.redeem
// =============================================================================

describe("truemoneyService.redeem", () => {
  it("returns not available when TRUEMONEY_API_URL is missing", async () => {
    mockTruemoneyApiUrl = "";
    const result = await truemoneyService.redeem("VOUCHER1");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not available/i);
  });

  it("returns not available when TRUEMONEY_MOBILE is missing", async () => {
    mockTruemoneyMobile = "";
    const result = await truemoneyService.redeem("VOUCHER1");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not available/i);
  });

  it("returns error when API response status.code is not SUCCESS", async () => {
    mockFetchResponse = {
      ok: false,
      json: () => Promise.resolve({ status: { code: "VOUCHER_NOT_FOUND", message: "Not found" } }),
    };
    asMock((globalThis as any).fetch).mockResolvedValueOnce(mockFetchResponse);
    const result = await truemoneyService.redeem("INVALID123");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not found");
  });

  it("returns success with amount and ref_id on happy path", async () => {
    mockFetchResponse = {
      ok: true,
      json: () =>
        Promise.resolve({
          status: { code: "SUCCESS" },
          data: { voucher: { redeemed_amount_baht: 100, serial_id: "SERIAL001" } },
        }),
    };
    asMock((globalThis as any).fetch).mockResolvedValueOnce(mockFetchResponse);
    const result = await truemoneyService.redeem("VOUCHERCODE");
    expect(result.success).toBe(true);
    expect(result.amount).toBe(100);
    expect(result.ref_id).toBe("SERIAL001");
  });

  it("returns error when fetch throws (network error)", async () => {
    asMock((globalThis as any).fetch).mockRejectedValueOnce(new Error("Timeout"));
    const result = await truemoneyService.redeem("VOUCHER");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unavailable/i);
  });
});
