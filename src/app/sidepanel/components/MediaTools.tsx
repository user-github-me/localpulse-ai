import { useEffect, useRef, useState } from 'react';
import { browser } from '#imports';
import { Button, Dialog, ProgressBar } from '@/components/ui';
import { MAX_MEDIA_BYTES, MODEL_DOWNLOAD_ORIGINS, OCR_LANGUAGES } from '@/core/media';
import { captureDocument } from '@/core/workspace';
import { countWords } from '@/lib/text';
import { downloadText } from '@/lib/download';
import type { OcrEngine, OcrLanguage } from '@/extractors/ocr';
import type { AudioEngine } from '@/extractors/audio';
import { t } from '../../shared/i18n';
import { usePanel } from '../store';
export function MediaTools({ kind, onClose }: { kind: 'ocr' | 'audio'; onClose: () => void }) {
  const [file, setFile] = useState<File>();
  const [language, setLanguage] = useState<OcrLanguage>('eng');
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const mounted = useRef(true);
  const engine = useRef<OcrEngine | AudioEngine | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined);
  const locked = usePanel((s) => s.busy || s.consent !== null || s.fileStatus !== null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      void engine.current?.dispose();
    };
  }, []);
  const title = t(kind === 'ocr' ? 'media.ocr' : 'media.audio');
  function prepare() {
    const permission = browser.permissions.request({
      origins: kind === 'ocr' ? ['https://raw.githubusercontent.com/*'] : MODEL_DOWNLOAD_ORIGINS,
    });
    setBusy(true);
    setMessage('');
    setProgress(0);
    void (async () => {
      try {
        if (!(await permission)) throw new Error();
        const value =
          kind === 'ocr'
            ? await (await import('@/extractors/ocr')).prepareOcr(language, setProgress)
            : await (await import('@/extractors/audio')).prepareAudio(setProgress);
        if (!mounted.current) {
          await value.dispose();
          return;
        }
        engine.current = value;
        setReady(true);
        setMessage(t('media.ready'));
      } catch {
        setMessage(t('media.failed'));
      } finally {
        setBusy(false);
      }
    })();
  }
  async function process() {
    if (!file || !engine.current || busy) return;
    setBusy(true);
    setMessage('');
    setProgress(0);
    setProcessing(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const current = engine.current;
      const operation =
        'recognize' in current
          ? current.recognize(file, setProgress, abort.signal)
          : current.transcribe(file, setProgress, abort.signal);
      const output =
        kind === 'audio'
          ? await operation
          : await Promise.race([
              operation,
              new Promise<never>((_resolve, reject) => {
                abort.signal.addEventListener(
                  'abort',
                  () => reject(new DOMException('Cancelled', 'AbortError')),
                  { once: true },
                );
              }),
            ]);
      setText(output);
      if (!output.trim()) setMessage(t('media.empty'));
    } catch {
      setMessage(t(abort.signal.aborted ? 'media.cancelled' : 'media.failed'));
      if (kind === 'ocr') {
        void engine.current?.dispose();
        engine.current = undefined;
        setReady(false);
      }
    } finally {
      setBusy(false);
      controller.current = undefined;
      setProcessing(false);
    }
  }
  return (
    <Dialog
      open
      onClose={() => {
        controller.current?.abort();
        onClose();
      }}
      title={title}
    >
      <div className="max-h-[70vh] space-y-3 overflow-auto">
        <p className="text-sm text-muted">
          {t(kind === 'ocr' ? 'media.ocrNote' : 'media.audioNote')}
        </p>
        {kind === 'ocr' && (
          <label className="block text-sm">
            {t('media.language')}
            <select
              className="mt-1 w-full rounded-lg border border-line bg-paper p-2"
              value={language}
              disabled={busy || ready}
              onChange={(e) => setLanguage(e.target.value as OcrLanguage)}
            >
              {Object.entries(OCR_LANGUAGES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        {!ready && (
          <Button wrap className="w-full" disabled={busy} onClick={prepare}>
            {t('media.download')}
          </Button>
        )}
        <p className="text-xs text-muted">{t('media.downloadNote')}</p>
        <label className="block text-sm">
          {t('media.file')}
          <input
            className="mt-2 block w-full text-xs"
            type="file"
            accept={
              kind === 'ocr'
                ? '.png,.jpg,.jpeg,.webp,.bmp,.pdf'
                : 'audio/*,.mp3,.wav,.m4a,.ogg,.webm,.flac'
            }
            disabled={busy}
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              e.target.value = '';
              setText('');
              if (chosen && chosen.size > MAX_MEDIA_BYTES) {
                setMessage(t('media.limit'));
                setFile(undefined);
              } else {
                setFile(chosen);
                setMessage('');
              }
            }}
          />
        </label>
        {file && <p className="break-words text-xs text-muted">{file.name}</p>}
        <Button
          wrap
          className="w-full"
          disabled={!ready || !file || busy}
          onClick={() => void process()}
        >
          {t(kind === 'ocr' ? 'media.recognize' : 'media.transcribe')}
        </Button>
        {busy && (
          <>
            <ProgressBar value={progress} label={title} />
            <p role="status" className="text-xs text-muted">
              {t('media.progress', { percent: String(Math.round(progress * 100)) })}
            </p>
            {processing && (
              <Button size="sm" onClick={() => controller.current?.abort()}>
                {t('media.cancel')}
              </Button>
            )}
          </>
        )}
        {text && (
          <>
            <label className="block text-sm">
              {t('media.review')}
              <textarea
                className="mt-1 h-48 w-full resize-y rounded-lg border border-line bg-paper p-2 text-sm"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={400000}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy || locked || !text.trim()}
                onClick={() => {
                  const document = captureDocument({
                    url: `file:${file?.name ?? kind}`,
                    title: file?.name ?? title,
                    kind: kind === 'ocr' && /\.pdf$/i.test(file?.name ?? '') ? 'pdf' : 'html',
                    source: 'fallback',
                    markdown: text,
                    wordCount: countWords(text),
                  });
                  if (usePanel.getState().loadDocuments([document], true)) onClose();
                  else setMessage(t('workspace.limit'));
                }}
              >
                {t('media.add')}
              </Button>
              <Button size="sm" onClick={() => downloadText(text, `localpulse-${kind}.txt`)}>
                {t('media.export')}
              </Button>
            </div>
          </>
        )}
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        <Button
          size="sm"
          onClick={() => {
            controller.current?.abort();
            onClose();
          }}
        >
          {t('common.close')}
        </Button>
      </div>
    </Dialog>
  );
}
