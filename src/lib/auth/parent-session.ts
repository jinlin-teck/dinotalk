import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDataDir, getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { assertAllowedHost } from "@/lib/security/endpoint-guard";
import {
  clearRateLimitFailures,
  isRateLimited,
  noteRateLimitFailure,
  resetRateLimit,
} from "@/lib/security/rate-limit";

export const PARENT_SESSION_COOKIE = "dinotalk_parent_session";

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_FAILURES = 10;
const RATE_MAX_GLOBAL = 30;
const SESSION_TTL_SECONDS = 7200;
const PARENT_AUTH_LIMIT = "parent-auth";
const MATH_CHALLENGE_LIMIT = 2000;

interface MathChallengeEntry {
  sum: number;
  exp: number;
}

type GlobalAuthHolder = typeof globalThis & {
  __dinotalkSessionSecret?: string;
  __dinotalkSessionSecretDir?: string;
  __dinotalkMathChallenges?: Map<string, MathChallengeEntry>;
};

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret) {
    return envSecret;
  }

  const g = globalThis as GlobalAuthHolder;
  const dataDir = getDataDir();
  if (g.__dinotalkSessionSecret && g.__dinotalkSessionSecretDir === dataDir) {
    return g.__dinotalkSessionSecret;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const secretPath = path.join(dataDir, ".session-secret");
  let secret = "";
  try {
    if (fs.existsSync(secretPath)) {
      secret = fs.readFileSync(secretPath, "utf8").trim();
    }
  } catch {
    secret = "";
  }

  if (!secret || secret.length < 32) {
    secret = crypto.randomBytes(32).toString("hex");
    try {
      fs.writeFileSync(secretPath, `${secret}\n`, { mode: 0o600 });
    } catch {
      // fall back to in-memory secret if filesystem is read-only
      console.warn(
        "[dinotalk] 无法写入会话密钥文件，将使用进程内临时密钥；服务重启后家长会话会失效。"
      );
    }
  }

  g.__dinotalkSessionSecret = secret;
  g.__dinotalkSessionSecretDir = dataDir;
  return secret;
}

function signPayload(payloadB64: string): string {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadB64)
    .digest("base64url");
}

function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hashParentPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(pin, salt, 32).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyParentPin(pin: string, stored: string): boolean {
  const trimmedStored = stored.trim();
  if (!trimmedStored) return false;

  if (trimmedStored.startsWith("scrypt:")) {
    const parts = trimmedStored.split(":");
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    if (!salt || !expectedHex) return false;
    const derivedHex = crypto.scryptSync(pin, salt, 32).toString("hex");
    return safeEqualStrings(derivedHex, expectedHex);
  }

  // Legacy plaintext compatibility
  return safeEqualStrings(pin, trimmedStored);
}

export interface MathChallenge {
  a: number;
  b: number;
  token: string;
}

function getChallengeStore(): Map<string, MathChallengeEntry> {
  const holder = globalThis as GlobalAuthHolder;
  if (!holder.__dinotalkMathChallenges) {
    holder.__dinotalkMathChallenges = new Map();
  }
  return holder.__dinotalkMathChallenges;
}

/**
 * 算术题只是"防孩子误触"的减速带，不是鉴权。答案保存在服务端内存中，
 * token 只携带 nonce 与过期时间，避免客户端解码 token 直接读出答案。
 */
export function createMathChallenge(ttlSeconds = 300): MathChallenge {
  const a = 11 + crypto.randomInt(0, 18); // 11..28
  const b = 6 + crypto.randomInt(0, 14); // 6..19
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;
  const nonce = crypto.randomBytes(16).toString("hex");

  const store = getChallengeStore();
  for (const [key, entry] of store) {
    if (entry.exp < now) store.delete(key);
  }
  if (store.size >= MATH_CHALLENGE_LIMIT) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(nonce, { sum: a + b, exp });

  const payload = Buffer.from(JSON.stringify({ nonce, exp }), "utf8").toString("base64url");
  const sig = signPayload(payload);
  return { a, b, token: `${payload}.${sig}` };
}

export function verifyMathChallenge(token: string, answer: number): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return false;

  const expectedSig = signPayload(payloadB64);
  if (!safeEqualStrings(sig, expectedSig)) return false;

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as { nonce?: unknown; exp?: unknown };
    if (typeof parsed.nonce !== "string" || typeof parsed.exp !== "number") {
      return false;
    }

    const store = getChallengeStore();
    const entry = store.get(parsed.nonce);
    if (!entry) return false;

    const now = Math.floor(Date.now() / 1000);
    if (entry.exp < now || parsed.exp < now) {
      store.delete(parsed.nonce);
      return false;
    }
    if (entry.sum !== answer) return false;

    store.delete(parsed.nonce); // 一次性使用，防止重放
    return true;
  } catch {
    return false;
  }
}

export function createParentSessionToken(
  version: number,
  ttlSeconds = SESSION_TTL_SECONDS
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(
    JSON.stringify({ role: "parent", version, exp }),
    "utf8"
  ).toString("base64url");
  const sig = signPayload(payload);
  return `${payload}.${sig}`;
}

export function verifyParentSessionToken(token: string, version: number): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return false;

  const expectedSig = signPayload(payloadB64);
  if (!safeEqualStrings(sig, expectedSig)) return false;

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as { role?: unknown; version?: unknown; exp?: unknown };
    if (parsed.role !== "parent" || parsed.version !== version || typeof parsed.exp !== "number") {
      return false;
    }
    return parsed.exp >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function extractCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function isParentAuthenticated(request: Request, version?: number): boolean {
  const token = extractCookieValue(request.headers.get("cookie"), PARENT_SESSION_COOKIE);
  if (!token) return false;
  const currentVersion =
    version ??
    getDb()
      .select({ version: appSettings.parentSessionVersion })
      .from(appSettings)
      .where(eq(appSettings.id, 1))
      .get()?.version;
  return currentVersion !== undefined && verifyParentSessionToken(token, currentVersion);
}

export function requireParentAuth(request: Request, version?: number): NextResponse | null {
  const hostError = assertAllowedHost(request);
  if (hostError) return hostError;
  if (!isParentAuthenticated(request, version)) {
    return NextResponse.json({ error: "请先完成家长验证" }, { status: 401 });
  }
  return null;
}

export function buildParentSessionCookie(
  token: string,
  request: Request,
  maxAge = SESSION_TTL_SECONDS
): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const isHttps = request.url.startsWith("https://") || forwardedProto === "https";
  const segments = [
    `${PARENT_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (isHttps) {
    segments.push("Secure");
  }
  return segments.join("; ");
}

export function setParentSessionCookie(
  response: NextResponse,
  request: Request,
  version: number
): NextResponse {
  response.headers.set(
    "Set-Cookie",
    buildParentSessionCookie(createParentSessionToken(version), request)
  );
  return response;
}

export function isParentAuthRateLimited(source = "local"): boolean {
  return isRateLimited(
    PARENT_AUTH_LIMIT,
    source,
    RATE_MAX_FAILURES,
    RATE_WINDOW_MS,
    RATE_MAX_GLOBAL
  );
}

export function recordParentAuthFailure(source = "local"): void {
  noteRateLimitFailure(PARENT_AUTH_LIMIT, source, RATE_WINDOW_MS);
}

export function clearParentAuthFailures(source = "local"): void {
  clearRateLimitFailures(PARENT_AUTH_LIMIT, source);
}

export function resetParentAuthRateLimit(): void {
  resetRateLimit(PARENT_AUTH_LIMIT);
}
