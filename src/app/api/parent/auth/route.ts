import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import {
  buildParentSessionCookie,
  clearParentAuthFailures,
  createMathChallenge,
  hashParentPin,
  isParentAuthenticated,
  isParentAuthRateLimited,
  recordParentAuthFailure,
  requireParentAuth,
  setParentSessionCookie,
  verifyMathChallenge,
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

  if (settings && isParentAuthenticated(request, settings.parentSessionVersion)) {
    return NextResponse.json({
      authenticated: true,
      hasParentPin,
    });
  }

  return NextResponse.json({
    authenticated: false,
    hasParentPin,
    challenge: hasParentPin ? undefined : createMathChallenge(),
  });
}

const AuthActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("unlock"),
    pin: z.string().max(40).optional(),
    challengeToken: z.string().max(400).optional(),
    answer: z.number().finite().optional(),
  }),
  z.object({
    action: z.literal("logout"),
  }),
  z.object({
    action: z.literal("set_pin"),
    pin: z.string().max(20),
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

  if (data.action === "set_pin") {
    const authError = requireParentAuth(request, settings.parentSessionVersion);
    if (authError) return authError;

    const trimmedPin = data.pin.trim();
    if (trimmedPin !== "" && trimmedPin.length < 4) {
      return NextResponse.json({ error: "家长密码至少需要 4 位字符" }, { status: 400 });
    }

    const storedValue = trimmedPin ? hashParentPin(trimmedPin) : "";
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
      hasParentPin: Boolean(storedValue),
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
  const hasParentPin = Boolean(storedPin);

  if (hasParentPin) {
    const candidate = data.pin?.trim() ?? "";
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
  } else {
    if (
      !data.challengeToken ||
      typeof data.answer !== "number" ||
      !verifyMathChallenge(data.challengeToken, data.answer)
    ) {
      recordParentAuthFailure(sourceKey);
      return NextResponse.json(
        {
          error: "算错啦或题目已过期，请再算一遍进入家长模式哦~",
          challenge: createMathChallenge(),
        },
        { status: 401 }
      );
    }
  }

  clearParentAuthFailures();
  const res = NextResponse.json({
    ok: true,
    authenticated: true,
    hasParentPin,
  });
  return setParentSessionCookie(res, request, settings.parentSessionVersion);
}
