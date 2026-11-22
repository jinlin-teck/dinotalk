import { describe, expect, it } from "vitest";
import { extractChildNameFromSpeech } from "./name-extractor";

describe("extractChildNameFromSpeech", () => {
  it("strips punctuation and Chinese self-introduction prefixes", () => {
    expect(extractChildNameFromSpeech("苗苗。")).toBe("苗苗");
    expect(extractChildNameFromSpeech("我叫苗苗！")).toBe("苗苗");
    expect(extractChildNameFromSpeech("我是小乐乐")).toBe("小乐乐");
    expect(extractChildNameFromSpeech("我的名字叫豆豆，")).toBe("豆豆");
    expect(extractChildNameFromSpeech("你好我是朵朵")).toBe("朵朵");
  });

  it("strips English self-introduction prefixes case-insensitively", () => {
    expect(extractChildNameFromSpeech("My name is Mia.")).toBe("Mia");
    expect(extractChildNameFromSpeech("I'm Leo!")).toBe("Leo");
    expect(extractChildNameFromSpeech("hello my name is Tony")).toBe("Tony");
  });

  it("keeps short prefixes intact when nothing remains after them and enforces max length", () => {
    expect(extractChildNameFromSpeech("我叫")).toBe("我叫");
    expect(extractChildNameFromSpeech("   ")).toBe("");
    expect(extractChildNameFromSpeech("abcdefghijklmnopqrstuvwxyz12345").length).toBe(20);
  });
});
