import { expect, test } from "@playwright/test";
import { getUnitById } from "../src/data/curriculum";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class TestRecognition {
      onresult?: (event: { results: { transcript: string }[][] }) => void;
      onend?: () => void;
      start() {}
      abort() {}
      stop() {
        document.addEventListener("test-recognition-finish", (event) => {
          const transcript = event instanceof CustomEvent && typeof event.detail === "string"
            ? event.detail
            : "Hello Dino";
          this.onresult?.({ results: [[{ transcript }]] });
          this.onend?.();
        }, { once: true });
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { value: TestRecognition });
  });
  await page.route("**/api/profile", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: {
          needsProfile: false,
          profile: {
            id: 999,
            nickname: "测试宝贝",
            avatarId: "dino-green",
            companionName: "Dino",
            totalStars: 10,
            level: 1,
            petHunger: 80,
            petMood: 90,
            equippedAccessoriesJson: "[]",
            ownedAccessoriesJson: "[]",
            equippedAccessories: [],
            ownedAccessories: [],
            ownedSkinIds: [],
            dailyGoalMinutes: 15,
            eyeCareMinutes: 15,
            streakDays: 1,
            lastActiveDate: "2026-11-22",
            createdAt: "2026-11-22T00:00:00.000Z",
            updatedAt: "2026-11-22T00:00:00.000Z",
          },
          profiles: [
            {
              id: 999,
              nickname: "测试宝贝",
              avatarId: "dino-green",
              companionName: "Dino",
              totalStars: 10,
              level: 1,
              streakDays: 1,
              equippedAccessories: [],
              lastActiveDate: "2026-11-22",
            },
          ],
          todayLog: {
            dateKey: "2026-11-22",
            studySeconds: 0,
            activitiesCompleted: 0,
            wordsPracticed: 0,
          },
          dueReviewCount: 0,
          unitProgress: [],
        },
      });
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/progress", (route) =>
    route.fulfill({ json: { needsProfile: false, unitProgress: [], wordMastery: [] } })
  );
  await page.route("**/api/speech/config", (route) => route.fulfill({ json: { sttMode: "browser" } }));
  await page.route("**/api/agent/freetalk", (route) => route.fulfill({
    json: {
      sessionId: 1,
      response: {
        englishReply: "Nice to meet you!",
        chineseHint: "很高兴认识你！",
        emotion: "happy",
        nextSuggestions: [],
      },
    },
  }));
  await page.route("**/api/speech/tts", (route) => route.fulfill({ json: { fallback: "browser" } }));
  await page.goto("/chat");
});

test("submits the browser transcript after tapping End", async ({ page }) => {
  await page.getByRole("button", { name: "语音聊天" }).click();
  await page.getByRole("button", { name: "点此结束" }).click();

  const sent = page.waitForRequest("**/api/agent/freetalk");
  await page.evaluate(() => document.dispatchEvent(new Event("test-recognition-finish")));

  expect((await sent).postDataJSON()).toMatchObject({ userText: "Hello Dino" });
  await expect(page.getByText("Hello Dino", { exact: true })).toBeVisible();
});

test("starting a new recording discards the previous browser result", async ({ page }) => {
  await page.getByRole("button", { name: "语音聊天" }).click();
  await page.getByRole("button", { name: "点此结束" }).click();
  await page.getByRole("button", { name: "语音聊天" }).click();

  await page.evaluate(() => document.dispatchEvent(new Event("test-recognition-finish")));
  await expect(page.getByRole("button", { name: "点此结束" })).toBeVisible();
  await expect(page.getByText("Hello Dino", { exact: true })).toHaveCount(0);
});

test("switching chat topics discards transcription from the previous topic", async ({ page }) => {
  const sentMessages: unknown[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/agent/freetalk")) {
      sentMessages.push(request.postDataJSON());
    }
  });

  await page.getByRole("button", { name: "语音聊天" }).click();
  await page.getByRole("button", { name: "点此结束" }).click();
  await page.getByRole("button", { name: "动物猜猜乐" }).click();
  await page.evaluate(() => document.dispatchEvent(new Event("test-recognition-finish")));

  await page.getByRole("button", { name: /It's a panda!/ }).click();
  await expect(page.getByText("Nice to meet you!", { exact: true })).toBeVisible();
  await expect(page.getByText("Hello Dino", { exact: true })).toHaveCount(0);
  expect(sentMessages).toEqual([{ topicId: "animal-riddle", userText: "It's a panda!" }]);
});

