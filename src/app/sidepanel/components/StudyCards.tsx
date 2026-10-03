import { Check, Copy, Download, Shuffle } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Button, IconButton } from '@/components/ui';
import {
  flashcardsToAnkiCsv,
  nextUnrated,
  shuffleCards,
  type CardRating,
  type CardRatings,
  type Flashcard,
} from '@/core/study';
import { t } from '../../shared/i18n';

/** A temporary study round over an existing answer: no extra storage or AI requests. */
export function StudyCards({ cards }: { cards: readonly Flashcard[] }) {
  const headingId = useId();
  const answerId = useId();
  const revealButton = useRef<HTMLButtonElement>(null);
  const completeHeading = useRef<HTMLHeadingElement>(null);
  const [order, setOrder] = useState(() => cards.map((_, index) => index));
  const [current, setCurrent] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [ratings, setRatings] = useState<CardRatings>({});
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<'copy' | 'export'>();
  const reviewed = order.filter((id) => ratings[id] !== undefined).length;
  const known = order.filter((id) => ratings[id] === 'known').length;
  const complete = reviewed === order.length;
  const cardId = order[current];
  const card = cardId === undefined ? undefined : cards[cardId];

  const move = (index: number) => {
    setCurrent(index);
    setRevealed(false);
    setTimeout(() => revealButton.current?.focus(), 0);
  };

  const rate = (rating: CardRating) => {
    if (cardId === undefined || !revealed) return;
    const updated = { ...ratings, [cardId]: rating };
    setRatings(updated);
    const next = nextUnrated(order, current, updated);
    if (next !== undefined) move(next);
    else {
      setRevealed(false);
      setTimeout(() => completeHeading.current?.focus(), 0);
    }
  };

  const startRound = (ids: readonly number[]) => {
    setOrder([...ids]);
    setRatings({});
    move(0);
  };

  const download = () => {
    setError(undefined);
    try {
      const blob = new Blob([flashcardsToAnkiCsv(cards)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'localpulse-flashcards.csv';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('export');
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-[14px] border border-line bg-surface p-3"
    >
      <h3 id={headingId} className="text-sm font-semibold">
        {t('study.title')}
      </h3>
      <p className="mt-1 text-[0.76rem] text-muted">{t('study.note')}</p>
      <p role="status" className="mt-3 text-[0.76rem] text-muted">
        {t('study.progress', {
          reviewed: String(reviewed),
          total: String(order.length),
          known: String(known),
        })}
      </p>
      {complete ? (
        <div className="mt-3 space-y-3 rounded-[10px] bg-local-soft p-3">
          <h4 ref={completeHeading} tabIndex={-1} className="text-sm font-semibold">
            {t('study.complete')}
          </h4>
          <p className="text-[0.82rem]">
            {t('study.completeNote', { known: String(known), total: String(order.length) })}
          </p>
          <div className="flex flex-wrap gap-2">
            {known < order.length && (
              <Button
                size="sm"
                wrap
                onClick={() => startRound(order.filter((id) => ratings[id] === 'again'))}
              >
                {t('study.reviewAgain')}
              </Button>
            )}
            <Button size="sm" wrap onClick={() => startRound(cards.map((_, index) => index))}>
              {t('study.restart')}
            </Button>
          </div>
        </div>
      ) : card ? (
        <div className="mt-3">
          <p className="text-[0.78rem] font-medium">
            {t('study.position', { current: String(current + 1), total: String(order.length) })}
          </p>
          <div className="mt-2 rounded-[10px] border border-line p-3">
            <h4 className="text-[0.74rem] font-medium text-muted">{t('study.front')}</h4>
            <p
              dir="auto"
              className="mt-1 whitespace-pre-wrap text-[0.9rem] leading-relaxed [overflow-wrap:anywhere]"
            >
              {card.front}
            </p>
            <Button
              ref={revealButton}
              size="sm"
              className="mt-3"
              aria-expanded={revealed}
              aria-controls={answerId}
              onClick={() => setRevealed(!revealed)}
            >
              {revealed ? t('study.hide') : t('study.reveal')}
            </Button>
            <div id={answerId} hidden={!revealed} className="mt-3 border-t border-line pt-3">
              <h4 className="text-[0.74rem] font-medium text-muted">{t('study.back')}</h4>
              <p
                dir="auto"
                className="mt-1 whitespace-pre-wrap text-[0.9rem] leading-relaxed [overflow-wrap:anywhere]"
              >
                {card.back}
              </p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" disabled={!revealed} onClick={() => rate('again')}>
              {t('study.again')}
            </Button>
            <Button size="sm" variant="primary" disabled={!revealed} onClick={() => rate('known')}>
              {t('study.known')}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={current === 0}
              onClick={() => move(current - 1)}
            >
              {t('study.previous')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={current === order.length - 1}
              onClick={() => move(current + 1)}
            >
              {t('study.next')}
            </Button>
            <IconButton
              label={t('study.shuffle')}
              disabled={order.length < 2}
              onClick={() => {
                setOrder(shuffleCards(order));
                move(0);
              }}
            >
              <Shuffle className="h-4 w-4" aria-hidden />
            </IconButton>
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        <Button size="sm" wrap onClick={download}>
          <Download className="h-3.5 w-3.5" aria-hidden />
          {t('study.export')}
        </Button>
        <Button
          size="sm"
          wrap
          onClick={async () => {
            setError(undefined);
            try {
              await navigator.clipboard.writeText(flashcardsToAnkiCsv(cards));
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              setError('copy');
            }
          }}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied ? t('study.copied') : t('study.copy')}
        </Button>
      </div>
      <p className="mt-2 text-[0.74rem] text-muted">{t('study.exportNote')}</p>
      {error && (
        <p role="status" className="mt-2 text-[0.78rem] text-danger">
          {error === 'copy' ? t('study.copyFailed') : t('study.exportFailed')}
        </p>
      )}
    </section>
  );
}
