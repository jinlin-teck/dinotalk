/**
 * Strips Markdown formatting while preserving readable plain text.
 * Prevents LLMs' Markdown emphasis (e.g. **monkey**, *happy*, `apple`)
 * from showing raw symbols in kid-facing chat bubbles or being spoken aloud by TTS.
 */
export function stripMarkdownFormatting(input: string): string {
  if (!input) return "";

  const text = input
    // Replace fenced code blocks with their inner text
    .replace(/```(?:[a-zA-Z0-9_-]*\n)?([\s\S]*?)```/g, "$1")
    // Markdown images ![alt](url) -> alt
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Markdown links [label](url) -> label
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Inline code `word` -> word
    .replace(/`+([^`\n]+?)`+/g, "$1")
    // Bold + italic ***word*** or ___word___
    .replace(/\*\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*\*/g, "$1")
    .replace(/___([^_\n]+?)___/g, "$1")
    // Bold **word** or __word__
    .replace(/\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*/g, "$1")
    .replace(/__([^_\n]+?)__/g, "$1")
    // Strikethrough ~~word~~
    .replace(/~~([^~\n]+?)~~/g, "$1")
    // Italic *word*
    .replace(/(?<![A-Za-z0-9*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![A-Za-z0-9*])/g, "$1")
    // Italic _word_ bounded by start/whitespace/punctuation
    .replace(/(^|[\s(（“"'「【])_([^_\n]+?)_(?=$|[\s)）,.!?;:，。！？；：”"'」】])/g, "$1$2")
    // Line-leading headings (# ), blockquotes (> ), and bullet markers (- / * / + )
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "");

  return text.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Sanitizes text specifically for TTS speech synthesis (Edge-TTS, OpenAI TTS, Web Speech).
 * Strips Markdown symbols, parenthesized IPA transcriptions, and unreadable markup tokens.
 */
export function sanitizeTextForTts(input: string): string {
  if (!input) return "";

  let text = stripMarkdownFormatting(input);

  // Remove parenthesized IPA phonetic guides like （/ˈæpl/） or (/ˈmʌŋki/) so TTS doesn't read slashes
  text = text.replace(/[（(]\s*\/[^/（）()]+\/\s*[）)]/g, "");

  // Replace remaining markup-like symbols that TTS engines pronounce awkwardly
  text = text
    .replace(/(\d)\s*\*\s*(?=\d)/g, "$1 × ")
    .replace(/[*`~#_|<>[\]{}\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}
