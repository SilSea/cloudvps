// Throws at startup if any required env var is missing, so misconfiguration
// surfaces immediately instead of crashing at the first request that needs it.
const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const env = {
  port: parseInt(process.env.PORT || "3000", 10),
  appUrl: process.env.APP_URL || "http://localhost:3000",
  // Used as the CORS allowed origin; set to the frontend URL in production.
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",

  jwt: {
    // Two separate secrets: access tokens use accessSecret, refresh tokens use refreshSecret.
    // Keeping them separate lets us invalidate only one token type without rotating both keys.
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
  },

  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  email: {
    host: required("EMAIL_HOST"),
    // Port 465 = implicit TLS (secure: true); 587 = STARTTLS (secure: false).
    port: parseInt(process.env.EMAIL_PORT || "587", 10),
    user: required("EMAIL_USER"),
    pass: required("EMAIL_PASS"),
  },

  // Proxmox VE credentials — optional at startup (SEC-H1). All values validated
  // inside proxmox.service.ts before making any API calls.
  proxmox: {
    host: process.env.PROXMOX_HOST || "",
    tokenId: process.env.PROXMOX_TOKEN_ID || "",
    tokenSecret: process.env.PROXMOX_TOKEN_SECRET || "",
    node: process.env.PROXMOX_NODE || "",
    storage: process.env.PROXMOX_STORAGE || "local-lvm",
    bridgePublic: process.env.PROXMOX_BRIDGE_PUBLIC || process.env.PROXMOX_BRIDGE || "vmbr0",
    bridgePrivate: process.env.PROXMOX_BRIDGE_PRIVATE || process.env.PROXMOX_BRIDGE || "vmbr0",
    gatewayPublic: process.env.PROXMOX_GATEWAY_PUBLIC || "",
    gatewayPrivate: process.env.PROXMOX_GATEWAY_PRIVATE || "",
    subnet: process.env.PROXMOX_SUBNET || "24",
  },

  // SlipOK: Thai bank-slip verification API (Phase 3+).
  slipok: {
    apiKey: process.env.SLIPOK_API_KEY || "",
    branchId: process.env.SLIPOK_BRANCH_ID || "",
  },

  // TrueMoney: gift voucher redemption API (Phase 3+).
  truemoney: {
    apiUrl: process.env.TRUEMONEY_API_URL || "",
    mobile: process.env.TRUEMONEY_MOBILE || "",
  },
};
