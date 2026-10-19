import { transactionService } from "../services/transaction.service";
import { saveUploadedFile, deleteFile, validateFile } from "../utils/file.utils";
import { UPLOAD_CONFIG } from "../config/upload.config";
import { systemConfigService } from "../services/system-config.service";

const getIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim();

export const transactionController = {
  async submit({ user, body, set, request }: any) {
    let slipFilePath: string | undefined;
    let slipUrl: string | undefined;
    let slipBase64: string | undefined;

    const slipMode = (await systemConfigService.get("payment.slip_mode")) ?? "FILE";

    if (slipMode === "FILE") {
      const slipFile: File | undefined = body.slip_file instanceof File ? body.slip_file : undefined;
      if (slipFile) {
        const err = validateFile(slipFile, UPLOAD_CONFIG.slip);
        if (err === "FILE_TOO_LARGE") {
          set.status = 400;
          return { success: false, message: `Slip image must not exceed ${UPLOAD_CONFIG.slip.maxSizeMB}MB.`, error: "SLIP_TOO_LARGE" };
        }
        if (err === "INVALID_FILE_TYPE") {
          set.status = 400;
          return { success: false, message: "Slip must be an image (JPEG, PNG, WebP, or GIF).", error: "INVALID_FILE_TYPE" };
        }
        const saved = await saveUploadedFile(slipFile, UPLOAD_CONFIG.slip.dir);
        slipFilePath = saved.filePath;
        slipUrl = saved.url;
      }
    } else {
      // BASE64 mode: read slip_image text field (base64 string)
      const raw = typeof body.slip_image === "string" && body.slip_image ? body.slip_image : undefined;
      if (raw) {
        // Approximate decoded byte size from base64 length
        const approxBytes = Math.ceil((raw.length * 3) / 4);
        if (approxBytes > UPLOAD_CONFIG.slip.maxSizeMB * 1024 * 1024) {
          set.status = 400;
          return { success: false, message: `Slip image must not exceed ${UPLOAD_CONFIG.slip.maxSizeMB}MB.`, error: "SLIP_TOO_LARGE" };
        }
        slipBase64 = raw;
      }
    }

    const result = await transactionService.submit({
      userId: user.id,
      orderId: body.order_id,
      paymentMethod: body.payment_method,
      voucherCode: body.voucher_code,
      slipFilePath,
      slipUrl,
      slipBase64,
    });

    // FILE mode: clean up saved file if payment failed
    if (result.error && slipFilePath) {
      await deleteFile(slipFilePath);
    }

    if (result.error) {
      const statusMap: Record<string, number> = {
        ORDER_NOT_FOUND: 404,
        FORBIDDEN: 403,
        ORDER_NOT_PENDING: 400,
        ORDER_EXPIRED: 400,
        ALREADY_PAID: 409,
        VOUCHER_REQUIRED: 400,
        SLIP_REQUIRED: 400,
        PAYMENT_FAILED: 402,
        AMOUNT_MISMATCH: 400,
        INVALID_METHOD: 400,
      };
      const msgMap: Record<string, string> = {
        ORDER_NOT_FOUND: "Order not found.",
        FORBIDDEN: "Access denied.",
        ORDER_NOT_PENDING: "Order is not in pending state.",
        ORDER_EXPIRED: "Order has expired.",
        ALREADY_PAID: "Order already has a successful payment.",
        VOUCHER_REQUIRED: "Voucher code is required for TrueMoney payment.",
        SLIP_REQUIRED: "Slip image is required for SLIP payment.",
        PAYMENT_FAILED: (result as any).detail ?? "Payment verification failed.",
        AMOUNT_MISMATCH: "Payment amount does not match order amount.",
        INVALID_METHOD: "Invalid payment method.",
      };
      set.status = statusMap[result.error] ?? 400;
      return { success: false, message: msgMap[result.error] ?? "Error.", error: result.error };
    }

    set.status = 201;
    return { success: true, data: result.data };
  },

  async approve({ user, params, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      set.status = 400;
      return { success: false, message: "Invalid transaction ID." };
    }

    const result = await transactionService.approve(id, user.id, user.role, getIp(request));

    if (result.error) {
      const statusMap: Record<string, number> = { NOT_FOUND: 404, NOT_PENDING: 400, NOT_PROMPTPAY: 400, ALREADY_PAID: 409 };
      const msgMap: Record<string, string> = {
        NOT_FOUND: "Transaction not found.",
        NOT_PENDING: "Transaction is not pending.",
        NOT_PROMPTPAY: "Only PromptPay transactions can be manually approved.",
        ALREADY_PAID: "Order already has a successful payment.",
      };
      set.status = statusMap[result.error] ?? 400;
      return { success: false, message: msgMap[result.error] ?? "Error." };
    }

    return { success: true, data: result.data };
  },

  async reject({ user, params, body, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      set.status = 400;
      return { success: false, message: "Invalid transaction ID." };
    }

    const result = await transactionService.reject(
      id, user.id, user.role,
      body.reason ?? "",
      getIp(request)
    );

    if (result.error) {
      const statusMap: Record<string, number> = { NOT_FOUND: 404, NOT_PENDING: 400, NOT_PROMPTPAY: 400 };
      const msgMap: Record<string, string> = {
        NOT_FOUND: "Transaction not found.",
        NOT_PENDING: "Transaction is not pending.",
        NOT_PROMPTPAY: "Only PromptPay transactions can be rejected.",
      };
      set.status = statusMap[result.error] ?? 400;
      return { success: false, message: msgMap[result.error] ?? "Error." };
    }

    return { success: true, data: result.data };
  },

  async list({ user, query }: any) {
    const page = Math.max(1, parseInt(query?.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query?.limit ?? "20", 10)));
    const result = await transactionService.list({ userId: user.id, role: user.role, page, limit });
    return { success: true, ...result };
  },
};
