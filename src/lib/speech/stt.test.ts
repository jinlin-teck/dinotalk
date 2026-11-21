import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MINIMAX_STT_DEFAULT_MODEL,
  MINIMAX_STT_DEFAULT_URL,
  resolveMiniMaxSttUrl,
  transcribeWithMiniMax,
  transcribeWithOpenAi,
} from "./stt";
import {
  createSilentWavBuffer,
  downsampleToMono16k,
  encodeFloat32ToWavBuffer,
} from "./wav-encoder";

describe("resolveMiniMaxSttUrl", () => {
  it("normalizes empty, host, /v1, and full endpoint URLs", () => {
    expect(resolveMiniMaxSttUrl("")).toBe(MINIMAX_STT_DEFAULT_URL);
    expect(resolveMiniMaxSttUrl("https://api.minimax.cn")).toBe(
      "https://api.minimax.cn/v1/speech_to_text"
    );
    expect(resolveMiniMaxSttUrl("https://api.minimax.cn/v1/")).toBe(
      "https://api.minimax.cn/v1/speech_to_text"
    );
    expect(resolveMiniMaxSttUrl("https://api.minimax.io/v1/speech_to_text")).toBe(
      "https://api.minimax.io/v1/speech_to_text"
    );
  });
});

describe("wav-encoder", () => {
  it("creates a valid 16kHz mono PCM16 RIFF WAV header", () => {
    const buf = createSilentWavBuffer(250, 16000);
    expect(buf.byteLength).toBe(44 + 4000 * 2);

    const view = new DataView(buf);
    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );
    const wave = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11)
    );
    expect(riff).toBe("RIFF");
    expect(wave).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000); // sampleRate
    expect(view.getUint16(34, true)).toBe(16); // bitsPerSample
  });

  it("downsamples stereo 48kHz audio to mono 16kHz and clamps samples", () => {
    const left = new Float32Array(480).fill(0.5);
    const right = new Float32Array(480).fill(-0.1);
    const mono16k = downsampleToMono16k([left, right], 48000, 16000);
    expect(mono16k.length).toBe(160);
    expect(mono16k[0]).toBeCloseTo(0.2, 4);

    const wav = encodeFloat32ToWavBuffer(new Float32Array([-2, 0, 2]), 16000);
    const view = new DataView(wav);
    expect(view.getInt16(44, true)).toBe(-32768);
    expect(view.getInt16(46, true)).toBe(0);
    expect(view.getInt16(48, true)).toBe(32767);
  });
});

describe("transcribeWithMiniMax", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends multipart form data with Bearer auth and language header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "  Hello Dino!  ", duration: 1.2 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const wav = createSilentWavBuffer(200, 16000);
    const text = await transcribeWithMiniMax({
      audioBlob: new Blob([wav], { type: "audio/wav" }),
      filename: "speech.wav",
      baseUrl: "https://api.minimax.cn",
      apiKey: "test-key-123",
      model: "",
    });

    expect(text).toBe("Hello Dino!");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(MINIMAX_STT_DEFAULT_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key-123");
    expect((init.headers as Record<string, string>).language).toBe("en");
    const body = init.body as FormData;
    expect(body.get("model")).toBe(MINIMAX_STT_DEFAULT_MODEL);
    expect(body.get("response_format")).toBe("json");
    expect(body.get("file")).toBeInstanceOf(Blob);
  });

  it("throws descriptive error on MiniMax base_resp failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ base_resp: { status_code: 1004, status_msg: "invalid api key" } }),
          { status: 200 }
        )
      )
    );

    const wav = createSilentWavBuffer(100, 16000);
    await expect(
      transcribeWithMiniMax({
        audioBlob: new Blob([wav], { type: "audio/wav" }),
        filename: "speech.wav",
        baseUrl: "",
        apiKey: "bad-key",
        model: "asr-1.0",
      })
    ).rejects.toThrow(/^MiniMax STT 错误 \(1004\)$/);
  });

  it("keeps OpenAI Whisper transcription working as before", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "apple" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const wav = createSilentWavBuffer(100, 16000);
    const text = await transcribeWithOpenAi({
      audioBlob: new Blob([wav], { type: "audio/wav" }),
      filename: "speech.wav",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "whisper-1",
      hints: "apple, banana",
    });

    expect(text).toBe("apple");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    const body = init.body as FormData;
    expect(body.get("model")).toBe("whisper-1");
    expect(body.get("language")).toBe("en");
    expect(String(body.get("prompt"))).toContain("apple, banana");
  });
});
