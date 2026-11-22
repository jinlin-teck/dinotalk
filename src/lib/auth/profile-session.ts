import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { childProfiles, type ChildProfile } from "@/db/schema";

export const ACTIVE_PROFILE_COOKIE = "dinotalk_profile_id";
const PROFILE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

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

export function extractProfileIdFromRequest(request: Request): number | null {
  const raw = extractCookieValue(request.headers.get("cookie"), ACTIVE_PROFILE_COOKIE);
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const num = Number(trimmed);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

export function resolveActiveProfile(
  db: Pick<BetterSQLite3Database<typeof schema>, "select">,
  request: Request
): ChildProfile | null {
  const profileId = extractProfileIdFromRequest(request);
  if (profileId === null) return null;
  return db.select().from(childProfiles).where(eq(childProfiles.id, profileId)).get() ?? null;
}

export function buildActiveProfileCookie(profileId: number | null, request: Request): string {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const isHttps = request.url.startsWith("https://") || forwardedProto === "https";
  const maxAge = profileId !== null ? PROFILE_COOKIE_MAX_AGE : 0;
  const value = profileId !== null ? encodeURIComponent(String(profileId)) : "";
  const segments = [
    `${ACTIVE_PROFILE_COOKIE}=${value}`,
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

export function setActiveProfileCookie(
  response: NextResponse,
  request: Request,
  profileId: number
): NextResponse {
  response.headers.append("Set-Cookie", buildActiveProfileCookie(profileId, request));
  return response;
}

export function clearActiveProfileCookie(
  response: NextResponse,
  request: Request
): NextResponse {
  response.headers.append("Set-Cookie", buildActiveProfileCookie(null, request));
  return response;
}

export function buildNoActiveProfileResponse(): NextResponse {
  return NextResponse.json(
    { error: "请先选择或创建学习档案", code: "no_active_profile" },
    { status: 400 }
  );
}
