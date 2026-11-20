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

export function isLlmConfigured(config: LlmConfig): boolean {
  const base = normalizeBaseUrl(config.baseUrl);
  const model = config.model.trim();
  if (!base || !model) return false;
  if (config.provider === "ollama" || base.includes("127.0.0.1") || base.includes("localhost")) {
    return true;
  }
  return Boolean(config.apiKey.trim());
}

export async function callChatCompletion(
  config: LlmConfig,
  messages: ChatMessageParam[],
  options: { timeoutMs?: number; maxTokens?: number; jsonMode?: boolean } = {}
): Promise<string> {
  if (!isLlmConfigured(config)) {
    throw new LlmProviderError("not_configured", "尚未配置大模型 API Key 或服务地址");
  }

  const base = normalizeBaseUrl(config.baseUrl);
  const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 25000);

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

    const res = await fetch(url, {
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
      if (options.jsonMode && res.status === 400 && errText.toLowerCase().includes("response_format")) {
        return callChatCompletion(config, messages, { ...options, jsonMode: false });
      }
      throw new LlmProviderError(
        "model_error",
        `模型服务返回错误 HTTP ${res.status}${errText ? `: ${errText.slice(0, 140)}` : ""}`,
        res.status
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new LlmProviderError("model_error", "模型未返回有效文本内容");
    }
    return content;
  } catch (err) {
    if (err instanceof LlmProviderError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new LlmProviderError("network", "连接大模型超时，请检查网络或服务地址");
    }
    throw new LlmProviderError(
      "network",
      `网络请求失败：${err instanceof Error ? err.message : "未知错误"}`
    );
  } finally {
    clearTimeout(timeout);
  }
}
