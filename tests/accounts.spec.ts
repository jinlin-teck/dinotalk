import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class TestRecognition {
      onresult?: (event: { results: { transcript: string }[][] }) => void;
      onend?: () => void;
      start() {}
      abort() {}
      stop() {
        document.addEventListener(
          "test-recognition-finish",
          (event) => {
            const transcript =
              event instanceof CustomEvent && typeof event.detail === "string"
                ? event.detail
                : "苗苗";
            this.onresult?.({ results: [[{ transcript }]] });
            this.onend?.();
          },
          { once: true }
        );
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { value: TestRecognition });
  });

  await page.route("**/api/speech/config", (route) =>
    route.fulfill({ json: { sttMode: "browser", ttsAutoPlayZh: true } })
  );
  await page.route("**/api/speech/tts", (route) => route.fulfill({ json: { fallback: "browser" } }));
});

test("first-visit voice onboarding creates 苗苗, persists across reloads, and replaces default nickname", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("输入或说出你的名字开始吧！")).toBeVisible();

  await page.getByTestId("profile-voice-btn").click();
  await page.getByTestId("profile-voice-btn").click();
  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent("test-recognition-finish", { detail: "我叫苗苗。" }))
  );

  await expect(page.getByTestId("profile-name-input")).toHaveValue("苗苗");
  await page.getByTestId("profile-create-submit").click();

  await expect(page.getByTestId("profile-modal")).toHaveCount(0);
  await expect(page.getByTestId("header-profile-greeting")).toHaveText("Hi, 苗苗!");
  await expect(page.getByRole("heading", { name: "苗苗，欢迎来到恐龙英语岛！" })).toBeVisible();
  await expect(page.getByText("小探险家")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("profile-modal")).toHaveCount(0);
  await expect(page.getByTestId("header-profile-greeting")).toHaveText("Hi, 苗苗!");
  await expect(page.getByRole("heading", { name: "苗苗，欢迎来到恐龙英语岛！" })).toBeVisible();
});

test("homepage switch prompt and top-right switcher isolate multiple profiles cleanly", async ({
  page,
}) => {
  await page.goto("/");

  // Select 苗苗 from existing profile list
  await expect(page.getByTestId("profile-modal")).toBeVisible();
  await page.getByRole("button", { name: /苗苗/ }).click();
  await expect(page.getByTestId("profile-modal")).toHaveCount(0);

  // Spend 8 stars (crown) for 苗苗 so her balance (2) differs from a brand-new user (10 stars)
  await page.evaluate(async () => {
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "buy_accessory", accessoryId: "crown" }),
    });
  });
  await page.reload();
  await expect(page.getByTestId("total-stars")).toHaveText("2");

  // Homepage prompt: 不是苗苗？点这里切换 -> create 豆豆
  await expect(page.getByTestId("home-switch-profile-prompt")).toBeVisible();
  await page.getByTestId("home-switch-profile-btn").click();
  await page.getByTestId("profile-new-btn").click();
  await page.getByTestId("profile-name-input").fill("豆豆");
  await page.getByTestId("profile-create-submit").click();

  await expect(page.getByTestId("header-profile-greeting")).toHaveText("Hi, 豆豆!");
  await expect(page.getByRole("heading", { name: "豆豆，欢迎来到恐龙英语岛！" })).toBeVisible();
  await expect(page.getByTestId("home-switch-profile-btn")).toHaveText("不是豆豆？点这里切换");
  await expect(page.getByTestId("total-stars")).toHaveText("10");

  // Use top-right switcher button to switch back to 苗苗
  await page.getByTestId("switch-profile-btn").click();
  await page.getByRole("button", { name: /苗苗/ }).click();
  await expect(page.getByTestId("header-profile-greeting")).toHaveText("Hi, 苗苗!");
  await expect(page.getByTestId("total-stars")).toHaveText("2");
});

test("parent console uses password-only auth and supports full profile CRUD with cascade cleanup", async ({
  page,
}) => {
  // Activate 豆豆 as current browser profile before opening parent console
  await page.goto("/");
  await page.getByRole("button", { name: /豆豆/ }).click();
  await expect(page.getByTestId("header-profile-greeting")).toHaveText("Hi, 豆豆!");

  await page.goto("/parent");

  // No math challenge anywhere
  await expect(page.getByText(/\d+\s*\+\s*\d+\s*=\s*\?/)).toHaveCount(0);

  // First-time setup password
  const setupPinInput = page.getByTestId("parent-setup-pin");
  await expect(setupPinInput).toBeVisible();
  await setupPinInput.fill("parent1234");
  await page.getByTestId("parent-setup-confirm-pin").fill("parent1234");
  await page.getByTestId("parent-gate-submit").click();

  await expect(page.getByText("DinoTalk 家长控制台")).toBeVisible();

  // Logout & test password-only unlock (wrong password rejected, right password accepted)
  await page.getByTestId("parent-logout-btn").click();
  await expect(page.getByTestId("parent-gate-input")).toBeVisible();
  await page.getByTestId("parent-gate-input").fill("wrong999");
  await page.getByTestId("parent-gate-submit").click();
  await expect(page.getByText("家长密码不正确")).toBeVisible();

  await page.getByTestId("parent-gate-input").fill("parent1234");
  await page.getByTestId("parent-gate-submit").click();
  await expect(page.getByText("DinoTalk 家长控制台")).toBeVisible();

  // Switch to profile management tab
  await page.getByTestId("parent-tab-profile").click();
  await expect(page.getByText("清除密码")).toHaveCount(0);

  // Create 乐乐
  await page.getByTestId("parent-create-profile-btn").click();
  await page.getByTestId("parent-create-nickname").fill("乐乐");
  await page.getByTestId("parent-create-submit").click();
  await expect(page.getByText("已新建「乐乐」的学习档案！")).toBeVisible();

  // Edit 乐乐 -> 乐乐宝
  const leleCard = page.locator("[data-testid^='parent-profile-card-']", { hasText: "乐乐" }).first();
  await leleCard.locator("[data-testid^='parent-edit-profile-']").click();
  await page.getByTestId("parent-edit-nickname").fill("乐乐宝");
  await page.getByTestId("parent-edit-save").click();
  await expect(page.getByText("已更新「乐乐宝」的档案与护眼设置！")).toBeVisible();

  // Check report tab switches across children
  const miaomiaoCard = page.locator("[data-testid^='parent-profile-card-']", { hasText: "苗苗" }).first();
  await miaomiaoCard.locator("[data-testid^='parent-report-profile-']").click();
  await expect(page.getByText("苗苗 近 7 天学习活跃趋势")).toBeVisible();

  await page.locator("[data-testid^='report-profile-btn-']", { hasText: "乐乐宝" }).click();
  await expect(page.getByText("乐乐宝 近 7 天学习活跃趋势")).toBeVisible();

  // Delete all test profiles so deleting the active browser profile cleanly returns / to onboarding
  await page.getByTestId("parent-tab-profile").click();
  for (const name of ["乐乐宝", "豆豆", "苗苗"]) {
    const card = page.locator("[data-testid^='parent-profile-card-']", { hasText: name }).first();
    await card.locator("[data-testid^='parent-delete-profile-']").click();
    await expect(page.getByTestId("parent-delete-confirm-modal")).toBeVisible();
    await page.getByTestId("parent-delete-confirm-btn").click();
    await expect(page.getByTestId("parent-delete-confirm-modal")).toHaveCount(0);
  }

  await page.goto("/");
  await expect(page.getByText("输入或说出你的名字开始吧！")).toBeVisible();
});
