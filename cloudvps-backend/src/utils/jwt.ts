// Custom JWT implementation using the Web Crypto API (built into Bun/browser).
// Avoids the `jsonwebtoken` package, which relies on Node.js `crypto` and is
// incompatible with Bun's strict ESM environment in some edge cases.

import { env } from "../config/env";
import type { JwtPayload, TerminalTokenPayload } from "../types";

// Signs a JWT with HS256. Encodes header + claims as Base64URL, then signs
// the concatenated string with HMAC-SHA256 using the provided secret.
const sign = async (payload: object, secret: string, expiresInSec: number): Promise<string> => {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  // jti ensures uniqueness even when two tokens are issued within the same second
  const claims = { ...payload, jti: crypto.randomUUID(), iat: now, exp: now + expiresInSec };

  // btoa produces standard Base64; we strip padding and swap +/= for URL-safe chars.
  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const data = `${encode(header)}.${encode(claims)}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${data}.${sigB64}`;
};

// Verifies the HS256 signature and checks the `exp` claim.
// Throws if the token is malformed, the signature is invalid, or it has expired.
const verify = async (token: string, secret: string): Promise<JwtPayload> => {
  const [headerB64, payloadB64, sigB64] = token.split(".");
  if (!headerB64 || !payloadB64 || !sigB64) throw new Error("Invalid token");

  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  // Reverse the URL-safe Base64 encoding before passing to atob.
  const sigBytes = Uint8Array.from(atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0)
  );
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
  if (!valid) throw new Error("Invalid token signature");

  const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))) as JwtPayload & { exp: number };
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Token expired");

  return payload;
};

export const jwtUtils = {
  // Access token: short-lived (15 min), used for API authorization.
  signAccess: (payload: Omit<JwtPayload, "type">) =>
    sign({ ...payload, type: "access" }, env.jwt.accessSecret, 15 * 60),

  // Refresh token: long-lived (7 days), used only to obtain a new access token.
  signRefresh: (payload: Omit<JwtPayload, "type">) =>
    sign({ ...payload, type: "refresh" }, env.jwt.refreshSecret, 7 * 24 * 60 * 60),

  // Email-verify token: single-use (24 h), signed with the access secret.
  signEmailVerify: (payload: { sub: number; email: string }) =>
    sign({ ...payload, type: "email_verify" }, env.jwt.accessSecret, 24 * 60 * 60),

  verifyAccess: (token: string) => verify(token, env.jwt.accessSecret),

  verifyRefresh: (token: string) => verify(token, env.jwt.refreshSecret),

  // Terminal token: 30-second single-use for noVNC WebSocket handshake.
  signTerminal: (payload: Omit<TerminalTokenPayload, "type" | "iat" | "exp">) =>
    sign({ ...payload, type: "terminal" }, env.jwt.accessSecret, 30),

  verifyTerminal: async (token: string): Promise<TerminalTokenPayload> => {
    const payload = await verify(token, env.jwt.accessSecret);
    if ((payload as any).type !== "terminal") throw new Error("Invalid token type");
    return payload as unknown as TerminalTokenPayload;
  },
};
