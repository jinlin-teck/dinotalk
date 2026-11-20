/**
 * Pure TypeScript WAV (RIFF / PCM 16-bit mono) encoder and resampler.
 * Works in both browser (Web Audio API) and Node.js (connectivity test).
 */

export function downsampleToMono16k(
  channels: Float32Array[],
  inputSampleRate: number,
  targetSampleRate = 16000
): Float32Array {
  if (channels.length === 0 || channels[0].length === 0) {
    return new Float32Array(0);
  }

  const length = channels[0].length;
  const mono = new Float32Array(length);
  if (channels.length === 1) {
    mono.set(channels[0]);
  } else {
    for (let i = 0; i < length; i++) {
      let sum = 0;
      for (let c = 0; c < channels.length; c++) {
        sum += channels[c][i] ?? 0;
      }
      mono[i] = sum / channels.length;
    }
  }

  if (inputSampleRate <= 0 || inputSampleRate === targetSampleRate) {
    return mono;
  }

  const ratio = inputSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.round(length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = mono[Math.min(idx, length - 1)] ?? 0;
    const s1 = mono[Math.min(idx + 1, length - 1)] ?? s0;
    output[i] = s0 + (s1 - s0) * frac;
  }

  return output;
}

export function encodeFloat32ToWavBuffer(
  samples: Float32Array,
  sampleRate = 16000
): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataByteLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(36, "data");
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0));
    const int16 = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return buffer;
}

export function createSilentWavBuffer(durationMs = 400, sampleRate = 16000): ArrayBuffer {
  const sampleCount = Math.max(1, Math.round((sampleRate * durationMs) / 1000));
  return encodeFloat32ToWavBuffer(new Float32Array(sampleCount), sampleRate);
}
