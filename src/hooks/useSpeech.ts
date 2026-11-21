"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downsampleToMono16k, encodeFloat32ToWavBuffer } from "@/lib/speech/wav-encoder";
import { sanitizeTextForTts } from "@/lib/speech/text-sanitizer";
import type { SttEngine, VoiceProofPurpose } from "@/lib/speech/constants";

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

export interface SpeakOptions {
  lang?: "en" | "zh";
  slow?: boolean;
}

export interface SpeakSequenceItem extends SpeakOptions {
  text: string;
}

export interface ListenTranscriptMeta {
  voiceProof?: string;
}

export interface ListenOptions {
  lang?: "en" | "zh";
  maxDurationMs?: number;
  voiceProofPurpose?: VoiceProofPurpose;
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
  const [ttsAutoPlayZh, setTtsAutoPlayZh] = useState(true);
  const [listenCountdownSec, setListenCountdownSec] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const speakAbortRef = useRef<AbortController | null>(null);
  const speakSeqRef = useRef(0);
  const speakResolveRef = useRef<(() => void) | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sttAbortRef = useRef<AbortController | null>(null);
  const listenSeqRef = useRef(0);
  const sttModeRef = useRef<SttEngine | null>(null);
  const configRequestRef = useRef<Promise<SttEngine | null> | null>(null);
  const audioMeterRef = useRef<HTMLSpanElement | null>(null);
  const meterCtxRef = useRef<AudioContext | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const maxDurTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  const revokeCurrentAudioUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const cleanupRecordingUi = useCallback(() => {
    if (maxDurTimerRef.current !== null) {
      window.clearTimeout(maxDurTimerRef.current);
      maxDurTimerRef.current = null;
    }
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (meterRafRef.current !== null) {
      window.cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    if (meterCtxRef.current) {
      meterCtxRef.current.close().catch(() => undefined);
      meterCtxRef.current = null;
    }
    audioMeterRef.current?.style.removeProperty("scale");
    if (mountedRef.current) setListenCountdownSec(null);
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
    if (speakResolveRef.current) {
      const done = speakResolveRef.current;
      speakResolveRef.current = null;
      done();
    }
    if (mountedRef.current) {
      setIsSpeaking(false);
    }
  }, [revokeCurrentAudioUrl]);

  const cancelListening = useCallback(() => {
    listenSeqRef.current += 1;
    sttAbortRef.current?.abort();
    sttAbortRef.current = null;
    cleanupRecordingUi();
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
    if (mountedRef.current) {
      setIsListening(false);
    }
  }, [cleanupRecordingUi]);

  const stopListening = useCallback(() => {
    const recognizer = recognitionRef.current;
    const recorder = recorderRef.current;
    cleanupRecordingUi();

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
  }, [cancelListening, cleanupRecordingUi]);

  const refreshSpeechConfig = useCallback(() => {
    if (configRequestRef.current) return configRequestRef.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 4000);
    const pending = fetch("/api/speech/config", { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data): SttEngine | null => {
        if (!mountedRef.current) return null;
        const mode = data?.sttMode;
        if (typeof data?.ttsAutoPlayZh === "boolean") {
          setTtsAutoPlayZh(data.ttsAutoPlayZh);
        }
        return mode === "minimax" || mode === "openai" || mode === "browser" ? mode : null;
      })
      .catch(() => null)
      .then((mode) => {
        if (mountedRef.current) sttModeRef.current = mode;
        return mode;
      })
      .finally(() => {
        window.clearTimeout(timeout);
        configRequestRef.current = null;
      });
    configRequestRef.current = pending;
    return pending;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refreshSpeechConfig();

    // 家长在另一个标签页改完语音配置后，孩子切回本页即可生效。
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshSpeechConfig();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopSpeaking();
      cancelListening();
    };
  }, [cancelListening, refreshSpeechConfig, stopSpeaking]);

  const speakWithBrowserAsync = useCallback(
    (seq: number, text: string, lang: "en" | "zh", slow: boolean): Promise<void> => {
      return new Promise((resolve) => {
        if (
          !mountedRef.current ||
          seq !== speakSeqRef.current ||
          typeof window === "undefined" ||
          !("speechSynthesis" in window)
        ) {
          resolve();
          return;
        }
        const finish = () => {
          if (speakResolveRef.current === finish) speakResolveRef.current = null;
          resolve();
        };
        speakResolveRef.current = finish;
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = lang === "zh" ? "zh-CN" : "en-US";
          utter.rate = slow ? 0.7 : 0.92;
          utter.pitch = 1.08;
          utter.onend = finish;
          utter.onerror = finish;
          window.speechSynthesis.speak(utter);
        } catch {
          finish();
        }
      });
    },
    []
  );

  const playSingleItem = useCallback(
    async (seq: number, text: string, lang: "en" | "zh", slow: boolean): Promise<void> => {
      const clean = sanitizeTextForTts(text);
      if (!clean || !mountedRef.current || seq !== speakSeqRef.current) return;

      const controller = new AbortController();
      speakAbortRef.current = controller;

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

          const played = await new Promise<boolean>((resolve) => {
            const finish = (ok: boolean) => {
              if (speakResolveRef.current === onAbort) speakResolveRef.current = null;
              if (audioUrlRef.current === url) revokeCurrentAudioUrl();
              if (audioRef.current === audio) audioRef.current = null;
              resolve(ok);
            };
            const onAbort = () => finish(true);
            speakResolveRef.current = onAbort;
            audio.onended = () => finish(true);
            audio.onerror = () => finish(false);
            audio.play().catch(() => finish(false));
          });

          if (played || !mountedRef.current || seq !== speakSeqRef.current) {
            return;
          }
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
      await speakWithBrowserAsync(seq, clean, lang, slow);
    },
    [revokeCurrentAudioUrl, speakWithBrowserAsync]
  );

  const speakSequence = useCallback(
    async (items: SpeakSequenceItem[]) => {
      const valid = items.filter((item) => sanitizeTextForTts(item.text).length > 0);
      if (valid.length === 0) return;

      stopSpeaking();
      const seq = ++speakSeqRef.current;
      if (mountedRef.current) setIsSpeaking(true);

      try {
        for (let i = 0; i < valid.length; i++) {
          if (!mountedRef.current || seq !== speakSeqRef.current) break;
          const item = valid[i];
          await playSingleItem(seq, item.text, item.lang ?? "en", Boolean(item.slow));
          if (i < valid.length - 1 && mountedRef.current && seq === speakSeqRef.current) {
            await new Promise<void>((resolve) => {
              const timer = window.setTimeout(() => {
                if (speakResolveRef.current === cancelPause) speakResolveRef.current = null;
                resolve();
              }, 220);
              const cancelPause = () => {
                window.clearTimeout(timer);
                resolve();
              };
              speakResolveRef.current = cancelPause;
            });
          }
        }
      } finally {
        if (mountedRef.current && seq === speakSeqRef.current) {
          setIsSpeaking(false);
        }
      }
    },
    [playSingleItem, stopSpeaking]
  );

  const speak = useCallback(
    async (text: string, options: SpeakOptions = {}) => {
      await speakSequence([{ text, lang: options.lang, slow: options.slow }]);
    },
    [speakSequence]
  );

  const startBrowserRecognition = useCallback(
    (seq: number, lang: "en" | "zh", onTranscript: (text: string) => void) => {
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
        rec.lang = lang === "zh" ? "zh-CN" : "en-US";
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

  const startAudioMeter = useCallback((stream: MediaStream, seq: number) => {
    const meter = audioMeterRef.current;
    if (!meter) return;
    try {
      const win = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioCtx = win.AudioContext || win.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      meterCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let previousLevel = 0;

      const tick = () => {
        if (!mountedRef.current || seq !== listenSeqRef.current || !meterCtxRef.current) return;
        analyser.getByteTimeDomainData(data);
        let sumSq = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / data.length);
        const level = Math.round(Math.min(1, rms * 3.8) * 20);
        if (level !== previousLevel) {
          meter.style.scale = String(1 + level * 0.006);
          previousLevel = level;
        }
        meterRafRef.current = window.requestAnimationFrame(tick);
      };
      meterRafRef.current = window.requestAnimationFrame(tick);
    } catch {
      // Ignore metering failures on restricted browsers
    }
  }, []);

  const startListening = useCallback(
    async (
      hints: string,
      onTranscript: (text: string, meta?: ListenTranscriptMeta) => void,
      options: ListenOptions = {}
    ) => {
      if (typeof window === "undefined") return;
      stopSpeaking();
      cancelListening();

      const lang = options.lang ?? "en";
      const maxDurationMs = options.maxDurationMs ?? 8000;
      const purpose = options.voiceProofPurpose;
      const seq = ++listenSeqRef.current;
      setSttError(null);
      setIsListening(true);

      const mode = sttModeRef.current ?? (purpose ? await refreshSpeechConfig() : "browser");
      if (!mountedRef.current || seq !== listenSeqRef.current) return;
      if (mode === null && purpose === "feed") {
        setIsListening(false);
        setSttError("暂时没能确认语音设置，请再点一次录音，或用「直接投喂」哦！");
        return;
      }

      const useCloudStt = mode === "openai" || mode === "minimax";
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
            cleanupRecordingUi();
            stream.getTracks().forEach((t) => t.stop());
            if (streamRef.current === stream) streamRef.current = null;
            if (recorderRef.current === recorder) recorderRef.current = null;
            if (!isCurrent()) return;
            setIsListening(false);

            const recordedMime = recorder.mimeType || mimeType || "audio/webm";
            const rawBlob = new Blob(chunks, { type: recordedMime });
            if (rawBlob.size < 100) {
              setSttError("刚才没录到声音呢，点开始后大声说出来再点结束哦~");
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
              form.append("language", lang);
              if (purpose) form.append("voiceProofPurpose", purpose);
              const res = await fetch("/api/speech/stt", {
                method: "POST",
                body: form,
                signal: controller.signal,
              });
              const data = await res.json();
              if (!isCurrent()) return;
              if (data?.ok && data?.text) {
                onTranscript(data.text, {
                  voiceProof: typeof data.voiceProof === "string" ? data.voiceProof : undefined,
                });
              } else {
                if (data?.code === "stt_not_configured") void refreshSpeechConfig();
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
          startAudioMeter(stream, seq);

          const totalSecs = Math.max(3, Math.ceil(maxDurationMs / 1000));
          setListenCountdownSec(totalSecs);
          let remaining = totalSecs;
          countdownIntervalRef.current = window.setInterval(() => {
            remaining -= 1;
            if (mountedRef.current && seq === listenSeqRef.current) {
              setListenCountdownSec(Math.max(0, remaining));
            }
          }, 1000);
          maxDurTimerRef.current = window.setTimeout(() => {
            if (recorderRef.current === recorder && recorder.state === "recording") {
              recorder.stop();
            }
          }, maxDurationMs);
          return;
        } catch {
          if (pendingStream && streamRef.current === pendingStream) {
            pendingStream.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            recorderRef.current = null;
          }
          if (!mountedRef.current || seq !== listenSeqRef.current) return;
          cleanupRecordingUi();
          // Fall back to browser SpeechRecognition if MediaRecorder fails
        }
      }

      if (useCloudStt && purpose === "feed") {
        setIsListening(false);
        setSttError("半价投喂需要使用麦克风录音。请检查麦克风权限，或点「直接投喂」哦！");
        return;
      }
      startBrowserRecognition(seq, lang, onTranscript);
    },
    [cancelListening, cleanupRecordingUi, refreshSpeechConfig, startAudioMeter, startBrowserRecognition, stopSpeaking]
  );

  const clearSttError = useCallback(() => setSttError(null), []);

  return {
    isSpeaking,
    isListening,
    sttError,
    ttsAutoPlayZh,
    audioMeterRef,
    listenCountdownSec,
    clearSttError,
    speak,
    speakSequence,
    stopSpeaking,
    cancelListening,
    startListening,
    stopListening,
  };
}
