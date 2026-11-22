import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import {
  buildParentSessionCookie,
  clearParentAuthFailures,
  hashParentPin,
  isParentAuthenticated,
  isParentAuthRateLimited,
  recordParentAuthFailure,
  requireParentAuth,
  setParentSessionCookie,
  validateParentPinFormat,
  verifyParentPin,
} from "@/lib/auth/parent-session";
import { assertJsonSameOrigin } from "@/lib/security/endpoint-guard";
import { getRequestSourceKey } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getDb();
  const settings = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  const hasParentPin = Boolean(settings?.parentPin?.trim());
  const needsPasswordSetup = !hasParentPin;

  if (settings && isParentAuthenticated(request, settings.parentSessionVersion)) {
    return NextResponse.json({
      authenticated: true,
      hasParentPin,
      needsPasswordSetup,
    });
  }

  return NextResponse.json({
    authenticated: false,
    hasParentPin,
    needsPasswordSetup,
  });
}

const AuthActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("setup_pin"),
    pin: z.string().max(40),
    confirmPin: z.string().max(40),
  }),
  z.object({
    action: z.literal("unlock"),
    pin: z.string().max(40),
  }),
  z.object({
    action: z.literal("logout"),
  }),
  z.object({
    action: z.literal("set_pin"),
    currentPin: z.string().max(40).optional(),
    pin: z.string().max(40),
  }),
]);

export async function POST(request: Request) {
  const originError = assertJsonSameOrigin(request);
  if (originError) return originError;

  const body = await request.json().catch(() => null);
  const parsed = AuthActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "家长验证请求参数有误" }, { status: 400 });
  }

  const data = parsed.data;

  if (data.action === "logout") {
    const res = NextResponse.json({ ok: true, authenticated: false });
    res.headers.set("Set-Cookie", buildParentSessionCookie("", request, 0));
    return res;
  }

  const db = getDb();
  const settings = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  if (!settings) {
    return NextResponse.json({ error: "系统配置未初始化" }, { status: 404 });
  }

  if (data.action === "setup_pin") {
    const pinCheck = validateParentPinFormat(data.pin);
    if (!pinCheck.ok) {
      return NextResponse.json({ error: pinCheck.error }, { status: 400 });
    }
    if (pinCheck.normalized !== data.confirmPin.trim()) {
      return NextResponse.json({ error: "两次输入的家长密码不一致" }, { status: 400 });
    }

    const storedValue = hashParentPin(pinCheck.normalized);
    const nextVersion = settings.parentSessionVersion + 1;
    const update = db
      .update(appSettings)
      .set({
        parentPin: storedValue,
        parentSessionVersion: nextVersion,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(appSettings.id, 1),
          sql`trim(${appSettings.parentPin}) = ''`,
          eq(appSettings.parentSessionVersion, settings.parentSessionVersion)
        )
      )
      .run();

    if (Number(update.changes) === 0) {
      return NextResponse.json(
        { error: "家长密码已设置，请直接输入密码解锁" },
        { status: 409 }
      );
    }

    clearParentAuthFailures(getRequestSourceKey(request));
    const response = NextResponse.json({
      ok: true,
      authenticated: true,
      hasParentPin: true,
      needsPasswordSetup: false,
    });
    return setParentSessionCookie(response, request, nextVersion);
  }

  if (data.action === "set_pin") {
    const authError = requireParentAuth(request, settings.parentSessionVersion);
    if (authError) return authError;

    const pinCheck = validateParentPinFormat(data.pin);
    if (!pinCheck.ok) {
      return NextResponse.json({ error: pinCheck.error }, { status: 400 });
    }

    const existingStoredPin = settings.parentPin.trim();
    if (existingStoredPin) {
      const currentCandidate = data.currentPin?.trim() ?? "";
      if (!currentCandidate || !verifyParentPin(currentCandidate, existingStoredPin)) {
        return NextResponse.json({ error: "当前家长密码不正确" }, { status: 400 });
      }
    }

    const storedValue = hashParentPin(pinCheck.normalized);
    const nextVersion = settings.parentSessionVersion + 1;
    const update = db
      .update(appSettings)
      .set({
        parentPin: storedValue,
        parentSessionVersion: nextVersion,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(eq(appSettings.id, 1), eq(appSettings.parentSessionVersion, settings.parentSessionVersion))
      )
      .run();

    if (Number(update.changes) === 0) {
      return NextResponse.json({ error: "家长密码已变更，请重新验证" }, { status: 401 });
    }
    const response = NextResponse.json({
      ok: true,
      hasParentPin: true,
    });
    return setParentSessionCookie(response, request, nextVersion);
  }

  // action === 'unlock'
  const sourceKey = getRequestSourceKey(request);
  if (isParentAuthRateLimited(sourceKey)) {
    return NextResponse.json(
      { error: "尝试次数过多，请 5 分钟后再试" },
      { status: 429 }
    );
  }

  const storedPin = settings.parentPin.trim();
  if (!storedPin) {
    return NextResponse.json(
      {
        error: "尚未设置家长密码，请先设置初始密码",
        needsPasswordSetup: true,
      },
      { status: 400 }
    );
  }

  const candidate = data.pin.trim();
  if (!candidate || !verifyParentPin(candidate, storedPin)) {
    recordParentAuthFailure(sourceKey);
    return NextResponse.json({ error: "家长密码不正确，请再试一次" }, { status: 401 });
  }

  // Upgrade legacy plaintext PIN to scrypt hash seamlessly
  if (!storedPin.startsWith("scrypt:")) {
    db.update(appSettings)
      .set({
        parentPin: hashParentPin(candidate),
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(appSettings.id, 1), eq(appSettings.parentPin, settings.parentPin)))
      .run();
  }

  clearParentAuthFailures(sourceKey);
  const res = NextResponse.json({
    ok: true,
    authenticated: true,
    hasParentPin: true,
    needsPasswordSetup: false,
  });
  return setParentSessionCookie(res, request, settings.parentSessionVersion);
}