test("leaving the roleplay tab discards its late recording and keeps the scene usable", async ({ page }) => {
  const turns: unknown[] = [];
  await page.route("**/api/agent/chat", async (route) => {
    turns.push(route.request().postDataJSON());
    await route.fulfill({ json: {
      sessionId: 1,
      response: { englishReply: "Good morning!", chineseHint: "早上好！", nextSuggestions: [] },
    } });
  });
  await page.goto("/unit/u1-greetings");
  await page.getByTestId("tab-roleplay").click();
  await page.getByRole("button", { name: "按这里开口说英语" }).click();
  await page.getByRole("button", { name: "点一下结束说话" }).click();
  await page.getByTestId("tab-story").click();
  await page.evaluate(() => document.dispatchEvent(new Event("test-recognition-finish")));

  await page.getByTestId("tab-roleplay").click();
  await page.getByTestId("suggestion-chip-0").click();
  await expect(page.getByText("Good morning!", { exact: true })).toBeVisible();
  expect(turns).toHaveLength(1);
  expect(turns[0]).toMatchObject({ usedVoice: false });
});

test("a corrected phonics answer is saved as correct and the reward banner can be dismissed", async ({ page }) => {
  const unit = getUnitById("u1-greetings")!;
  await page.route("**/api/progress", (route) => route.fulfill({ json: route.request().method() === "GET"
    ? { wordMastery: [] }
    : {
        unitProgress: { unitId: unit.id, storyDone: 1, phonicsDone: 1, gameDone: 1, roleplayDone: 1, starsEarned: 4 },
        starsAwarded: 3,
        unlockedAccessory: { nameZh: "水手帽", emoji: "⚓", descZh: "你好，新朋友！" },
      },
  }));

  await page.goto(`/unit/${unit.id}`);
  await page.getByTestId("tab-phonics").click();
  await page.getByTestId(`phonics-option-${unit.phonics[1].id}`).click();
  await expect(page.getByText(/差一点点哦/)).toBeVisible();
  for (const phonics of unit.phonics.slice(0, 4)) {
    await page.getByTestId(`phonics-option-${phonics.id}`).click();
  }

  const saved = page.waitForRequest((request) => request.url().endsWith("/api/progress") && request.method() === "POST");
  await page.getByTestId("complete-phonics-btn").click();
  expect((await saved).postDataJSON().practicedItems).toContainEqual({
    itemKey: unit.phonics[0].id, itemType: "phonics", correct: true,
  });
  await expect(page.getByTestId("unlocked-accessory-banner")).toBeVisible();
  await page.getByRole("button", { name: "关闭装扮解锁提示" }).click();
  await expect(page.getByTestId("unlocked-accessory-banner")).toHaveCount(0);
});

test("voice feeding retries a failed speech configuration request before recording", async ({ page }) => {
  let configRequests = 0;
  await page.route("**/api/speech/config", (route) => {
    configRequests += 1;
    return configRequests === 1
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: { sttMode: "browser" } });
  });
  await page.route("**/api/profile", (route) => {
    if (route.request().method() === "PATCH" && route.request().postDataJSON().action === "feed") {
      return route.fulfill({ json: { messageZh: "已半价投喂！" } });
    }
    return route.fallback();
  });

  const initialConfig = page.waitForResponse((response) => response.url().endsWith("/api/speech/config"));
  await page.goto("/pet");
  expect((await initialConfig).status()).toBe(503);
  await page.getByRole("button", { name: /说 Star Cake 半价/ }).click();
  await expect.poll(() => configRequests).toBe(2);
  await page.getByRole("button", { name: "点此结束" }).click();
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("test-recognition-finish", { detail: "Star Cake" })));
  await expect(page.getByText("已半价投喂！", { exact: true })).toBeVisible();
});

