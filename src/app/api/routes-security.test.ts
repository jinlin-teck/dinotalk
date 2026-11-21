import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { dailyLogs, wordMastery } from "@/db/schema";
import { resetParentAuthRateLimit } from "@/lib/auth/parent-session";
import { GET as authGet, POST as authPost } from "./parent/auth/route";
import { GET as settingsGet, PUT as settingsPut } from "./settings/route";
import { POST as settingsTestPost } from "./settings/test/route";
import { GET as reportGet } from "./report/route";
import { PATCH as profilePatch } from "./profile/route";
import { POST as progressPost } from "./progress/route";
import { POST as chatPost } from "./agent/chat/route";
import { POST as freeTalkPost } from "./agent/freetalk/route";
import { GET as reviewGet, POST as reviewPost } from "./review/route";
import { GET as speechConfigGet } from "./speech/config/route";
import { POST as sttPost } from "./speech/stt/route";

describe("API routes security, concurrency, and regression checks", () => {
  let tmpDir = "";
  const origDataDir = process.env.DATA_DIR;
  let sessionCookie = "";

  function jsonRequest(
    path: string,
    body: Record<string, unknown>,
    { method = "POST", cookie }: { method?: string; cookie?: string } = {}
  ): Request {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (cookie) headers.set("Cookie", cookie);
    return new Request(`http://localhost:3000${path}`, {
      method,
      headers,
      body: JSON.stringify(body),
    });
  }

  function putSettings(body: Record<string, unknown>, cookie = sessionCookie) {
    return settingsPut(jsonRequest("/api/settings", body, { method: "PUT", cookie }));
  }

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dinotalk-api-test-"));
    process.env.DATA_DIR = tmpDir;
    resetParentAuthRateLimit();
    getDb();

    // Unlock parent session for authenticated tests
    const challengeRes = await authGet(new Request("http://localhost:3000/api/parent/auth"));
    const chData = await challengeRes.json();
    const answer = chData.challenge.a + chData.challenge.b;

    const unlockRes = await authPost(
      new Request("http://localhost:3000/api/parent/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unlock",
          challengeToken: chData.challenge.token,
          answer,
        }),
      })
    );
    expect(unlockRes.status).toBe(200);
    const setCookie = unlockRes.headers.get("set-cookie") ?? "";
    sessionCookie = setCookie.split(";")[0];
    expect(sessionCookie).toContain("dinotalk_parent_session=");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    if (origDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = origDataDir;
    getDb();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("blocks unauthenticated access to parent routes while keeping /api/speech/config public and secret-free", async () => {
    expect(
      (await settingsGet(new Request("http://localhost:3000/api/settings"))).status
    ).toBe(401);
    expect(
      (await reportGet(new Request("http://localhost:3000/api/report"))).status
    ).toBe(401);
    expect(
      (
        await settingsTestPost(
          new Request("http://localhost:3000/api/settings/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: "llm" }),
          })
        )
      ).status
    ).toBe(401);
    expect(
      (
        await profilePatch(
          new Request("http://localhost:3000/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update_profile", nickname: "Hacker" }),
          })
        )
      ).status
    ).toBe(401);

    const cfgRes = await speechConfigGet();
    expect(cfgRes.status).toBe(200);
    const cfgBody = await cfgRes.json();
    expect(Object.keys(cfgBody)).toEqual(["sttMode"]);
  });

  it("allows internal relay HTTPS endpoint and prevents cross-origin secret exfiltration", async () => {
    const saveRes = await settingsPut(
      new Request("http://localhost:3000/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          llmProvider: "custom",
          llmBaseUrl: "https://llm-gateway.home.arpa/v1",
          llmApiKey: "sk-super-secret-relay-key",
          llmModel: "gpt-4o-mini",
        }),
      })
    );
    expect(saveRes.status).toBe(200);
    const saved = await saveRes.json();
    expect(saved.settings.isLlmReady).toBe(true);
    expect(saved.settings.llmApiKeyMasked).not.toContain("super-secret");

    // Attempt to test against another origin without re-entering apiKey -> must reject with 0 network calls
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const evilTestRes = await settingsTestPost(
      new Request("http://localhost:3000/api/settings/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify({
          target: "llm",
          override: {
            provider: "custom",
            baseUrl: "https://evil.example/v1",
            model: "gpt-4o-mini",
          },
        }),
      })
    );
    expect(evilTestRes.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();

    const changeUrlRes = await putSettings({ llmBaseUrl: "https://api.deepseek.com/v1" });
    expect(changeUrlRes.status).toBe(400);
    const unchanged = await settingsGet(
      new Request("http://localhost:3000/api/settings", { headers: { Cookie: sessionCookie } })
    );
    expect((await unchanged.json()).settings).toMatchObject({
      llmBaseUrl: "https://llm-gateway.home.arpa/v1",
      hasLlmApiKey: true,
    });

    const sameOrigin = await putSettings({
      llmBaseUrl: "https://llm-gateway.home.arpa/api/v1",
      llmApiKey: " ",
    });
    expect((await sameOrigin.json()).settings.hasLlmApiKey).toBe(true);

    const upstreamDiagnostic = "internal diagnostic, populated by relay";
    fetchSpy.mockResolvedValueOnce(Response.json({ error: { message: upstreamDiagnostic } }));
    const fallback = await freeTalkPost(jsonRequest("/api/agent/freetalk", { userText: "Hello!" }));
    const publicResult = await fallback.json();
    expect(publicResult).toMatchObject({ usedFallback: true, fallbackReason: "model_error" });
    expect(JSON.stringify(publicResult)).not.toContain(upstreamDiagnostic);

    const explicitClear = await putSettings({
      llmBaseUrl: "https://api.deepseek.com/v1",
      clearLlmApiKey: true,
    });
    expect(explicitClear.status).toBe(200);
    const changed = await explicitClear.json();
    expect(changed.settings.hasLlmApiKey).toBe(false);
  });

  it("keeps voice keys through a partial save and rejects unconfirmed origin changes", async () => {
    const configured = await putSettings({
      ttsApiBaseUrl: "https://tts-gateway.home.arpa/v1",
      ttsApiKey: "tts-test-key",
      sttEngine: "minimax",
      sttApiBaseUrl: "",
      sttApiKey: "stt-test-key",
    });
    expect(configured.status).toBe(200);

    vi.stubEnv("ALLOWED_ENDPOINT_HOSTS", "api.minimax.cn");
    const partial = await putSettings({
      llmBaseUrl: "https://api.deepseek.com/v1",
      ttsApiBaseUrl: "https://tts-gateway.home.arpa/v1",
      ttsSpeed: 0.8,
    });
    expect(partial.status).toBe(200);
    vi.unstubAllEnvs();

    const rejectedTts = await putSettings({ ttsApiBaseUrl: "https://other.example/v1" });
    expect(rejectedTts.status).toBe(400);
    const rejectedStt = await putSettings({ sttApiBaseUrl: "https://api.minimax.io" });
    expect(rejectedStt.status).toBe(400);

    const paused = await putSettings({ sttEngine: "browser", ttsSpeed: 0.9 });
    expect((await paused.json()).settings).toMatchObject({
      hasTtsApiKey: true,
      hasSttApiKey: true,
      ttsApiBaseUrl: "https://tts-gateway.home.arpa/v1",
      sttApiBaseUrl: "https://api.minimax.cn/v1/speech_to_text",
    });

    const updated = await putSettings({
      sttEngine: "minimax",
      sttApiBaseUrl: "https://api.minimax.io/v1/speech_to_text",
      sttApiKey: "replacement-stt-key",
      clearTtsApiKey: true,
      ttsApiBaseUrl: "https://other.example/v1",
    });
    expect((await updated.json()).settings).toMatchObject({
      hasTtsApiKey: false,
      hasSttApiKey: true,
      sttApiBaseUrl: "https://api.minimax.io/v1/speech_to_text",
    });
  });

  it("keeps voice keys when switching STT engines with a blank destination URL", async () => {
    const configured = await putSettings({
      sttEngine: "minimax",
      sttApiBaseUrl: "",
      sttApiKey: "minimax-test-key",
    });
    expect(configured.status).toBe(200);

    const switched = await putSettings({ sttEngine: "openai", sttApiBaseUrl: "" });
    expect(switched.status).toBe(200);
    expect((await switched.json()).settings).toMatchObject({
      sttEngine: "openai",
      hasSttApiKey: true,
    });

    // 换成新来源后仍然必须重新输入密钥
    const crossOrigin = await putSettings({
      sttEngine: "openai",
      sttApiBaseUrl: "https://api.openai.com/v1",
    });
    expect(crossOrigin.status).toBe(400);
  });

  it("preserves equippedAccessories when completing a unit step via POST /api/progress", async () => {
    // Give child crown and equip it
    const buyRes = await profilePatch(
      new Request("http://localhost:3000/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "buy_accessory", accessoryId: "crown" }),
      })
    );
    expect(buyRes.status).toBe(200);

    const progRes = await progressPost(
      new Request("http://localhost:3000/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: "u1-greetings", step: "story" }),
      })
    );
    expect(progRes.status).toBe(200);
    const data = await progRes.json();
    expect(data.profile.equippedAccessories).toEqual(["crown"]);
  });

  it("enforces server-side roleplay goal completion and awards completion stars once per session", async () => {
    const unsupported = await progressPost(jsonRequest("/api/progress", {
      unitId: "u5-fruits",
      step: "roleplay",
    }));
    expect(unsupported.status).toBe(400);

    // Client attempts to spoof all 3 completedGoalIds on first turn with unrelated text
    const spoofRes = await chatPost(
      new Request("http://localhost:3000/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: "u5-fruits",
          userText: "hmm",
          completedGoalIds: ["u5-g1", "u5-g2", "u5-g3"],
        }),
      })
    );
    expect(spoofRes.status).toBe(200);
    const spoofData = await spoofRes.json();
    expect(spoofData.response.completedGoalIds).toEqual([]);
    expect(spoofData.response.isSceneComplete).toBe(false);
    expect(spoofData.starsAwarded).toBe(0);

    const sessionId = spoofData.sessionId as number;

    // Walk all 3 goals legitimately
    await chatPost(
      new Request("http://localhost:3000/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: "u5-fruits", sessionId, userText: "An apple, please!" }),
      })
    );
    await chatPost(
      new Request("http://localhost:3000/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: "u5-fruits", sessionId, userText: "Milk, please!" }),
      })
    );
    const completeRes = await chatPost(
      new Request("http://localhost:3000/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: "u5-fruits", sessionId, userText: "Thank you!" }),
      })
    );
    const completeData = await completeRes.json();
    expect(completeData.response.isSceneComplete).toBe(true);
    expect(completeData.starsAwarded).toBe(4);

    // Continuing in the already-completed session must NOT mint extra stars or activitiesCompleted
    const db = getDb();
    const beforeLogs = db.select().from(dailyLogs).all();
    const totalActivitiesBefore = beforeLogs.reduce((s, r) => s + r.activitiesCompleted, 0);

    const postCompleteRes = await chatPost(
      new Request("http://localhost:3000/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: "u5-fruits", sessionId, userText: "Bye-bye!" }),
      })
    );
    const postCompleteData = await postCompleteRes.json();
    expect(postCompleteData.starsAwarded).toBe(0);

    const afterLogs = db.select().from(dailyLogs).all();
    const totalActivitiesAfter = afterLogs.reduce((s, r) => s + r.activitiesCompleted, 0);
    expect(totalActivitiesAfter).toBe(totalActivitiesBefore);
  });

  it("formats phonics review distractors consistently, avoids duplicate orange, and rejects invalid review itemKeys", async () => {
    const db = getDb();
    const duePast = new Date(Date.now() - 60000).toISOString();
    db.insert(wordMastery)
      .values([
        {
          profileId: 1,
          itemKey: "u2-orange",
          itemType: "word",
          unitId: "u2-colors",
          masteryLevel: 1,
          correctCount: 1,
          wrongCount: 0,
          nextReviewAt: duePast,
          lastPracticedAt: duePast,
        },
        {
          profileId: 1,
          itemKey: "phonics-S",
          itemType: "phonics",
          unitId: "u1-greetings",
          masteryLevel: 1,
          correctCount: 1,
          wrongCount: 0,
          nextReviewAt: duePast,
          lastPracticedAt: duePast,
        },
      ])
      .onConflictDoNothing()
      .run();

    const revRes = await reviewGet();
    expect(revRes.status).toBe(200);
    const revData = await revRes.json();

    const orangeItem = revData.items.find(
      (i: { itemKey: string }) => i.itemKey === "u2-orange"
    );
    if (orangeItem) {
      expect(
        orangeItem.distractors.some((d: { text: string }) => d.text.toLowerCase() === "orange")
      ).toBe(false);
    }

    const phonicsItem = revData.items.find(
      (i: { itemType: string }) => i.itemType === "phonics"
    );
    expect(phonicsItem).toBeDefined();
    expect(phonicsItem.zh).toContain("·");
    for (const d of phonicsItem.distractors) {
      expect(d.zh).toContain("·");
    }

    const badPostRes = await reviewPost(
      new Request("http://localhost:3000/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemKey: "nonexistent-fake-item",
          itemType: "word",
          unitId: "u1-greetings",
          correct: true,
        }),
      })
    );
    expect(badPostRes.status).toBe(400);
  });

  it("rejects oversized audio uploads (>10MB) on /api/speech/stt with HTTP 413", async () => {
    const bigBytes = new Uint8Array(10 * 1024 * 1024 + 64);
    const form = new FormData();
    form.append("audio", new Blob([bigBytes], { type: "audio/wav" }), "huge.wav");

    const res = await sttPost(
      new Request("http://localhost:3000/api/speech/stt", {
        method: "POST",
        body: form,
      })
    );
    expect(res.status).toBe(413);
  });

  it("stops reading an oversized multipart body without Content-Length", async () => {
    const block = new Uint8Array(1024 * 1024).fill(97);
    const preamble = new TextEncoder().encode(
      '--upload\r\nContent-Disposition: form-data; name="hints"\r\n\r\n'
    );
    let pulled = 0;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled === 32) controller.close();
        else controller.enqueue(pulled++ === 0 ? preamble : block);
      },
      cancel,
    });
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=upload" },
      body,
      duplex: "half",
    };
    const res = await sttPost(new Request("http://localhost:3000/api/speech/stt", init));
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(32);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("revokes old parent sessions when either PIN update endpoint is used", async () => {
    const getReport = (cookie: string) => reportGet(
      new Request("http://localhost:3000/api/report", { headers: { Cookie: cookie } })
    );
    const setPin = await authPost(jsonRequest("/api/parent/auth", { action: "set_pin", pin: "test-pin" }, {
      cookie: sessionCookie,
    }));
    expect(setPin.status).toBe(200);
    const newCookie = setPin.headers.get("set-cookie")!.split(";")[0];
    expect((await getReport(sessionCookie)).status).toBe(401);
    expect((await getReport(newCookie)).status).toBe(200);

    const replace = await putSettings({ parentPin: "replacement-pin" }, newCookie);
    expect(replace.status).toBe(200);
    expect((await getReport(newCookie)).status).toBe(401);
    const latestCookie = replace.headers.get("set-cookie")!.split(";")[0];
    expect((await getReport(latestCookie)).status).toBe(200);
  });

  it("limits repeated failures per source instead of locking out every parent", async () => {
    const attempt = (ip: string) =>
      authPost(
        new Request("http://localhost:3000/api/parent/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ action: "unlock", pin: "wrong-pin" }),
        })
      );

    for (let i = 0; i < 10; i++) {
      expect((await attempt("203.0.113.10")).status).toBe(401);
    }
    expect((await attempt("203.0.113.10")).status).toBe(429);
    expect((await attempt("203.0.113.11")).status).toBe(401);

    resetParentAuthRateLimit();
  });
});
