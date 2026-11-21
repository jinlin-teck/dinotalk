import { describe, expect, it } from "vitest";
import { getUnitById } from "@/data/curriculum";
import { parseAgentJson } from "./tutor-agent";
import { personalizeSuggestionChips, runFallbackFreeTalkTurn, runFallbackRoleplayTurn } from "./fallback-agent";

describe("AI Tutor Agent parsing and local fallback engine", () => {
  const unit1 = getUnitById("u1-greetings")!;
  const unit5 = getUnitById("u5-fruits")!;

  it("preserves dollar sequences when inserting a child's nickname", () => {
    const chips = [{ en: "Hi Alex", zh: "你好 Leo", icon: "👋" }];
    expect(personalizeSuggestionChips(chips, "$&$1")).toEqual([{ ...chips[0], en: "Hi $&$1", zh: "你好 $&$1" }]);
  });

  it("extracts JSON wrapped in <think> blocks and markdown fences, filtering invalid goal IDs", () => {
    const raw = `<think>Thinking about 7yo response...</think>
\`\`\`json
{
  "englishReply": "Hi Alex! Nice to meet you!",
  "chineseHint": "真棒，介绍一下你自己吧",
  "emotion": "excited",
  "praise": "打招呼很热情！",
  "completedGoalIds": ["u1-g1", "nonexistent-goal"],
  "masteredWords": ["hello", "unknownword"],
  "isSceneComplete": false
}
\`\`\``;

    const parsed = parseAgentJson(raw, unit1, []);
    expect(parsed.englishReply).toBe("Hi Alex! Nice to meet you!");
    expect(parsed.completedGoalIds).toEqual(["u1-g1"]);
    expect(parsed.masteredWords).toEqual(["hello"]);
    expect(parsed.nextSuggestions.length).toBeGreaterThanOrEqual(2);
    expect(parsed.isSceneComplete).toBe(false);
  });

  it("walks a 3-goal roleplay scenario to completion in local fallback mode", () => {
    const t1 = runFallbackRoleplayTurn(unit5, "An apple, please!", []);
    expect(t1.completedGoalIds).toEqual(["u5-g1"]);
    expect(t1.isSceneComplete).toBe(false);

    const t2 = runFallbackRoleplayTurn(unit5, "Milk, please!", t1.completedGoalIds);
    expect(t2.completedGoalIds).toEqual(["u5-g1", "u5-g2"]);
    expect(t2.isSceneComplete).toBe(false);

    const t3 = runFallbackRoleplayTurn(unit5, "Thank you!", t2.completedGoalIds);
    expect(t3.completedGoalIds).toEqual(["u5-g1", "u5-g2", "u5-g3"]);
    expect(t3.isSceneComplete).toBe(true);
    expect(t3.emotion).toBe("cheering");
  });

  it("answers Chinese word lookup questions and avoids false-positive substring matches in fallback free-talk mode", () => {
    const appleRes = runFallbackFreeTalkTurn("苹果用英语怎么说？");
    expect(appleRes.englishReply.toLowerCase()).toContain("apple");
    expect(appleRes.chineseHint).toContain("apple");

    const nineRes = runFallbackFreeTalkTurn("九用英语怎么说？");
    expect(nineRes.englishReply.toLowerCase()).toContain("nine");

    // Must not falsely match '一' -> 'one' or '水' -> 'water' or 'hi' inside 'white'
    const storyRes = runFallbackFreeTalkTurn("给我讲一个故事");
    expect(storyRes.englishReply.toLowerCase()).toContain("sunny day");
    expect(storyRes.masteredWords).toContain("rabbit");

    const riddleRes = runFallbackFreeTalkTurn("再猜一个谜语");
    expect(riddleRes.englishReply.toLowerCase()).toContain("riddle");

    const fruitRes = runFallbackFreeTalkTurn("水果用英语怎么说？");
    expect(fruitRes.englishReply.toLowerCase()).not.toContain("water");

    const whiteRes = runFallbackFreeTalkTurn("I like white!");
    expect(whiteRes.masteredWords).not.toContain("hi");

    const helloRes = runFallbackFreeTalkTurn("Hello!");
    expect(helloRes.englishReply.toLowerCase()).toContain("how are you");
  });

  it("rotates offline riddles & stories, praises correct riddle answers, and personalizes child nickname", () => {
    const r1 = runFallbackFreeTalkTurn("再猜一个谜语", []);
    expect(r1.englishReply).toContain("yellow and sweet");

    // Wrong guess keeps the active riddle alive instead of falling back to dictionary definition
    const wrongGuess = runFallbackFreeTalkTurn("It's an apple!", [
      { role: "assistant", englishText: r1.englishReply },
    ]);
    expect(wrongGuess.englishReply).toContain("Try this riddle again");

    // Subsequent right guess after wrong guess still succeeds!
    const answeredAfterWrong = runFallbackFreeTalkTurn("It's a banana!", [
      { role: "assistant", englishText: r1.englishReply },
      { role: "user", englishText: "It's an apple!" },
      { role: "assistant", englishText: wrongGuess.englishReply },
    ]);
    expect(answeredAfterWrong.englishReply).toContain("Bingo");
    expect(answeredAfterWrong.emotion).toBe("cheering");
    expect(answeredAfterWrong.masteredWords).toContain("banana");

    const r2 = runFallbackFreeTalkTurn("Give me another riddle!", [
      { role: "assistant", englishText: r1.englishReply },
    ]);
    expect(r2.englishReply).not.toBe(r1.englishReply);

    const s1 = runFallbackFreeTalkTurn("Tell me a story", []);
    const s2 = runFallbackFreeTalkTurn("Tell me more!", [
      { role: "assistant", englishText: s1.englishReply },
    ]);
    expect(s2.englishReply).not.toBe(s1.englishReply);

    const personalized = runFallbackRoleplayTurn(unit1, "Hello!", [], "Mia");
    expect(personalized.nextSuggestions.some((c) => c.en.includes("Mia"))).toBe(true);
  });

  it("strips Markdown syntax like **monkey** from LLM replies and suggestions so TTS never reads asterisks", () => {
    const raw = JSON.stringify({
      englishReply: "It is a **monkey**! Look at the *cute* `monkey`!",
      chineseHint: "“猴子”用英语说是 **monkey**！",
      emotion: "excited",
      praise: "**真棒**！",
      completedGoalIds: [],
      nextSuggestions: [
        { en: "It's a **monkey**!", zh: "是一只 **小猴子**！", icon: "🐵" },
      ],
      masteredWords: ["**monkey**"],
      isSceneComplete: false,
    });

    const parsed = parseAgentJson(raw, null, []);
    expect(parsed.englishReply).toBe("It is a monkey! Look at the cute monkey!");
    expect(parsed.chineseHint).toBe("“猴子”用英语说是 monkey！");
    expect(parsed.praise).toBe("真棒！");
    expect(parsed.nextSuggestions[0].en).toBe("It's a monkey!");
    expect(parsed.nextSuggestions[0].zh).toBe("是一只 小猴子！");
    expect(parsed.masteredWords).toEqual(["monkey"]);
  });

  it("does not allow LLM isSceneComplete=true to bypass unfinished scene goals", () => {
    const raw = JSON.stringify({
      englishReply: "Great job!",
      chineseHint: "太棒了",
      emotion: "cheering",
      praise: "真棒！",
      completedGoalIds: ["u1-g1"],
      nextSuggestions: [{ en: "I am Alex.", zh: "我叫 Alex。", icon: "👋" }],
      masteredWords: ["hello"],
      isSceneComplete: true,
    });
    const parsed = parseAgentJson(raw, unit1, []);
    expect(parsed.completedGoalIds).toEqual(["u1-g1"]);
    expect(parsed.isSceneComplete).toBe(false);
  });
});
