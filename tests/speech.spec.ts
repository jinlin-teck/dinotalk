import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class TestRecognition {
      onresult?: (event: { results: { transcript: string }[][] }) => void;
      onend?: () => void;
      start() {}
      abort() {}
      stop() {
        document.addEventListener("test-recognition-finish", () => {
          this.onresult?.({ results: [[{ transcript: "Hello Dino" }]] });
          this.onend?.();
        }, { once: true });
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { value: TestRecognition });
  });
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
