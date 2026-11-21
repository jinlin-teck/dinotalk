import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { appSettings, childProfiles, dailyLogs, unitProgress, voiceProofs, wordMastery } from "@/db/schema";
import { eq } from "drizzle-orm";
import { consumeVoiceProof, issueVoiceProof } from "@/lib/speech/voice-proof";
import * as speechStt from "@/lib/speech/stt";
import { resetParentAuthRateLimit } from "@/lib/auth/parent-session";
import { GET as authGet, POST as authPost } from "./parent/auth/route";
import { GET as settingsGet, PUT as settingsPut } from "./settings/route";
import { POST as settingsTestPost } from "./settings/test/route";
import { GET as reportGet } from "./report/route";
import { GET as profileGet, PATCH as profilePatch } from "./profile/route";
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
    expect(Object.keys(cfgBody).sort()).toEqual(["sttMode", "ttsAutoPlayZh"]);
    expect(typeof cfgBody.ttsAutoPlayZh).toBe("boolean");
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

  it("shares the failure budget by default and separates sources behind a trusted proxy", async () => {
    const attempt = (ip: string) =>
      authPost(
        new Request("http://localhost:3000/api/parent/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": ip, "x-real-ip": ip },
          body: JSON.stringify({ action: "unlock", pin: "wrong-pin" }),
        })
      );

    try {
      vi.stubEnv("TRUST_PROXY_HEADERS", "0");
      for (let i = 0; i < 10; i++) {
        expect((await attempt("203.0.113.10")).status).toBe(401);
      }
      expect((await attempt("203.0.113.11")).status).toBe(429);

      resetParentAuthRateLimit();
      vi.stubEnv("TRUST_PROXY_HEADERS", "1");
      for (let i = 0; i < 10; i++) {
        expect((await attempt("203.0.113.10")).status).toBe(401);
      }
      expect((await attempt("203.0.113.10")).status).toBe(429);
      expect((await attempt("203.0.113.11")).status).toBe(401);
    } finally {
      resetParentAuthRateLimit();
    }
  });

  it("supports sentence SRS, unit 4-star exclusive accessory unlocks, voice-discount feeding, skin switching, and gentle daily hunger decay", async () => {
    const db = getDb();

    // 1. Sentence SRS via POST /api/progress + 4-star unlock on u5-fruits (roleplay already done above)
    await progressPost(
      jsonRequest("/api/progress", {
        unitId: "u5-fruits",
        step: "story",
        practicedItems: [
          { itemKey: "u5-apple", itemType: "word", correct: true },
          { itemKey: "u5-s1", itemType: "sentence", correct: true },
        ],
      })
    );
    await progressPost(
      jsonRequest("/api/progress", {
        unitId: "u5-fruits",
        step: "phonics",
      })
    );
    const fourthStarRes = await progressPost(
      jsonRequest("/api/progress", {
        unitId: "u5-fruits",
        step: "game",
        score: 95,
        practicedItems: [
          { itemKey: "u5-apple", itemType: "word", correct: true },
          { itemKey: "u5-grape", itemType: "word", correct: false },
        ],
      })
    );
    expect(fourthStarRes.status).toBe(200);
    const fourthStarData = await fourthStarRes.json();
    expect(fourthStarData.unitProgress.starsEarned).toBe(4);
    expect(fourthStarData.unlockedAccessory?.id).toBe("fruit_apron");
    expect(fourthStarData.profile.ownedAccessories).toContain("fruit_apron");

    // 2. Exclusive unit accessory cannot be bought with stars
    const rejectExclusiveBuy = await profilePatch(
      jsonRequest(
        "/api/profile",
        { action: "buy_accessory", accessoryId: "sailor_cap" },
        { method: "PATCH" }
      )
    );
    expect(rejectExclusiveBuy.status).toBe(400);

    // 3. Spoken discount feeding: in browser mode trusted locally; in cloud STT mode requires valid server voiceProof
    const beforeFeedStars = fourthStarData.profile.totalStars as number;
    const discountFeedRes = await profilePatch(
      jsonRequest(
        "/api/profile",
        { action: "feed", snackId: "snack-cake", spokenDiscount: true },
        { method: "PATCH" }
      )
    );
    expect(discountFeedRes.status).toBe(200);
    const discountFeedData = await discountFeedRes.json();
    expect(discountFeedData.costStars).toBe(3); // 6 / 2 = 3
    expect(discountFeedData.profile.totalStars).toBe(beforeFeedStars - 3);

    // Cloud STT cannot charge for a half-price request without valid proof.
    db.update(appSettings)
      .set({
        sttEngine: "openai",
        sttApiBaseUrl: "https://api.openai.com/v1",
        sttApiKey: "sk-test-stt",
      })
      .where(eq(appSettings.id, 1))
      .run();

    const unverifiedCloudFeedRes = await profilePatch(
      jsonRequest(
        "/api/profile",
        { action: "feed", snackId: "snack-cake", spokenDiscount: true },
        { method: "PATCH" }
      )
    );
    const expiredCloudFeedRes = await profilePatch(
      jsonRequest(
        "/api/profile",
        {
          action: "feed",
          snackId: "snack-cake",
          spokenDiscount: true,
          voiceProof: issueVoiceProof("Star Cake", 1, "feed", Date.now() - 3 * 60_000),
        },
        { method: "PATCH" }
      )
    );
    expect(unverifiedCloudFeedRes.status).toBe(400);
    expect(expiredCloudFeedRes.status).toBe(400);
    const unchangedProfile = (await (await profileGet()).json()).profile;
    expect(unchangedProfile).toMatchObject({
      totalStars: discountFeedData.profile.totalStars,
      petHunger: discountFeedData.profile.petHunger,
      petMood: discountFeedData.profile.petMood,
      level: discountFeedData.profile.level,
    });

    // With valid server-issued voiceProof for "Star Cake", cloud STT mode grants half-price discount
    vi.spyOn(speechStt, "transcribeWithOpenAi").mockResolvedValue("Star Cake");
    const audioForm = new FormData();
    audioForm.set("audio", new Blob([new Uint8Array(128)], { type: "audio/wav" }), "speech.wav");
    audioForm.set("voiceProofPurpose", "feed");
    const transcription = await sttPost(new Request("http://localhost:3000/api/speech/stt", {
      method: "POST",
      body: audioForm,
    }));
    expect(await transcription.clone().json()).toMatchObject({ ok: true, text: "Star Cake", voiceProof: expect.any(String) });
    const { voiceProof } = await transcription.json();
    const discountedFeedRequest = () => jsonRequest(
        "/api/profile",
        { action: "feed", snackId: "snack-cake", spokenDiscount: true, voiceProof },
        { method: "PATCH" }
    );
    const verifiedCloudFeedRes = await profilePatch(discountedFeedRequest());
    expect(verifiedCloudFeedRes.status).toBe(200);
    expect((await verifiedCloudFeedRes.json()).costStars).toBe(3);
    expect((await profilePatch(discountedFeedRequest())).status).toBe(400);

    const fullPriceFeedRes = await profilePatch(
      jsonRequest(
        "/api/profile",
        { action: "feed", snackId: "snack-cake" },
        { method: "PATCH" }
      )
    );
    expect(fullPriceFeedRes.status).toBe(200);
    expect((await fullPriceFeedRes.json()).costStars).toBe(6);

    // Restore browser STT mode
    db.update(appSettings)
      .set({ sttEngine: "browser" })
      .where(eq(appSettings.id, 1))
      .run();

    // 3.5 Same-slot accessory mutual exclusion (equipping wizard_hat replaces crown in 'hat' slot, while scarf in 'neck' slot stays)
    db.update(childProfiles)
      .set({
        totalStars: 50,
        ownedAccessoriesJson: JSON.stringify(["crown", "wizard_hat", "scarf"]),
        equippedAccessoriesJson: JSON.stringify(["crown", "scarf"]),
      })
      .where(eq(childProfiles.id, 1))
      .run();
    const equipHatRes = await profilePatch(
      jsonRequest(
        "/api/profile",
        { action: "equip_accessory", accessoryId: "wizard_hat" },
        { method: "PATCH" }
      )
    );
    const equipHatData = await equipHatRes.json();
    expect(equipHatData.profile.equippedAccessories).toContain("wizard_hat");
    expect(equipHatData.profile.equippedAccessories).toContain("scarf");
    expect(equipHatData.profile.equippedAccessories).not.toContain("crown");

    // Legacy rewards appear on read and persist when the app records a visit.
    db.insert(unitProgress)
      .values({
        profileId: 1,
        unitId: "u1-greetings",
        storyDone: 1,
        phonicsDone: 1,
        gameDone: 1,
        roleplayDone: 1,
        starsEarned: 4,
        bestGameScore: 100,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [unitProgress.profileId, unitProgress.unitId],
        set: { starsEarned: 4 },
      })
      .run();
    const backfillRes = await profileGet();
    const backfillData = await backfillRes.json();
    expect(backfillData.profile.ownedAccessories).toContain("sailor_cap");
    const storedProfile = () => db.select().from(childProfiles).where(eq(childProfiles.id, 1)).get()!;
    expect(storedProfile().ownedAccessoriesJson).not.toContain("sailor_cap");

    // 4. Select avatar skin (unlock dino-sky with stars)
    const skinRes = await profilePatch(
      jsonRequest(
        "/api/profile",
        { action: "select_avatar", skinId: "dino-sky" },
        { method: "PATCH" }
      )
    );
    expect(skinRes.status).toBe(200);
    const skinData = await skinRes.json();
    expect(skinData.profile.avatarId).toBe("dino-sky");
    expect(skinData.profile.ownedSkinIds).toContain("dino-sky");
    expect(skinData.profile.ownedAccessories).not.toContain("skin:dino-sky");

    // 5. Gentle daily hunger decay with safe floor >= 40
    db.update(childProfiles)
      .set({ lastActiveDate: "2020-01-01", petHunger: 70, petMood: 85 })
      .where(eq(childProfiles.id, 1))
      .run();
    const profRes = await profileGet();
    const profData = await profRes.json();
    expect(profData.profile.petHunger).toBe(40);
    expect(profData.profile.petMood).toBe(61);
    expect(storedProfile()).toMatchObject({ lastActiveDate: "2020-01-01", petHunger: 70, petMood: 85 });
    await profilePatch(jsonRequest("/api/profile", { action: "record_activity" }, { method: "PATCH" }));
    expect(storedProfile()).toMatchObject({ petHunger: 40, petMood: 61 });
    expect(storedProfile().ownedAccessoriesJson).toContain("sailor_cap");

    // 6. Sentence review item + mastery-tiered questionMode + report parentTips
    const duePast = new Date(Date.now() - 60000).toISOString();
    db.update(wordMastery)
      .set({ masteryLevel: 4, nextReviewAt: duePast })
      .where(eq(wordMastery.itemKey, "u5-s1"))
      .run();

    const revRes = await reviewGet();
    const revData = await revRes.json();
    const sentenceRev = revData.items.find((i: { itemKey: string }) => i.itemKey === "u5-s1");
    expect(sentenceRev?.itemType).toBe("sentence");
    expect(sentenceRev?.questionMode).toBe("speak_card");

    const unlockLatest = await authPost(
      jsonRequest("/api/parent/auth", { action: "unlock", pin: "replacement-pin" })
    );
    expect(unlockLatest.status).toBe(200);
    const freshCookie = (unlockLatest.headers.get("set-cookie") ?? "").split(";")[0];

    const repRes = await reportGet(
      new Request("http://localhost:3000/api/report", {
        headers: { Cookie: freshCookie },
      })
    );
    expect(repRes.status).toBe(200);
    const repData = await repRes.json();
    expect(Array.isArray(repData.parentTips)).toBe(true);
    expect(repData.parentTips.length).toBeGreaterThan(0);
    // Weak/wrong word u5-grape at low mastery is flagged needsAttention, but once mastered to Lv.4 and not due, it graduates
    const grapeStat = repData.wordStats.find((w: { itemKey: string }) => w.itemKey === "u5-grape");
    expect(grapeStat?.needsAttention).toBe(true);
    expect(grapeStat?.wrongCount).toBeGreaterThanOrEqual(1);

    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    db.update(wordMastery)
      .set({ masteryLevel: 4, nextReviewAt: futureDate })
      .where(eq(wordMastery.itemKey, "u5-grape"))
      .run();
    const repAfterMasteryRes = await reportGet(
      new Request("http://localhost:3000/api/report", {
        headers: { Cookie: freshCookie },
      })
    );
    const repAfterMastery = await repAfterMasteryRes.json();
    const graduatedGrape = repAfterMastery.wordStats.find(
      (w: { itemKey: string }) => w.itemKey === "u5-grape"
    );
    expect(graduatedGrape?.needsAttention).toBe(false);
  });

  it("keeps a verified cloud voice turn until roleplay completion without resending its proof", async () => {
    const db = getDb();
    const settings = db
      .select({
        sttEngine: appSettings.sttEngine,
        sttApiBaseUrl: appSettings.sttApiBaseUrl,
        sttApiKey: appSettings.sttApiKey,
        llmApiKey: appSettings.llmApiKey,
      })
      .from(appSettings)
      .where(eq(appSettings.id, 1))
      .get()!;
    db.update(appSettings)
      .set({ sttEngine: "openai", sttApiBaseUrl: "https://api.openai.com/v1", sttApiKey: "test-stt-key", llmApiKey: "" })
      .where(eq(appSettings.id, 1))
      .run();

    try {
      const startedAt = Date.now();
      const clock = vi.spyOn(Date, "now").mockReturnValue(startedAt);
      const unitId = "u4-family";
      const userText = "This is my mom!";
      const voiceProof = issueVoiceProof(userText, 1, "roleplay");
      const opening = await chatPost(
        jsonRequest("/api/agent/chat", { unitId, userText, usedVoice: true, voiceProof })
      );
      expect(opening.status).toBe(200);
      const first = await opening.json();
      expect(first.response.completedGoalIds).toEqual(["u4-g1"]);
      expect(first.voiceBonusStars).toBe(0);

      clock.mockReturnValue(startedAt + 3 * 60_000);
      const sessionId = first.sessionId;
      const second = await chatPost(
        jsonRequest("/api/agent/chat", { unitId, sessionId, userText: "This is my dad!" })
      );
      expect(second.status).toBe(200);
      const completion = await chatPost(
        jsonRequest("/api/agent/chat", { unitId, sessionId, userText: "I love my family!" })
      );
      expect(completion.status).toBe(200);
      expect(await completion.json()).toMatchObject({
        response: { isSceneComplete: true },
        starsAwarded: 5,
        voiceBonusStars: 1,
      });
    } finally {
      db.update(appSettings).set(settings).where(eq(appSettings.id, 1)).run();
    }
  });

  it("consumes a speech proof only once for its intended profile and action, and restores it on rollback", () => {
    const db = getDb();
    const proof = issueVoiceProof("Star Cake", 1, "feed");
    const expected = { purpose: "feed", snackId: "snack-cake" } as const;
    expect(db.select({ evidence: voiceProofs.evidence })
      .from(voiceProofs).where(eq(voiceProofs.purpose, "feed")).all()).toEqual([
        { evidence: '["snack-cake"]' },
      ]);

    expect(db.transaction((tx) => consumeVoiceProof(tx, proof, 2, expected))).toBe(false);
    expect(db.transaction((tx) => consumeVoiceProof(tx, proof, 1, { ...expected, snackId: "snack-apple" }))).toBe(false);
    expect(db.transaction((tx) => consumeVoiceProof(tx, proof, 1, {
      purpose: "roleplay", transcript: "Star Cake",
    }))).toBe(false);
    expect(() => db.transaction((tx) => {
      expect(consumeVoiceProof(tx, proof, 1, expected)).toBe(true);
      throw new Error("cancel test transaction");
    })).toThrow("cancel test transaction");

    expect(db.transaction((tx) => consumeVoiceProof(tx, proof, 1, expected))).toBe(true);
    expect(db.transaction((tx) => consumeVoiceProof(tx, proof, 1, expected))).toBe(false);
  });

  it("checks course ownership and awards stars only on the first step completion", async () => {
    const progress = (body: Record<string, unknown>) => progressPost(jsonRequest("/api/progress", {
      unitId: "u3-numbers", step: "story", ...body,
    }));
    const item = { itemKey: "u3-one", itemType: "word", correct: true };
    const elsewhere = await progress({ practicedItems: [{ ...item, itemKey: "u1-hello" }] });
    expect(elsewhere.status).toBe(400);

    const [first, second] = await Promise.all([
      progress({ practicedItems: [item] }),
      progress({ practicedItems: [item] }),
    ]);
    const results = await Promise.all([first.json(), second.json()]);
    expect(results.map((result) => result.starsAwarded).sort()).toEqual([0, 3]);
    expect(await (await progress({})).json()).toMatchObject({ starsAwarded: 0 });
  });

  it("records at most one miss until the child gets the review item right", async () => {
    const db = getDb();
    const row = () => db.select().from(wordMastery).where(eq(wordMastery.itemKey, "u3-one")).get()!;
    const submit = (correct: boolean, unitId = "u3-numbers") => reviewPost(jsonRequest("/api/review", {
      itemKey: "u3-one", itemType: "word", unitId, correct,
    }));
    const due = () => db.update(wordMastery)
      .set({ nextReviewAt: new Date(Date.now() - 60_000).toISOString() })
      .where(eq(wordMastery.itemKey, "u3-one")).run();

    expect((await submit(false, "u1-greetings")).status).toBe(400);
    expect((await submit(true)).status).toBe(200);
    due();
    const baseline = row();
    await Promise.all([submit(false), submit(false), submit(false)]);
    expect(row()).toMatchObject({ masteryLevel: baseline.masteryLevel - 1, wrongCount: baseline.wrongCount + 1 });
    expect(await (await submit(true)).json()).toMatchObject({ starsAwarded: 1, masteryLevel: baseline.masteryLevel });
    await submit(false);
    expect(row().wrongCount).toBe(baseline.wrongCount + 1);
    due();
    await submit(false);
    expect(row().wrongCount).toBe(baseline.wrongCount + 2);
  });
});
