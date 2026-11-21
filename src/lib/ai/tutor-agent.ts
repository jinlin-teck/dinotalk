import { z } from "zod";
import type { EmotionMood, SuggestionChip, UnitDef } from "@/data/curriculum/types";
import {
  callChatCompletion,
  isLlmConfigured,
  LlmProviderError,
  stripReasoningTags,
  type ChatMessageParam,
  type LlmConfig,
  type ProviderErrorCode,
} from "./provider";
import { runFallbackFreeTalkTurn, runFallbackRoleplayTurn, type TutorResponse } from "./fallback-agent";
import { stripMarkdownFormatting } from "@/lib/speech/text-sanitizer";

const SuggestionSchema = z.object({
  en: z.string().min(1).max(80),
  zh: z.string().min(1).max(80),
  icon: z.string().min(1).max(8).optional().default("💬"),
});

const RawTutorResponseSchema = z.object({
  englishReply: z.string().min(1),
  chineseHint: z.string().optional().default(""),
  emotion: z
    .enum(["idle", "happy", "talking", "thinking", "cheering", "sleeping", "excited"])
    .optional()
    .default("happy"),
  praise: z.string().optional().default("说得真棒！继续加油哦~"),
  completedGoalIds: z.array(z.string()).optional().default([]),
  nextSuggestions: z.array(SuggestionSchema).optional().default([]),
  masteredWords: z.array(z.string()).optional().default([]),
  isSceneComplete: z.boolean().optional().default(false),
});

export type { TutorResponse };

