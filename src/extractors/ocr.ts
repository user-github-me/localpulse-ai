import { browser } from '#imports';
import { createWorker, OEM, type Worker as OcrWorker } from 'tesseract.js';
import {
  MAX_MEDIA_BYTES,
  MAX_OCR_PAGES,
  MAX_OCR_PIXELS,
  OCR_LANGUAGES,
  OCR_REVISION,
} from '@/core/media';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
export type OcrLanguage = keyof typeof OCR_LANGUAGES;
export interface OcrEngine {
  recognize(
    file: File,
    onProgress: (progress: number) => void,
    signal: AbortSignal,
  ): Promise<string>;
  dispose(): Promise<void>;
}
export async function prepareOcr(
  language: OcrLanguage,
  onProgress: (progress: number) => void,
): Promise<OcrEngine> {
  if (!(language in OCR_LANGUAGES)) throw new Error('media.language');
  let progress = onProgress;
  const worker: OcrWorker = await createWorker(language, OEM.LSTM_ONLY, {
    workerPath: browser.runtime.getURL('/ocr/worker.min.js' as '/'),
    corePath: browser.runtime.getURL('/ocr/tesseract-core-lstm.wasm.js' as '/'),
    langPath: `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${OCR_REVISION}`,
    gzip: false,
    workerBlobURL: false,
    cachePath: `localpulse-ocr-${OCR_REVISION}`,
    logger: (message) => progress(message.progress ?? 0),
  });
  return {
    dispose: async () => {
      await worker.terminate();
    },
    async recognize(file, onProgress, signal) {
      if (file.size > MAX_MEDIA_BYTES) throw new Error('media.limit');
      progress = onProgress;
      const abort = () => {
        void worker.terminate();
      };
      signal.addEventListener('abort', abort, { once: true });
      try {
        signal.throwIfAborted();
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
          GlobalWorkerOptions.workerSrc = workerUrl;
          const loading = getDocument({
            data: await file.arrayBuffer(),
            useWasm: false,
            disableFontFace: true,
          });
          const pdf = await loading.promise;
          try {
            if (pdf.numPages > MAX_OCR_PAGES) throw new Error('media.limit');
            const chunks: string[] = [];
            for (let number = 1; number <= pdf.numPages; number++) {
              signal.throwIfAborted();
              const page = await pdf.getPage(number);
              const base = page.getViewport({ scale: 1.5 });
              const scale = Math.min(1, Math.sqrt(MAX_OCR_PIXELS / (base.width * base.height)));
              const viewport = page.getViewport({ scale: 1.5 * scale });
              const canvas = document.createElement('canvas');
              canvas.width = Math.ceil(viewport.width);
              canvas.height = Math.ceil(viewport.height);
              const context = canvas.getContext('2d');
              if (!context) throw new Error('media.failed');
              await page.render({ canvas, canvasContext: context, viewport }).promise;
              progress = (p) => onProgress((number - 1 + p) / pdf.numPages);
              const result = await worker.recognize(canvas);
              chunks.push(`## Page ${number}\n\n${result.data.text.trim()}`);
              canvas.width = 0;
              canvas.height = 0;
              page.cleanup();
            }
            return chunks.join('\n\n').slice(0, 400000);
          } finally {
            await loading.destroy();
          }
        }
        const bitmap = await createImageBitmap(file);
        try {
          if (bitmap.width * bitmap.height > MAX_OCR_PIXELS) throw new Error('media.limit');
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
          const result = await worker.recognize(canvas);
          canvas.width = 0;
          canvas.height = 0;
          return result.data.text.slice(0, 400000);
        } finally {
          bitmap.close();
        }
      } finally {
        signal.removeEventListener('abort', abort);
      }
    },
  };
}