test("switching review to cards discards late speech and advances exactly one item", async ({ page }) => {
  const answeredItems: string[] = [];
  await page.route("**/api/review", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      answeredItems.push(request.postDataJSON().itemKey);
      await route.fulfill({ json: { ok: true, starsAwarded: 1 } });
      return;
    }

    const baseItem = {
      itemType: "word",
      unitId: "u1-greetings",
      unitTitleZh: "你好，新朋友！",
      masteryLevel: 4,
      distractors: [],
    };
    await route.fulfill({ json: {
      isWarmup: false,
      dueCount: 2,
      items: [
        {
          ...baseItem,
          itemKey: "u1-hello",
          displayText: "hello",
          audioText: "hello",
          zh: "你好",
          visualKey: "wave",
          questionMode: "speak_card",
        },
        {
          ...baseItem,
          itemKey: "u1-name",
          displayText: "name",
          audioText: "name",
          zh: "名字",
          visualKey: "nametag",
          questionMode: "listen_read",
        },
      ],
    } });
  });

  await page.goto("/review");
  await page.getByRole("button", { name: "按这里开口说英语" }).click();
  await page.getByRole("button", { name: "点此结束" }).click();
  await page.getByRole("button", { name: /切换为选卡片/ }).click();
  await page.getByRole("button", { name: "你好" }).click();
  await page.evaluate(() => document.dispatchEvent(new Event("test-recognition-finish")));

  await expect(page.getByText(/进度 2 \/ 2/)).toBeVisible();
  expect(answeredItems).toEqual(["u1-hello"]);
});

test("enforces flexible gate in story cards and hides English target word in Round 1 Listen & Pick", async ({
  page,
}) => {
  await page.goto("/unit/u2-colors");

  // Flexible gate: complete button is disabled before viewing all cards, while browse-next works
  await expect(page.getByTestId("complete-story-btn")).toBeDisabled();
  await expect(page.getByTestId("skip-story-btn")).toBeVisible();

  // Switch to MiniGames tab via Tab button
  await page.getByTestId("tab-game").click();
  await expect(page.getByTestId("complete-game-btn")).toBeDisabled();

  // Round 1 options must not leak English words before answering
  const firstOption = page.locator("[data-testid^='r1-option-']").first();
  await expect(firstOption).toBeVisible();
  await expect(firstOption).toContainText("点我选择");
});

test("review page speaks each item only once on load and stays on current item if POST /api/review fails", async ({
  page,
}) => {
  let ttsCalls = 0;
  await page.route("**/api/speech/tts", async (route) => {
    ttsCalls += 1;
    await route.fulfill({ json: { fallback: "browser" } });
  });
  await page.route("**/api/review", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: {
          isWarmup: true,
          dueCount: 0,
          items: [
            {
              itemKey: "u1-hello",
              itemType: "word",
              unitId: "u1-greetings",
              unitTitleZh: "你好，新朋友！",
              displayText: "hello",
              audioText: "hello",
              subText: "/həˈloʊ/",
              zh: "你好",
              visualKey: "wave",
              masteryLevel: 1,
              questionMode: "listen_read",
              distractors: [
                { text: "bye", zh: "再见", visualKey: "bye" },
                { text: "name", zh: "名字", visualKey: "nametag" },
              ],
            },
          ],
        },
      });
    } else {
      await route.fulfill({ status: 500, json: { error: "db_error" } });
    }
  });

  await page.goto("/review");
  await expect(page.getByText("每日 3 分钟复习宝箱")).toBeVisible();
  await expect(page.getByText("hello", { exact: true })).toBeVisible();

  // Wait briefly to confirm no repeated TTS auto-play loop occurs
  await page.waitForTimeout(450);
  expect(ttsCalls).toBe(1);

  // Clicking correct option when POST /api/review returns 500 must NOT advance to completion screen
  await page.getByRole("button", { name: "你好" }).click();
  await expect(page.getByText(/进度保存失败/)).toBeVisible();
  await expect(page.getByText(/宝箱开启成功/)).toHaveCount(0);

  await page.goto("/pet");
  await expect(page.getByText("恐龙变身肤色")).toBeVisible();
  await expect(page.getByText("10 关满 4 星专属荣誉装扮")).toBeVisible();
  await expect(page.getByTestId("skin-dino-green")).toContainText("当前肤色");
});
