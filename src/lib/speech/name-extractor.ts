const PUNCT_EDGE_RE = /^[。，！？、,.!?;；:"'“”‘’()（）[\]【】~～\s]+|[。，！？、,.!?;；:"'“”‘’()（）[\]【】~～\s]+$/g;

const INTRO_PREFIXES = [
  "我的名字叫",
  "我的名字是",
  "你好我叫",
  "你好我是",
  "嗨我叫",
  "嗨我是",
  "我叫",
  "我是",
  "叫我",
  "hello my name is",
  "hi my name is",
  "my name is",
  "i am",
  "i'm",
];

function stripEdgePunct(text: string): string {
  return text.replace(PUNCT_EDGE_RE, "").trim();
}

export function extractChildNameFromSpeech(raw: string): string {
  let cleaned = stripEdgePunct(raw).replace(/\s+/g, " ");
  if (!cleaned) return "";

  const lower = cleaned.toLowerCase();
  for (const prefix of INTRO_PREFIXES) {
    if (lower.startsWith(prefix)) {
      const rest = stripEdgePunct(cleaned.slice(prefix.length));
      if (rest) {
        cleaned = rest;
        break;
      }
    }
  }

  return cleaned.replace(/\s+/g, " ").trim().slice(0, 20);
}
