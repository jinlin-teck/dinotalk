import { describe, expect, it } from "vitest";
import { sanitizeTextForTts, stripMarkdownFormatting } from "./text-sanitizer";

describe("TTS & chat text sanitizer", () => {
  it("strips Markdown bold, italic, code, links, and bullets while keeping words intact", () => {
    expect(stripMarkdownFormatting("It is a **monkey**!")).toBe("It is a monkey!");
    expect(stripMarkdownFormatting("“猴子”用英语说是 **monkey**！")).toBe(
      "“猴子”用英语说是 monkey！"
    );
    expect(stripMarkdownFormatting("Try saying ***happy***, *blue*, `apple`, and __panda__.")).toBe(
      "Try saying happy, blue, apple, and panda."
    );
    expect(stripMarkdownFormatting("- [monkey](https://example.com) ~~cat~~")).toBe("monkey cat");
    expect(stripMarkdownFormatting("### Hello, Dino!")).toBe("Hello, Dino!");
  });

  it("preserves contractions, hyphens, and normal punctuation for speech", () => {
    expect(sanitizeTextForTts("I'm happy! Let's play with a yo-yo, Bye-bye!")).toBe(
      "I'm happy! Let's play with a yo-yo, Bye-bye!"
    );
  });

  it("keeps literal multiplication and identifiers in chat text", () => {
    expect(stripMarkdownFormatting("**算一算** 2 * 3 * 4，或写成 2*3*4。`snake_case`")).toBe(
      "算一算 2 * 3 * 4，或写成 2*3*4。snake_case"
    );
    expect(stripMarkdownFormatting("```snake_case```")).toBe("snake_case");
    expect(sanitizeTextForTts("2 * 3 * 4")).toBe("2 × 3 × 4");
    expect(sanitizeTextForTts("snake_case")).toBe("snake case");
  });

  it("removes parenthesized IPA and stray asterisks before TTS synthesis", () => {
    expect(sanitizeTextForTts("“苹果”用英语说是 **apple**（/ˈæpl/）！")).toBe(
      "“苹果”用英语说是 apple！"
    );
    expect(sanitizeTextForTts("Look! **monkey** *yay* #1")).toBe("Look! monkey yay 1");
  });
});
