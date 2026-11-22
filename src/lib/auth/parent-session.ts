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
import {
  hashParentPin,
  safeEqualStrings,
  validateParentPinFormat,
  verifyParentPin,
} from "./pin-crypto";

export { hashParentPin, validateParentPinFormat, verifyParentPin };

export const PARENT_SESSION_COOKIE = "dinotalk_parent_session";

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX_FAILURES = 10;
const RATE_MAX_GLOBAL = 30;
const SESSION_TTL_SECONDS = 7200;
const PARENT_AUTH_LIMIT = "parent-auth";

type GlobalAuthHolder = typeof globalThis & {
  __dinotalkSessionSecret?: string;
  __dinotalkSessionSecretDir?: string;
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
