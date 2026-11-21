"use client";

class SoundEffectsManager {
  private ctx: AudioContext | null = null;
  private muted = false;

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  private getContext(): AudioContext | null {
    if (typeof window === "undefined" || this.muted) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = "sine",
    gainPeak = 0.12,
    delaySec = 0
  ) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  playClick() {
    this.playTone(580, 0.07, "sine", 0.08);
  }

  playCorrect() {
    this.playTone(523.25, 0.14, "triangle", 0.13, 0); // C5
    this.playTone(659.25, 0.16, "triangle", 0.13, 0.09); // E5
    this.playTone(783.99, 0.24, "triangle", 0.14, 0.18); // G5
  }

  playGentleTryAgain() {
    this.playTone(392.0, 0.14, "sine", 0.08, 0);
    this.playTone(349.23, 0.18, "sine", 0.07, 0.11);
  }

  playStar() {
    this.playTone(880, 0.12, "sine", 0.11, 0);
    this.playTone(1174.66, 0.22, "sine", 0.12, 0.08);
  }

  playCelebrate() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.22, "triangle", 0.13, idx * 0.09);
    });
  }

  playPop() {
    this.playTone(420, 0.05, "sine", 0.12, 0);
    this.playTone(860, 0.09, "triangle", 0.13, 0.04);
  }

  playCombo(streak: number) {
    const base = 523.25 * Math.pow(1.06, Math.min(8, Math.max(0, streak - 1)));
    this.playTone(base, 0.12, "triangle", 0.12, 0);
    this.playTone(base * 1.25, 0.16, "triangle", 0.13, 0.07);
    this.playTone(base * 1.5, 0.22, "sine", 0.14, 0.14);
  }

  playUnlock() {
    const notes = [587.33, 739.99, 880, 1174.66, 1479.98];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.24, "triangle", 0.13, idx * 0.08);
    });
  }
}

export const soundEffects = new SoundEffectsManager();
