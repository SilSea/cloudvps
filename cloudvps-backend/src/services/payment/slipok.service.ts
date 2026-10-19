import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import { fileToBase64 } from "../../utils/file.utils";
import { systemConfigService } from "../system-config.service";

interface SlipokResult {
  success: boolean;
  amount?: number;
  ref_id?: string;
  error?: string;
}

async function resolveSlipokCredentials(): Promise<{ apiKey: string; branchId: string }> {
  const [cfgKey, cfgBranch] = await Promise.all([
    systemConfigService.get("payment.slipok_api_key"),
    systemConfigService.get("payment.slipok_branch_id"),
  ]);
  return {
    apiKey:   cfgKey    || env.slipok.apiKey,
    branchId: cfgBranch || env.slipok.branchId,
  };
}

async function callSlipOkApi(slipBase64: string, orderAmount?: number): Promise<SlipokResult> {
  const { apiKey, branchId } = await resolveSlipokCredentials();
  const body: Record<string, unknown> = { files: slipBase64, log: true };
  if (orderAmount !== undefined) body.amount = orderAmount;

  const response = await fetch(
    `https://api.slipok.com/api/line/apikey/${branchId}`,
    {
      method: "POST",
      headers: {
        "x-authorization": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json() as any;

  if (!response.ok) {
    const code: number = data.code;
    logger.payment("slipok_verify_failed", { code, message: data.message });
    if (code === 1013) return { success: false, error: "AMOUNT_MISMATCH" };
    if (code === 1012) return { success: false, error: "DUPLICATE_SLIP" };
    if (code === 1014) return { success: false, error: "WRONG_RECEIVER" };
    if (code === 1011) return { success: false, error: "INVALID_QR" };
    if (code === 1010) return { success: false, error: "BANK_DELAY" };
    return { success: false, error: data.message || "Slip verification failed." };
  }

  if (!data.success || !data.data?.success) {
    logger.payment("slipok_verify_failed", { response: data });
    return { success: false, error: "Slip verification failed." };
  }

  const slip = data.data;
  logger.payment("slipok_verify_success", {
    transRef: slip.transRef,
    amount: slip.amount,
    receivingBank: slip.receivingBank,
  });

  return { success: true, amount: slip.amount ?? 0, ref_id: slip.transRef };
}

async function isConfigured(): Promise<boolean> {
  const { apiKey, branchId } = await resolveSlipokCredentials();
  return !!(apiKey && branchId);
}

export const slipokService = {
  // FILE mode: reads image from disk, converts to base64, then calls SlipOK
  async verify(slipFilePath: string, orderAmount?: number): Promise<SlipokResult> {
    if (!await isConfigured()) {
      logger.error("SlipOK: not configured (api_key or branch_id missing in system_configs and env)");
      return { success: false, error: "Slip verification is not available." };
    }

    let slipBase64: string;
    try {
      slipBase64 = await fileToBase64(slipFilePath);
    } catch {
      logger.error("SlipOK: failed to read slip file", { slipFilePath });
      return { success: false, error: "Slip file could not be read." };
    }

    try {
      return await callSlipOkApi(slipBase64, orderAmount);
    } catch (err) {
      logger.error("SlipOK API unreachable", { error: String(err) });
      return { success: false, error: "Slip verification service unavailable. Please try again later." };
    }
  },

  // BASE64 mode: caller supplies raw base64 string; skips disk read
  async verifyBase64(slipBase64: string, orderAmount?: number): Promise<SlipokResult> {
    if (!await isConfigured()) {
      logger.error("SlipOK: not configured (api_key or branch_id missing in system_configs and env)");
      return { success: false, error: "Slip verification is not available." };
    }

    try {
      return await callSlipOkApi(slipBase64, orderAmount);
    } catch (err) {
      logger.error("SlipOK API unreachable", { error: String(err) });
      return { success: false, error: "Slip verification service unavailable. Please try again later." };
    }
  },
};
