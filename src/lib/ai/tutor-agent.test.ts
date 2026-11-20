import { describe, expect, it } from "vitest";
import { getUnitById } from "@/data/curriculum";
import { parseAgentJson } from "./tutor-agent";
import { runFallbackFreeTalkTurn, runFallbackRoleplayTurn } from "./fallback-agent";

describe("AI Tutor Agent parsing and local fallback engine", () => {
  const unit1 = getUnitById("u1-greetings")!;
  const unit5 = getUnitById("u5-fruits")!;

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

  it("answers Chinese word lookup questions in fallback free-talk mode", () => {
    const res = runFallbackFreeTalkTurn("苹果用英语怎么说？");
    expect(res.englishReply.toLowerCase()).toContain("apple");
    expect(res.chineseHint).toContain("apple");
  });
});
