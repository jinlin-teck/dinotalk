import { fetchProviderEndpoint } from "@/lib/security/provider-fetch";

export interface LlmConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
}

export interface ChatMessageParam {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ProviderErrorCode =
  | "not_configured"
  | "invalid_key"
  | "quota"
  | "network"
  | "model_error";

export class LlmProviderError extends Error {
  code: ProviderErrorCode;
  status?: number;

  constructor(code: ProviderErrorCode, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function maskSecret(secret: string | null | undefined): string {
  const val = (secret ?? "").trim();
  if (!val) return "";
  if (val.length <= 8) return "****";
  return `${val.slice(0, 4)}****${val.slice(-4)}`;
}

export function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, "");
}

function isLocalBaseUrl(base: string): boolean {
  try {
    const host = new URL(base).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]"
    );
  } catch {
    return false;
  }
}

export function isLlmConfigured(config: LlmConfig): boolean {
  const base = normalizeBaseUrl(config.baseUrl);
  const model = config.model.trim();
  if (!base || !model) return false;
  if (config.provider === "ollama" || isLocalBaseUrl(base)) {
    return true;
  }
  return Boolean(config.apiKey.trim());
}

export function stripReasoningTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .trim();
}

export interface ExtractedChatContent {
  content: string | null;
  upstreamError: string | null;
  finishReason: string | null;
  hasReasoningOnly: boolean;
}

export function extractChatCompletionContent(data: unknown): ExtractedChatContent {
  const obj =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;

  if (obj) {
    // Handle HTTP 200 error envelopes returned by some OpenAI relays / MiniMax gateways
    const errObj = obj.error;
    if (typeof errObj === "string" && errObj.trim()) {
      return {
        content: null,
        upstreamError: errObj.trim(),
        finishReason: null,
        hasReasoningOnly: false,
      };
    }
    if (errObj && typeof errObj === "object") {
      const msg = (errObj as Record<string, unknown>).message;
      if (typeof msg === "string" && msg.trim()) {
        return {
          content: null,
          upstreamError: msg.trim(),
          finishReason: null,
          hasReasoningOnly: false,
        };
      }
    }

    const baseResp = obj.base_resp;
    if (baseResp && typeof baseResp === "object") {
      const br = baseResp as Record<string, unknown>;
      if (typeof br.status_code === "number" && br.status_code !== 0) {
        const statusMsg =
          typeof br.status_msg === "string" && br.status_msg.trim()
            ? br.status_msg.trim()
            : `status_code=${br.status_code}`;
        return {
          content: null,
          upstreamError: statusMsg,
          finishReason: null,
          hasReasoningOnly: false,
        };
      }
    }
  }

  const choices = Array.isArray(obj?.choices) ? obj.choices : [];
  const firstChoice =
    choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>)
      : null;
  const finishReason =
    typeof firstChoice?.finish_reason === "string" ? firstChoice.finish_reason : null;

  const msg =
    firstChoice?.message && typeof firstChoice.message === "object"
      ? (firstChoice.message as Record<string, unknown>)
      : null;

  let content: string | null = null;
  let sawThinkingPart = false;

  if (msg) {
    if (typeof msg.content === "string") {
      if (msg.content.trim()) {
        content = msg.content;
      }
    } else if (Array.isArray(msg.content)) {
      const textParts: string[] = [];
      for (const part of msg.content) {
        if (typeof part === "string") {
          if (part.trim()) textParts.push(part);
          continue;
        }
        if (part && typeof part === "object") {
          const p = part as Record<string, unknown>;
          const pType = typeof p.type === "string" ? p.type.toLowerCase() : "";
          if (pType === "thinking" || pType === "reasoning") {
            sawThinkingPart = true;
            continue;
          }
          if (typeof p.text === "string" && p.text.trim()) {
            textParts.push(p.text);
          } else if (typeof p.content === "string" && p.content.trim()) {
            textParts.push(p.content);
          }
        }
      }
      if (textParts.length > 0) {
        content = textParts.join("\n").trim();
      }
    }
  }

  // Fallback for legacy completions (`choices[0].text`) or Responses-like (`output_text`)
  if (!content && typeof firstChoice?.text === "string" && firstChoice.text.trim()) {
    content = firstChoice.text;
  }
  if (!content && typeof obj?.output_text === "string" && obj.output_text.trim()) {
    content = obj.output_text;
  }

  const reasoningText =
    typeof msg?.reasoning_content === "string"
      ? msg.reasoning_content.trim()
      : typeof msg?.reasoning === "string"
      ? msg.reasoning.trim()
      : "";
  const hasReasoningOnly = !content && (Boolean(reasoningText) || sawThinkingPart);

  return {
    content,
    upstreamError: null,
    finishReason,
    hasReasoningOnly,
  };
}

