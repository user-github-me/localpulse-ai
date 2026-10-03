export const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_SECONDS = 600;
export const MAX_OCR_PIXELS = 16_000_000;
export const MAX_OCR_PAGES = 10;
export const OCR_REVISION = '87416418657359cb625c412a48b6e1d6d41c29bd';
export const OCR_LANGUAGES = {
  eng: 'English',
  spa: 'Español',
  fra: 'Français',
  deu: 'Deutsch',
  ben: 'বাংলা',
  chi_sim: '简体中文',
  jpn: '日本語',
} as const;
export const WHISPER_MODEL = 'onnx-community/whisper-tiny.en';
export const WHISPER_REVISION = '2575352d61be1bf7225cf8f8b268a4678025fc58';
export const MODEL_DOWNLOAD_ORIGINS = [
  'https://huggingface.co/*',
  'https://*.huggingface.co/*',
  'https://*.hf.co/*',
];
export function monoSamples(
  channels: Float32Array[],
  sourceRate: number,
  targetRate = 16000,
): Float32Array {
  if (
    !channels.length ||
    !Number.isFinite(sourceRate) ||
    sourceRate <= 0 ||
    channels.some((c) => c.length !== channels[0]!.length)
  )
    throw new Error('media.audioInvalid');
  const length = Math.floor((channels[0]!.length * targetRate) / sourceRate);
  if (length > MAX_AUDIO_SECONDS * targetRate) throw new Error('media.limit');
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = (i * sourceRate) / targetRate,
      start = Math.floor(position),
      weight = position - start;
    let sample = 0;
    for (const channel of channels) {
      sample +=
        (channel[start] ?? 0) * (1 - weight) +
        (channel[Math.min(start + 1, channel.length - 1)] ?? 0) * weight;
    }
    result[i] = sample / channels.length;
  }
  return result;
}
