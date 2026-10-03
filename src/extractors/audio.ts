import { browser } from '#imports';
import {
  MAX_MEDIA_BYTES,
  MAX_AUDIO_SECONDS,
  monoSamples,
  WHISPER_MODEL,
  WHISPER_REVISION,
} from '@/core/media';
export interface AudioEngine {
  transcribe(file: File, onProgress: (value: number) => void, signal: AbortSignal): Promise<string>;
  dispose(): Promise<void>;
}
export async function prepareAudio(onProgress: (value: number) => void): Promise<AudioEngine> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  env.useWasmCache = false;
  const wasm = env.backends.onnx.wasm!;
  wasm.numThreads = 1;
  wasm.proxy = false;
  wasm.wasmPaths = {
    mjs: browser.runtime.getURL('/audio/ort-wasm-simd-threaded.mjs' as '/'),
    wasm: browser.runtime.getURL('/audio/ort-wasm-simd-threaded.wasm' as '/'),
  };
  const nativeFetch = globalThis.fetch.bind(globalThis);
  env.fetch = (input, options) =>
    nativeFetch(input, { ...options, credentials: 'omit', referrerPolicy: 'no-referrer' });
  const transcriber = await pipeline('automatic-speech-recognition', WHISPER_MODEL, {
    revision: WHISPER_REVISION,
    device: 'wasm',
    dtype: 'q8',
    progress_callback: (info) => {
      if ('progress' in info) onProgress(Number(info.progress) / 100);
    },
  });
  return {
    dispose: () => transcriber.dispose(),
    async transcribe(file, onProgress, signal) {
      if (file.size > MAX_MEDIA_BYTES) throw new Error('media.limit');
      const context = new AudioContext();
      let decoded: AudioBuffer;
      try {
        decoded = await context.decodeAudioData(await file.arrayBuffer());
      } finally {
        await context.close();
      }
      if (decoded.duration > MAX_AUDIO_SECONDS) throw new Error('media.limit');
      const samples = monoSamples(
        Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i)),
        decoded.sampleRate,
      );
      const chunks: string[] = [];
      const chunkLength = 30 * 16000;
      for (let offset = 0; offset < samples.length; offset += chunkLength) {
        signal.throwIfAborted();
        const result = await transcriber(samples.subarray(offset, offset + chunkLength), {
          return_timestamps: false,
          max_new_tokens: 128,
        });
        const output = Array.isArray(result) ? result[0] : result;
        if (output?.text.trim()) chunks.push(output.text.trim());
        onProgress(Math.min(1, (offset + chunkLength) / samples.length));
      }
      signal.throwIfAborted();
      return chunks.join('\n\n');
    },
  };
}