export interface CallChatOptions {
  timeoutMs?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  _retriedMaxTokens?: boolean;
  _retriedNoJson?: boolean;
}

export async function callChatCompletion(
  config: LlmConfig,
  messages: ChatMessageParam[],
  options: CallChatOptions = {}
): Promise<string> {
  if (!isLlmConfigured(config)) {
    throw new LlmProviderError("not_configured", "尚未配置大模型 API Key 或服务地址");
  }

  const base = normalizeBaseUrl(config.baseUrl);
  const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 25000);

  let retryCall: CallChatOptions | null = null;

  try {
    const body: Record<string, unknown> = {
      model: config.model.trim(),
      messages,
      temperature: Number.isFinite(config.temperature) ? config.temperature : 0.6,
      max_tokens: options.maxTokens ?? 450,
    };

    if (options.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey.trim()) {
      headers.Authorization = `Bearer ${config.apiKey.trim()}`;
    }

    const res = await fetchProviderEndpoint(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        throw new LlmProviderError("invalid_key", `API Key 无效或未授权 (HTTP ${res.status})`, res.status);
      }
      if (res.status === 429) {
        throw new LlmProviderError("quota", "请求太频繁或额度不足 (HTTP 429)", res.status);
      }
      // Retry once without response_format if the provider rejects json_object
      if (
        options.jsonMode &&
        !options._retriedNoJson &&
        (res.status === 400 || res.status === 422) &&
        /response_format|json_object/i.test(errText)
      ) {
        retryCall = { ...options, jsonMode: false, _retriedNoJson: true };
      } else {
        throw new LlmProviderError(
          "model_error",
          `模型服务返回错误 (HTTP ${res.status})，请检查模型和接口配置`,
          res.status
        );
      }
    } else {
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throw new LlmProviderError(
          "model_error",
          "模型接口返回了非 JSON 响应，请检查 Base URL 是否正确"
        );
      }

      const extracted = extractChatCompletionContent(data);
      if (extracted.upstreamError) {
        throw new LlmProviderError(
          "model_error",
          "模型服务返回错误，请检查模型和接口配置"
        );
      }

      if (extracted.content) {
        return extracted.content;
      }

      if (
        (extracted.finishReason === "length" || extracted.hasReasoningOnly) &&
        !options._retriedMaxTokens
      ) {
        retryCall = {
          ...options,
          maxTokens: Math.max((options.maxTokens ?? 450) * 3, 1536),
          _retriedMaxTokens: true,
        };
      } else if (options.jsonMode && !options._retriedNoJson) {
        retryCall = {
          ...options,
          jsonMode: false,
          _retriedNoJson: true,
        };
      } else if (extracted.hasReasoningOnly && extracted.finishReason === "length") {
        throw new LlmProviderError(
          "model_error",
          "模型思考过程过长占满了最大输出限制 (finish_reason=length)，未生成最终文本，请尝试更换非思考模型或在网关侧关闭深度思考"
        );
      } else {
        throw new LlmProviderError(
          "model_error",
          "模型未返回有效文本内容，请检查模型和接口配置"
        );
      }
    }
  } catch (err) {
    if (err instanceof LlmProviderError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new LlmProviderError("network", "连接大模型超时，请检查网络或服务地址");
    }
    throw new LlmProviderError("network", "无法连接大模型服务，请检查网络和接口地址");
  } finally {
    clearTimeout(timeout);
  }

  return callChatCompletion(config, messages, retryCall);
}
