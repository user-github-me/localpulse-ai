import { Pause, Play, Square, Volume2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { IconButton } from '@/components/ui';
import {
  LocalSpeechPlayer,
  localVoices,
  preferredVoice,
  speechText,
  voiceKey,
  type SpeechStatus,
} from '@/core/speech';
import { t } from '../../shared/i18n';

function availableVoices(): SpeechSynthesisVoice[] {
  try {
    return localVoices(globalThis.speechSynthesis?.getVoices() ?? []);
  } catch {
    return [];
  }
}

/** Remote system voices are excluded even when the browser marks one as its default. */
export function ReadAloud({ text }: { text: string }) {
  const [voices, setVoices] = useState(availableVoices);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState<SpeechStatus>('idle');
  const player = useRef<LocalSpeechPlayer | null>(null);
  const noteId = useId();
  const voiceId = useId();
  const speaking = status === 'playing' || status === 'paused';
  const plain = useMemo(() => speechText(text), [text]);
  const voice =
    voices.find((item) => voiceKey(item) === selected) ??
    preferredVoice(voices, navigator.language);
  const supported =
    typeof globalThis.SpeechSynthesisUtterance !== 'undefined' &&
    Boolean(globalThis.speechSynthesis);
  const available = supported && voice !== undefined && plain.text.length > 0;

  useEffect(() => {
    const engine = globalThis.speechSynthesis;
    if (!engine || typeof globalThis.SpeechSynthesisUtterance === 'undefined') return;
    let mounted = true;
    const reading = new LocalSpeechPlayer(engine, (next) => {
      if (mounted) setStatus(next);
    });
    player.current = reading;
    const refresh = () => setVoices(availableVoices());
    engine.addEventListener('voiceschanged', refresh);
    return () => {
      mounted = false;
      reading.stop();
      player.current = null;
      engine.removeEventListener('voiceschanged', refresh);
    };
  }, [text]);

  const start = () => {
    if (!voice || !available) return;
    setSelected(voiceKey(voice));
    player.current?.start(plain.text, voice);
  };

  return (
    <>
      <IconButton
        label={
          status === 'playing'
            ? t('speech.pause')
            : status === 'paused'
              ? t('speech.resume')
              : t('speech.read')
        }
        title={!available ? t('speech.unavailable') : undefined}
        aria-describedby={noteId}
        className="h-7 w-7"
        disabled={!available && !speaking}
        onClick={() =>
          status === 'playing'
            ? player.current?.pause()
            : status === 'paused'
              ? player.current?.resume()
              : start()
        }
      >
        {status === 'playing' ? (
          <Pause className="h-3.5 w-3.5" aria-hidden />
        ) : status === 'paused' ? (
          <Play className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Volume2 className="h-3.5 w-3.5" aria-hidden />
        )}
      </IconButton>
      {speaking && (
        <>
          <IconButton
            label={t('speech.stop')}
            className="h-7 w-7"
            onClick={() => player.current?.stop()}
          >
            <Square className="h-3.5 w-3.5" aria-hidden />
          </IconButton>
          <div className="order-last mt-2 basis-full rounded-lg border border-line bg-surface p-2 text-[0.76rem]">
            <label htmlFor={voiceId} className="block font-medium">
              {t('speech.voice')}
            </label>
            <select
              id={voiceId}
              value={voice ? voiceKey(voice) : ''}
              className="mt-1 w-full min-w-0 rounded-md border border-line bg-paper p-1.5 text-ink"
              onChange={(event) => {
                const changed = voices.find((item) => voiceKey(item) === event.target.value);
                if (!changed) return;
                setSelected(event.target.value);
                player.current?.start(plain.text, changed);
              }}
            >
              {voices.map((item) => (
                <option key={voiceKey(item)} value={voiceKey(item)}>
                  {item.name} ({item.lang})
                </option>
              ))}
            </select>
            <p className="mt-1 text-muted">{t('speech.voiceNote')}</p>
            <p role="status" className="mt-1 text-muted">
              {status === 'paused' ? t('speech.paused') : t('speech.playing')}
            </p>
            {plain.truncated && <p className="mt-1 text-muted">{t('speech.truncated')}</p>}
          </div>
        </>
      )}
      <span id={noteId} className="sr-only">
        {available ? t('speech.localOnly') : t('speech.unavailable')}
      </span>
      {status === 'error' && (
        <p role="alert" className="order-last mt-1 basis-full text-[0.76rem] text-danger">
          {t('speech.failed')}
        </p>
      )}
    </>
  );
}
