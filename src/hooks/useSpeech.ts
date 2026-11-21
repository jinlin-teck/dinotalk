"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downsampleToMono16k, encodeFloat32ToWavBuffer } from "@/lib/speech/wav-encoder";
import type { SttEngine } from "@/lib/speech/constants";

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
  abort: () => void;
}

export function useSpeech() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const speakAbortRef = useRef<AbortController | null>(null);
  const speakSeqRef = useRef(0);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sttAbortRef = useRef<AbortController | null>(null);
  const listenSeqRef = useRef(0);
  const sttModeRef = useRef<SttEngine>("browser");

  const revokeCurrentAudioUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    speakSeqRef.current += 1;
    if (speakAbortRef.current) {
      speakAbortRef.current.abort();
      speakAbortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    revokeCurrentAudioUrl();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (mountedRef.current) {
      setIsSpeaking(false);
    }
  }, [revokeCurrentAudioUrl]);

  const cancelListening = useCallback(() => {
    listenSeqRef.current += 1;
    sttAbortRef.current?.abort();
    sttAbortRef.current = null;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (recorderRef.current) {
      recorderRef.current.onstop = null;
      if (recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      recorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    const recognizer = recognitionRef.current;
    const recorder = recorderRef.current;

    try {
      if (recognizer) {
        recognizer.stop();
      } else if (recorder?.state === "recording") {
        recorder.stop();
      } else if (!recorder) {
        // Permission may still be pending, with no recording to finish.
        cancelListening();
      }
    } catch {
      cancelListening();
    }
    if (mountedRef.current) {
      setIsListening(false);
    }
  }, [cancelListening]);

  const refreshSttMode = useCallback(() => {
    fetch("/api/speech/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mountedRef.current) return;
        const mode = data?.sttMode;
        if (mode === "minimax" || mode === "openai" || mode === "browser") {
          sttModeRef.current = mode;
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refreshSttMode();

    // 家长在另一个标签页改完语音配置后，孩子切回本页即可生效。
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshSttMode();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopSpeaking();
      cancelListening();
    };
  }, [cancelListening, refreshSttMode, stopSpeaking]);

  const speakWithBrowser = useCallback((text: string, lang: "en" | "zh", slow: boolean) => {
    if (!mountedRef.current || typeof window === "undefined" || !("speechSynthesis" in window)) {
      if (mountedRef.current) setIsSpeaking(false);
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang === "zh" ? "zh-CN" : "en-US";
      utter.rate = slow ? 0.7 : 0.92;
      utter.pitch = 1.08;
      utter.onend = () => {
        if (mountedRef.current) setIsSpeaking(false);
      };
      utter.onerror = () => {
        if (mountedRef.current) setIsSpeaking(false);
      };
      window.speechSynthesis.speak(utter);
    } catch {
      if (mountedRef.current) setIsSpeaking(false);
    }
  }, []);

  const speak = useCallback(
    async (text: string, options: SpeakOptions = {}) => {
      const clean = text.trim();
      if (!clean) return;
      const lang = options.lang ?? "en";
      const slow = Boolean(options.slow);

      stopSpeaking();
      const seq = ++speakSeqRef.current;
      const controller = new AbortController();
      speakAbortRef.current = controller;
      if (mountedRef.current) setIsSpeaking(true);

      try {
        const res = await fetch("/api/speech/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: clean,
            lang,
            speed: slow ? 0.68 : undefined,
          }),
          signal: controller.signal,
        });

        if (!mountedRef.current || seq !== speakSeqRef.current) return;

        const contentType = res.headers.get("content-type") || "";
        if (res.ok && contentType.includes("audio")) {
          const blob = await res.blob();
          if (!mountedRef.current || seq !== speakSeqRef.current) return;

          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioUrlRef.current = url;
          audioRef.current = audio;
          audio.onended = () => {
            if (audioUrlRef.current === url) revokeCurrentAudioUrl();
            if (audioRef.current === audio) audioRef.current = null;
            if (mountedRef.current && seq === speakSeqRef.current) setIsSpeaking(false);
          };
          audio.onerror = () => {
            if (audioUrlRef.current === url) revokeCurrentAudioUrl();
            if (audioRef.current === audio) audioRef.current = null;
            if (mountedRef.current && seq === speakSeqRef.current) {
              speakWithBrowser(clean, lang, slow);
            }
          };
          await audio.play().catch(() => {
            if (audioUrlRef.current === url) revokeCurrentAudioUrl();
            if (audioRef.current === audio) audioRef.current = null;
            if (mountedRef.current && seq === speakSeqRef.current) {
              speakWithBrowser(clean, lang, slow);
            }
          });
          return;
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        // Silent downgrade to browser speech synthesis
      } finally {
        if (speakAbortRef.current === controller) {
          speakAbortRef.current = null;
        }
      }

      if (!mountedRef.current || seq !== speakSeqRef.current) return;
      speakWithBrowser(clean, lang, slow);
    },
    [revokeCurrentAudioUrl, speakWithBrowser, stopSpeaking]
  );

  const startBrowserRecognition = useCallback(
    (seq: number, onTranscript: (text: string) => void) => {
      if (!mountedRef.current || seq !== listenSeqRef.current) return;

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
          if (!mountedRef.current || seq !== listenSeqRef.current) return;
          setIsListening(false);
          if (ev?.error === "not-allowed") {
            setSttError("麦克风权限未打开，请在浏览器允许使用麦克风，或直接点下方卡片练习~");
          } else if (ev?.error !== "aborted") {
            setSttError("没太听清楚呢，再靠近麦克风试一次，或点击下方提示气泡~");
          }
        };
        rec.onend = () => {
          if (recognitionRef.current === rec) recognitionRef.current = null;
          if (!mountedRef.current || seq !== listenSeqRef.current) return;
          setIsListening(false);
          if (captured) {
            onTranscript(captured);
          }
        };
        recognitionRef.current = rec;
        rec.start();
      } catch {
        recognitionRef.current = null;
        if (mountedRef.current && seq === listenSeqRef.current) {
          setIsListening(false);
          setSttError("启动麦克风失败，可以直接点击提示气泡完成开口练习哦~");
        }
      }
    },
    []
  );

  const startListening = useCallback(
    async (hints: string, onTranscript: (text: string) => void) => {
      if (typeof window === "undefined") return;
      stopSpeaking();
      cancelListening();

      const seq = ++listenSeqRef.current;
      setSttError(null);
      setIsListening(true);

      const useCloudStt = sttModeRef.current === "openai" || sttModeRef.current === "minimax";
      if (useCloudStt && typeof MediaRecorder !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        let pendingStream: MediaStream | undefined;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (!mountedRef.current || seq !== listenSeqRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }

          streamRef.current = stream;
          pendingStream = stream;
          const chunks: BlobPart[] = [];
          const preferredMimes = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/mp4",
            "audio/ogg;codecs=opus",
          ];
          const mimeType =
            preferredMimes.find((m) => MediaRecorder.isTypeSupported(m)) || "";
          const recorder = mimeType
            ? new MediaRecorder(stream, { mimeType })
            : new MediaRecorder(stream);
          recorderRef.current = recorder;

          recorder.ondataavailable = (ev) => {
            if (ev.data.size > 0) chunks.push(ev.data);
          };

          recorder.onstop = async () => {
            const isCurrent = () => mountedRef.current && seq === listenSeqRef.current;
            stream.getTracks().forEach((t) => t.stop());
            if (streamRef.current === stream) streamRef.current = null;
            if (recorderRef.current === recorder) recorderRef.current = null;
            if (!isCurrent()) return;
            setIsListening(false);

            const recordedMime = recorder.mimeType || mimeType || "audio/webm";
            const rawBlob = new Blob(chunks, { type: recordedMime });
            if (rawBlob.size < 100) {
              setSttError("录音时间太短啦，按住多说一秒试试吧~");
              return;
            }
            const controller = new AbortController();
            sttAbortRef.current = controller;
            try {
              const prepared = await convertBlobToWav(rawBlob);
              if (!isCurrent()) return;
              const form = new FormData();
              form.append("audio", prepared.blob, prepared.filename);
              form.append("hints", hints);
              const res = await fetch("/api/speech/stt", {
                method: "POST",
                body: form,
                signal: controller.signal,
              });
              const data = await res.json();
              if (!isCurrent()) return;
              if (data?.ok && data?.text) {
                onTranscript(data.text);
              } else {
                setSttError(data?.error || "语音识别没听清，点提示气泡也能直接练习哦~");
              }
            } catch {
              if (isCurrent()) {
                setSttError("语音识别网络开小差了，可以直接点下方提示卡片继续哦~");
              }
            } finally {
              if (sttAbortRef.current === controller) sttAbortRef.current = null;
            }
          };

          recorder.start();
          return;
        } catch {
          if (pendingStream && streamRef.current === pendingStream) {
            pendingStream.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            recorderRef.current = null;
          }
          if (!mountedRef.current || seq !== listenSeqRef.current) return;
          // Fall back to browser SpeechRecognition if MediaRecorder fails
        }
      }

      startBrowserRecognition(seq, onTranscript);
    },
    [cancelListening, startBrowserRecognition, stopSpeaking]
  );

  const clearSttError = useCallback(() => setSttError(null), []);

  return {
    isSpeaking,
    isListening,
    sttError,
    clearSttError,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
  };
}
