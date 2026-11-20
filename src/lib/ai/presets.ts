export interface LlmPreset {
  id: string;
  labelZh: string;
  baseUrl: string;
  defaultModel: string;
  needsKey: boolean;
  hintZh: string;
}

export const LLM_PRESETS: LlmPreset[] = [
  {
    id: "deepseek",
    labelZh: "DeepSeek（深度求索）",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    needsKey: true,
    hintZh: "性价比高、中文与简单英语对话流畅，推荐填写 deepseek-chat",
  },
  {
    id: "qwen",
    labelZh: "通义千问（阿里云百炼）",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    needsKey: true,
    hintZh: "阿里云百炼 OpenAI 兼容接口，可选 qwen-plus / qwen-turbo",
  },
  {
    id: "openai",
    labelZh: "OpenAI 官方 / 兼容代理",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    needsKey: true,
    hintZh: "推荐使用 gpt-4o-mini，响应迅速",
  },
  {
    id: "gemini",
    labelZh: "Google Gemini（OpenAI兼容端）",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    needsKey: true,
    hintZh: "使用 Google AI Studio Key 访问 Gemini OpenAI 兼容地址",
  },
  {
    id: "doubao",
    labelZh: "火山引擎豆包（Ark）",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-seed-1-6-flash-250615",
    needsKey: true,
    hintZh: "Model 请填入你在火山方舟控制台创建的推理接入点 ID 或模型名称",
  },
  {
    id: "ollama",
    labelZh: "本地 Ollama（零费用离线）",
    baseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "qwen2.5:7b",
    needsKey: false,
    hintZh: "无需 API Key，确保本机已启动 Ollama 服务并拉取模型",
  },
  {
    id: "custom",
    labelZh: "自定义 OpenAI 兼容接口",
    baseUrl: "",
    defaultModel: "",
    needsKey: true,
    hintZh: "填入任意兼容 /v1/chat/completions 协议的服务地址与模型名",
  },
];

export const EN_VOICE_OPTIONS = [
  { id: "en-US-AnaNeural", labelZh: "Ana（美式可爱童声 · 推荐）" },
  { id: "en-US-AriaNeural", labelZh: "Aria（美式温柔女声）" },
  { id: "en-US-GuyNeural", labelZh: "Guy（美式阳光男声）" },
  { id: "en-GB-MaisieNeural", labelZh: "Maisie（英式可爱童声）" },
];

export const ZH_VOICE_OPTIONS = [
  { id: "zh-CN-XiaoxiaoNeural", labelZh: "晓晓（温柔姐姐 · 推荐）" },
  { id: "zh-CN-XiaoyiNeural", labelZh: "晓伊（活泼童声）" },
  { id: "zh-CN-YunxiNeural", labelZh: "云希（阳光哥哥）" },
];
