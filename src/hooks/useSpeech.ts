"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downsampleToMono16k, encodeFloat32ToWavBuffer } from "@/lib/speech/wav-encoder";

function getAudioFilenameForMime(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("wav")) return "speech.wav";
  if (lower.includes("mp4") || lower.includes("m4a") || lower.includes("aac")) return "speech.m4a";
  if (lower.includes("ogg")) return "speech.ogg";
  if (lower.includes("mpeg") || lower.includes("mp3")) return "speech.mp3";
  return "speech.webm";
}

async function convertBlobToWav(blob: Blob): Promise<{ blob: Blob; filename: string }> {
  const win = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioCtx = win.AudioContext || win.webkitAudioContext;
  if (!AudioCtx) {
    return { blob, filename: getAudioFilenameForMime(blob.type) };
  }

  const ctx = new AudioCtx();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channels: Float32Array[] = [];
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
      channels.push(audioBuffer.getChannelData(c));
    }
    const mono16k = downsampleToMono16k(channels, audioBuffer.sampleRate, 16000);
    const wavBuffer = encodeFloat32ToWavBuffer(mono16k, 16000);
    return {
      blob: new Blob([wavBuffer], { type: "audio/wav" }),
      filename: "speech.wav",
    };
  } catch {
    return { blob, filename: getAudioFilenameForMime(blob.type) };
  } finally {
    ctx.close().catch(() => undefined);
  }
}

interface SpeakOptions {
  lang?: "en" | "zh";
  slow?: boolean;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sttModeRef = useRef<"browser" | "openai" | "minimax">("browser");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const s = data?.settings;
        if (s?.sttEngine === "minimax" && s?.hasSttApiKey) {
          sttModeRef.current = "minimax";
        } else if (s?.sttEngine === "openai" && s?.sttApiBaseUrl) {
          sttModeRef.current = "openai";
        } else {
          sttModeRef.current = "browser";
        }
      })
      .catch(() => undefined);

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const speakWithBrowser = useCallback((text: string, lang: "en" | "zh", slow: boolean) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setIsSpeaking(false);
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang === "zh" ? "zh-CN" : "en-US";
      utter.rate = slow ? 0.7 : 0.92;
      utter.pitch = 1.08;
      utter.onend = () => setIsSpeaking(false);
      utter.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utter);
    } catch {
      setIsSpeaking(false);
    }
  }, []);

  const speak = useCallback(
    async (text: string, options: SpeakOptions = {}) => {
      const clean = text.trim();
      if (!clean) return;
      const lang = options.lang ?? "en";
      const slow = Boolean(options.slow);

      stopSpeaking();
      setIsSpeaking(true);

      try {
        const res = await fetch("/api/speech/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: clean,
            lang,
            speed: slow ? 0.68 : undefined,
          }),
        });

        const contentType = res.headers.get("content-type") || "";
        if (res.ok && contentType.includes("audio")) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            URL.revokeObjectURL(url);
            setIsSpeaking(false);
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            speakWithBrowser(clean, lang, slow);
          };
          await audio.play().catch(() => {
            URL.revokeObjectURL(url);
            speakWithBrowser(clean, lang, slow);
          });
          return;
        }
      } catch {
        // Silent downgrade to browser speech synthesis
      }

      speakWithBrowser(clean, lang, slow);
    },
    [speakWithBrowser, stopSpeaking]
  );

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  }, []);

  const startBrowserRecognition = useCallback(
    (onTranscript: (text: string) => void) => {
      const win = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      };
      const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (!SpeechRec) {
        setIsListening(false);
        setSttError("当前浏览器暂不支持麦克风语音识别，可以直接点击下方提示气泡练习哦~");
        return;
      }

      try {
        const rec = new SpeechRec();
        rec.lang = "en-US";
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        rec.continuous = false;

        let captured = "";
        rec.onresult = (ev) => {
          const first = ev.results?.[0]?.[0]?.transcript;
          if (first) {
            captured = first.trim();
          }
        };
        rec.onerror = (ev) => {
          setIsListening(false);
          if (ev?.error === "not-allowed") {
            setSttError("麦克风权限未打开，请在浏览器允许使用麦克风，或直接点下方卡片练习~");
          } else if (ev?.error !== "aborted") {
            setSttError("没太听清楚呢，再靠近麦克风试一次，或点击下方提示气泡~");
          }
        };
        rec.onend = () => {
          setIsListening(false);
          recognitionRef.current = null;
          if (captured) {
            onTranscript(captured);
          }
        };
        recognitionRef.current = rec;
        rec.start();
      } catch {
        setIsListening(false);
        setSttError("启动麦克风失败，可以直接点击提示气泡完成开口练习哦~");
      }
    },
    []
  );

  const startListening = useCallback(
    async (hints: string, onTranscript: (text: string) => void) => {
      if (typeof window === "undefined") return;
      setSttError(null);
      stopSpeaking();
      setIsListening(true);

      const useCloudStt = sttModeRef.current === "openai" || sttModeRef.current === "minimax";
      if (useCloudStt && typeof MediaRecorder !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;
          const chunks: BlobPart[] = [];
          const preferredMimes = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/mp4",
            "audio/ogg;codecs=opus",
          ];
          const mimeType =
            preferredMimes.find((m) => MediaRecorder.isTypeSupported(m)) || "";
          const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          recorderRef.current = recorder;

          recorder.ondataavailable = (ev) => {
            if (ev.data.size > 0) chunks.push(ev.data);
          };

          recorder.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            recorderRef.current = null;
            setIsListening(false);

            const recordedMime = recorder.mimeType || mimeType || "audio/webm";
            const rawBlob = new Blob(chunks, { type: recordedMime });
            if (rawBlob.size < 100) {
              setSttError("录音时间太短啦，按住多说一秒试试吧~");
              return;
            }
            const prepared = await convertBlobToWav(rawBlob);
            const form = new FormData();
            form.append("audio", prepared.blob, prepared.filename);
            form.append("hints", hints);

            try {
              const res = await fetch("/api/speech/stt", { method: "POST", body: form });
              const data = await res.json();
              if (data?.ok && data?.text) {
                onTranscript(data.text);
              } else {
                setSttError(data?.error || "语音识别没听清，点提示气泡也能直接练习哦~");
              }
            } catch {
              setSttError("语音识别网络开小差了，可以直接点下方提示卡片继续哦~");
            }
          };

          recorder.start();
          return;
        } catch {
          // Fall back to browser SpeechRecognition if MediaRecorder fails
        }
      }

      startBrowserRecognition(onTranscript);
    },
    [startBrowserRecognition, stopSpeaking]
  );

  return {
    isSpeaking,
    isListening,
    sttError,
    clearSttError: () => setSttError(null),
    speak,
    stopSpeaking,
    startListening,
    stopListening,
  };
}
