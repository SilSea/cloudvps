import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import { systemConfigService } from "../system-config.service";

interface TruemoneyResult {
  success: boolean;
  amount?: number;
  ref_id?: string;
  error?: string;
}

export const truemoneyService = {
  async redeem(voucherCode: string): Promise<TruemoneyResult> {
    const cfgMobile = await systemConfigService.get("payment.truemoney_mobile");
    const mobile = cfgMobile || env.truemoney.mobile;

    if (!env.truemoney.apiUrl || !mobile) {
      logger.error("TrueMoney: not configured (TRUEMONEY_API_URL or mobile missing)");
      return { success: false, error: "TrueMoney payment is not available." };
    }

    try {
      const response = await fetch(`${env.truemoney.apiUrl}/${voucherCode}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile }),
      });

      const data = await response.json() as any;

      // TrueMoney API returns status.code === "SUCCESS" on success
      if (!response.ok || data.status?.code !== "SUCCESS") {
        logger.payment("truemoney_redeem_failed", {
          voucherCode,
          code: data.status?.code,
          message: data.status?.message,
        });
        return { success: false, error: data.status?.message || "Voucher redemption failed." };
      }

      const voucher = data.data?.voucher;
      logger.payment("truemoney_redeem_success", { voucherCode, amount: voucher?.redeemed_amount_baht });

      return {
        success: true,
        amount: voucher?.redeemed_amount_baht ?? 0,
        ref_id: voucher?.serial_id ?? voucherCode,
      };
    } catch (err) {
      logger.error("TrueMoney API unreachable", { error: String(err) });
      return { success: false, error: "TrueMoney service unavailable. Please try again later." };
    }
  },
};
