// PromptPay manual flow — no external API call at submission time.
// User uploads a slip image; Admin/Support verifies and approves manually.
export const promptpayService = {
  // Generates a unique internal reference for a pending PromptPay transaction.
  generateRef(): string {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `PP-${ts}-${rand}`;
  },
};