function stripThinkingAndMarkdown(raw: string): string {
  // Remove <think>...</think> and <thought>...</thought> reasoning blocks emitted by reasoning models
  let cleaned = stripReasoningTags(raw);
  // Strip ```json ... ``` or ``` ... ``` fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

export function parseAgentJson(
  rawText: string,
  unit: UnitDef | null,
  alreadyCompletedGoalIds: string[] = []
): TutorResponse {
  const cleaned = stripThinkingAndMarkdown(rawText);
  const parsedJson = JSON.parse(cleaned);
  const validated = RawTutorResponseSchema.parse(parsedJson);

  const validGoalIds = new Set(unit ? unit.roleplay.goals.map((g) => g.id) : []);
  const mergedGoalSet = new Set(
    alreadyCompletedGoalIds.filter((id) => validGoalIds.has(id))
  );
  for (const gid of validated.completedGoalIds) {
    if (validGoalIds.has(gid)) {
      mergedGoalSet.add(gid);
    }
  }

  const finalGoalIds = unit
    ? unit.roleplay.goals.filter((g) => mergedGoalSet.has(g.id)).map((g) => g.id)
    : [];

  const isComplete = unit
    ? finalGoalIds.length >= unit.roleplay.goals.length
    : false;

  const fallbackSuggestions: SuggestionChip[] = unit
    ? unit.roleplay.openingSuggestions.slice(0, 2)
    : [
        { en: "I am happy!", zh: "我很开心！", icon: "😄" },
        { en: "Thank you!", zh: "谢谢你！", icon: "🌟" },
      ];

  const suggestions =
    validated.nextSuggestions.length > 0
      ? validated.nextSuggestions.slice(0, 3).map((s) => ({
          ...s,
          en: stripMarkdownFormatting(s.en) || s.en.trim(),
          zh: stripMarkdownFormatting(s.zh) || s.zh.trim(),
        }))
      : fallbackSuggestions;

  const allowedWords = new Set(unit ? unit.vocab.map((v) => v.word.toLowerCase()) : []);
  const mastered = validated.masteredWords
    .map((w) => stripMarkdownFormatting(w).toLowerCase())
    .filter((w) => (allowedWords.size === 0 ? w.length > 0 : allowedWords.has(w)));

  return {
    englishReply: stripMarkdownFormatting(validated.englishReply) || validated.englishReply.trim(),
    chineseHint:
      stripMarkdownFormatting(validated.chineseHint) || "太棒了！点一下提示气泡试试下一句吧~",
    emotion: validated.emotion as EmotionMood,
    praise: stripMarkdownFormatting(validated.praise) || "勇敢开口最棒啦！",
    completedGoalIds: finalGoalIds,
    nextSuggestions: suggestions,
    masteredWords: Array.from(new Set(mastered)),
    isSceneComplete: isComplete,
  };
}

function buildRoleplaySystemPrompt(
  unit: UnitDef,
  childNickname: string,
  companionName: string,
  completedGoalIds: string[]
): string {
  const vocabList = unit.vocab.map((v) => `${v.word}(${v.zh})`).join(", ");
  const goalsText = unit.roleplay.goals
    .map((g) => {
      const done = completedGoalIds.includes(g.id) ? "[已完成]" : "[待完成]";
      return `- ${g.id} ${done}: ${g.titleZh}（目标参考表达：${g.targetExampleEn}）`;
    })
    .join("\n");

  return `你现在扮演「${companionName}」，是陪伴 7 岁小学二年级零基础小朋友「${childNickname}」学英语的温暖小恐龙老师（角色：${unit.roleplay.npcRoleZh}，当前场景：${unit.roleplay.sceneNameZh}）。

【教学与安全准则】
1. 孩子英语几乎零基础！你的 englishReply 必须非常简短简单（3~10 个英文单词，1~2 个短句，优先使用本单元词汇），不要用长难句或复杂语法。
2. 即使孩子发音识别有点误差或中英夹杂，也要先热情表扬（praise），再用正确简单的英语自然回应并示范。
3. 严格保持儿童安全内容，绝不输出暴力、恐怖、成人、说教或负面批评内容。
4. 所有文本字段必须使用纯文本，严禁使用任何 Markdown 语法（如 **加粗**、*斜体*、反引号或列表符号），以免影响语音朗读。
5. 必须严格返回单个合法 JSON 对象，不要有任何 JSON 之外的解释或 Markdown：
{
  "englishReply": "简短温暖的英文回复(3-10词)",
  "chineseHint": "贴心的简体中文提示，引导孩子完成下一个未完成目标",
  "emotion": "happy | excited | talking | thinking | cheering",
  "praise": "一句简短欢快的中文夸奖",
  "completedGoalIds": ["必须包含此前已完成的id以及本次新达成的目标id"],
  "nextSuggestions": [
    {"en": "2到5个词的英文示范", "zh": "对应中文意思", "icon": "1个合适emoji"}
  ],
  "masteredWords": ["本轮孩子正确说出的本单元英文核心词"],
  "isSceneComplete": false
}

【本单元核心词汇】${vocabList}
【本场景3个过关目标】
${goalsText}

当全部 3 个目标都达成时，设置 "isSceneComplete": true 且 "emotion": "cheering"，给出热情的通关祝贺！nextSuggestions 每次必须提供 2 到 3 个超级简单、7岁零基础一眼能懂跟读的英文提示气泡。`;
}

export interface AgentTurnResult {
  response: TutorResponse;
  usedFallback: boolean;
  fallbackReason?: ProviderErrorCode | "invalid_response";
}

export async function runRoleplayTurn(params: {
  config: LlmConfig;
  unit: UnitDef;
  childNickname: string;
  companionName: string;
  history: Array<{ role: "assistant" | "user"; englishText: string }>;
  userText: string;
  completedGoalIds: string[];
}): Promise<AgentTurnResult> {
  const { config, unit, childNickname, companionName, history, userText, completedGoalIds } = params;

  if (!isLlmConfigured(config)) {
    return {
      response: runFallbackRoleplayTurn(unit, userText, completedGoalIds, childNickname),
      usedFallback: true,
      fallbackReason: "not_configured",
    };
  }

  const messages: ChatMessageParam[] = [
    {
      role: "system",
      content: buildRoleplaySystemPrompt(unit, childNickname, companionName, completedGoalIds),
    },
    ...history.slice(-8).map((m) => ({
      role: m.role,
      content: m.englishText,
    })),
    {
      role: "user",
      content: userText,
    },
  ];

  try {
    const raw = await callChatCompletion(config, messages, {
      jsonMode: true,
      maxTokens: 1200,
      timeoutMs: 30000,
    });
    const parsed = parseAgentJson(raw, unit, completedGoalIds);
    return {
      response: parsed,
      usedFallback: false,
    };
  } catch (err) {
    return {
      response: runFallbackRoleplayTurn(unit, userText, completedGoalIds, childNickname),
      usedFallback: true,
      fallbackReason: err instanceof LlmProviderError ? err.code : "invalid_response",
    };
  }
}

export async function runFreeTalkTurn(params: {
  config: LlmConfig;
  childNickname: string;
  companionName: string;
  history: Array<{ role: "assistant" | "user"; englishText: string }>;
  userText: string;
}): Promise<AgentTurnResult> {
  const { config, childNickname, companionName, history, userText } = params;

  if (!isLlmConfigured(config)) {
    return {
      response: runFallbackFreeTalkTurn(userText, history),
      usedFallback: true,
      fallbackReason: "not_configured",
    };
  }

  const systemPrompt = `你是可爱的小恐龙英语伙伴「${companionName}」，正在陪 7 岁小学二年级零基础小朋友「${childNickname}」自由聊天学英语。
规则：
1. 孩子可能会用中文问“XX用英语怎么说”，或者说简单的英文单词/短句。
2. 你的 englishReply 要超级简单（3~12 个英文词），chineseHint 用温暖童趣的中文解释清楚并给出跟读鼓励。
3. 严禁出现不适龄或负面内容。
4. 所有字段只输出纯文本，严禁在 englishReply、chineseHint、praise 或 nextSuggestions 中使用 Markdown 语法（如 **加粗**、*斜体*、反引号等），以免语音播报读出星号。
5. 严格只返回 JSON 对象：
{
  "englishReply": "简短英文回应",
  "chineseHint": "温柔中文解释或趣味互动",
  "emotion": "happy | excited | talking | thinking | cheering",
  "praise": "简短鼓励语",
  "completedGoalIds": [],
  "nextSuggestions": [
    {"en": "下一句孩子可以跟读的话", "zh": "中文意思", "icon": "1个emoji"}
  ],
  "masteredWords": ["涉及的简单英文单词"],
  "isSceneComplete": false
}`;

  const messages: ChatMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-8).map((m) => ({
      role: m.role,
      content: m.englishText,
    })),
    { role: "user", content: userText },
  ];

  try {
    const raw = await callChatCompletion(config, messages, {
      jsonMode: true,
      maxTokens: 1000,
      timeoutMs: 30000,
    });
    const parsed = parseAgentJson(raw, null, []);
    return {
      response: parsed,
      usedFallback: false,
    };
  } catch (err) {
    return {
      response: runFallbackFreeTalkTurn(userText, history),
      usedFallback: true,
      fallbackReason: err instanceof LlmProviderError ? err.code : "invalid_response",
    };
  }
}
