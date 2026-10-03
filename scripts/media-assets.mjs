import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
const require = createRequire(import.meta.url);
/** npm-pinned executable assets are copied into the extension, never downloaded at runtime. */
export function mediaAssets() {
  const tesseractMain = require.resolve('tesseract.js');
  const tesseractRoot = join(dirname(tesseractMain), '..');
  const tesseractRequire = createRequire(tesseractMain);
  const coreRoot = dirname(tesseractRequire.resolve('tesseract.js-core'));
  const transformerRequire = createRequire(require.resolve('@huggingface/transformers'));
  const ortRoot = dirname(transformerRequire.resolve('onnxruntime-web'));
  const pairs = [
    [join(tesseractRoot, 'dist/worker.min.js'), 'ocr/worker.min.js'],
    [join(tesseractRoot, 'LICENSE.md'), 'ocr/LICENSE.txt'],
    [join(tesseractRoot, 'dist/worker.min.js.LICENSE.txt'), 'ocr/worker-LICENSE.txt'],
    [join(coreRoot, 'LICENSE'), 'ocr/core-LICENSE.txt'],
    [
      join(dirname(require.resolve('@huggingface/transformers')), '..', 'LICENSE'),
      'audio/transformers-LICENSE.txt',
    ],
    [join(coreRoot, 'tesseract-core-lstm.wasm.js'), 'ocr/tesseract-core-lstm.wasm.js'],
    [join(coreRoot, 'tesseract-core-lstm.wasm'), 'ocr/tesseract-core-lstm.wasm'],
    [resolve('scripts/licenses/onnxruntime.txt'), 'audio/onnxruntime-LICENSE.txt'],
    [join(ortRoot, 'ort-wasm-simd-threaded.mjs'), 'audio/ort-wasm-simd-threaded.mjs'],
    [join(ortRoot, 'ort-wasm-simd-threaded.wasm'), 'audio/ort-wasm-simd-threaded.wasm'],
  ];
  return pairs.map(([absoluteSrc, relativeDest]) => ({ absoluteSrc, relativeDest }));
}
