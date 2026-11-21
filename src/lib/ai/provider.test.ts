import { afterEach, describe, expect, it, vi } from "vitest";
import {
  callChatCompletion,
  extractChatCompletionContent,
  LlmProviderError,
  stripReasoningTags,
  type LlmConfig,
} from "./provider";

const TEST_CFG: LlmConfig = {
  provider: "custom",
  baseUrl: "https://relay.example.com/v1",
  apiKey: "sk-test-123456",
  model: "MiniMax-M3.1-Flash",
  temperature: 0.6,
};

describe("LLM provider compatibility and error diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("retries automatically with higher max_tokens when reasoning consumes the initial limit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "length",
                message: {
                  content: "",
                  reasoning_content: "Let me think step by step...",
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: "Hello little explorer!",
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await callChatCompletion(
      TEST_CFG,
      [{ role: "user", content: "Say hi" }],
      { maxTokens: 40, jsonMode: false }
    );

    expect(result).toBe("Hello little explorer!");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(
      (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string
    );
    expect(secondBody.max_tokens).toBeGreaterThanOrEqual(1536);
  });

  it("extracts text blocks from array-based message.content while ignoring thinking blocks", () => {
    const extracted = extractChatCompletionContent({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: [
              { type: "thinking", thinking: "Internal reasoning" },
              { type: "text", text: "Hello!" },
              { type: "text", text: "Nice to meet you!" },
            ],
          },
        },
      ],
    });

    expect(extracted.content).toBe("Hello!\nNice to meet you!");
    expect(extracted.upstreamError).toBeNull();
  });

  it("classifies HTTP 200 error envelopes without returning upstream diagnostics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            base_resp: { status_code: 1004, status_msg: `Invalid key: ${TEST_CFG.apiKey}` },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await expect(
      callChatCompletion(TEST_CFG, [{ role: "user", content: "Hi" }])
    ).rejects.toThrow(/^模型服务返回错误，请检查模型和接口配置$/);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: "model MiniMax-M3.1-Flash not found" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    await expect(
      callChatCompletion(TEST_CFG, [{ role: "user", content: "Hi" }])
    ).rejects.toThrow(LlmProviderError);
  });

  it("strips both <think> and <thought> blocks cleanly", () => {
    expect(
      stripReasoningTags("<think>abc</think>\n<thought>xyz</thought>\nHello Dino!")
    ).toBe("Hello Dino!");
  });
});
