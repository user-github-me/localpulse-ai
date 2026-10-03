/** Speech uses only voices the browser identifies as installed on this device. */
export const MAX_SPEECH_CHARS = 60_000;
export const SPEECH_CHUNK_CHARS = 240;

export function localVoices(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((voice) => voice.localService === true);
}

export function voiceKey(voice: SpeechSynthesisVoice): string {
  return JSON.stringify([voice.voiceURI, voice.lang, voice.name]);
}

export function preferredVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: string,
): SpeechSynthesisVoice | undefined {
  const available = localVoices(voices);
  const base = language.toLowerCase().split('-')[0];
  return (
    available.find((voice) => voice.lang.toLowerCase() === language.toLowerCase()) ??
    available.find((voice) => voice.lang.toLowerCase().split('-')[0] === base) ??
    available.find((voice) => voice.default) ??
    available[0]
  );
}

/** Plain text without parsing or inserting model-provided HTML into a document. */
export function speechText(markdown: string): { text: string; truncated: boolean } {
  const bounded = markdown.slice(0, MAX_SPEECH_CHARS);
  const text = bounded
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*$/gm, '')
    .replace(/^[ \t]*\[[^\]\n]+\]:[^\n]*$/gm, '')
    .replace(/!?\[([^\]\n]*)\]\([^\n]*?\)/g, '$1')
    .replace(/!?\[([^\]\n]*)\]\[[^\]\n]*\]/g, '$1')
    .replace(/<https?:[^>\s]+>/gi, '')
    .replace(/<\/?[a-z][^>\n]*>/gi, ' ')
    .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/gm, '')
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|(?:>[ \t]*)+|[-*+][ \t]+(?:\[[ xX]\][ \t]*)?)/gm, '')
    .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, '')
    .replace(/\*\*|__|~~|`+/g, '')
    .replace(/(^|\s)[*_](?=\S)|(?<=\S)[*_](?=$|[\s.,;:!?])/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!>|~])/g, '$1')
    .replace(/\|/g, ', ')
    .replace(
      /&(?:amp|quot|apos|lt|gt|nbsp);/g,
      (entity) =>
        ({
          '&amp;': '&',
          '&quot;': '"',
          '&apos;': "'",
          '&lt;': '<',
          '&gt;': '>',
          '&nbsp;': ' ',
        })[entity] ?? entity,
    )
    .replace(/\s+/g, ' ')
    .trim();
  return { text, truncated: markdown.length > MAX_SPEECH_CHARS };
}

/** Small utterances avoid the stalls some browsers have when speaking a whole long answer. */
export function speechChunks(text: string, maxChars = SPEECH_CHUNK_CHARS): string[] {
  const limit = Math.max(32, Math.floor(maxChars));
  let remaining = text.slice(0, MAX_SPEECH_CHARS).trim();
  const chunks: string[] = [];
  while (remaining) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }
    const window = remaining.slice(0, limit);
    const sentence = [...window.matchAll(/[.!?。！？](?:\s|$)/g)].at(-1);
    const space = window.lastIndexOf(' ');
    let end =
      sentence && sentence.index >= limit / 3
        ? sentence.index + sentence[0].trimEnd().length
        : space >= limit / 3
          ? space
          : limit;
    // Keep surrogate pairs whole even for a long word without spaces.
    if (/^[\uDC00-\uDFFF]$/.test(remaining[end] ?? '')) end--;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trimStart();
  }
  return chunks;
}

export type SpeechStatus = 'idle' | 'playing' | 'paused' | 'error';
type SpeechEngine = Pick<SpeechSynthesis, 'getVoices' | 'speak' | 'pause' | 'resume' | 'cancel'>;

/** One answer reads at a time; cancellation callbacks from older utterances cannot restart it. */
export class LocalSpeechPlayer {
  private static active?: LocalSpeechPlayer;
  private generation = 0;
  private chunks: string[] = [];
  private next = 0;
  private selected = '';
  private utterance?: SpeechSynthesisUtterance;
  private status: SpeechStatus = 'idle';

  constructor(
    private readonly engine: SpeechEngine,
    private readonly onStatus: (status: SpeechStatus) => void,
    private readonly createUtterance = (text: string) => new SpeechSynthesisUtterance(text),
  ) {}

  private update(status: SpeechStatus) {
    this.status = status;
    this.onStatus(status);
  }

  start(text: string, voice: SpeechSynthesisVoice): void {
    // Resolve again from the browser, rather than trusting a stale selector or a default voice.
    const key = voiceKey(voice);
    const actual = localVoices(this.engine.getVoices()).find((item) => voiceKey(item) === key);
    if (!actual || !text.trim()) {
      this.stop();
      this.update('error');
      return;
    }
    LocalSpeechPlayer.active?.stop();
    this.stop();
    LocalSpeechPlayer.active = this;
    this.selected = key;
    this.chunks = speechChunks(text);
    this.next = 0;
    this.update('playing');
    try {
      this.engine.cancel();
      this.engine.resume();
      this.speakNext();
    } catch {
      this.fail();
    }
  }

  pause(): void {
    if (this.status !== 'playing') return;
    try {
      this.engine.pause();
      this.update('paused');
    } catch {
      this.fail();
    }
  }

  resume(): void {
    if (this.status !== 'paused') return;
    try {
      this.engine.resume();
      this.update('playing');
      if (!this.utterance) this.speakNext();
    } catch {
      this.fail();
    }
  }

  stop(): void {
    this.generation++;
    this.chunks = [];
    this.utterance = undefined;
    if (LocalSpeechPlayer.active === this) {
      LocalSpeechPlayer.active = undefined;
      try {
        this.engine.cancel();
      } catch {
        /* Nothing remains to speak. */
      }
    }
    this.update('idle');
  }

  private fail() {
    this.stop();
    this.update('error');
  }

  private speakNext() {
    if (LocalSpeechPlayer.active !== this || this.status !== 'playing') return;
    const text = this.chunks[this.next];
    if (text === undefined) {
      this.stop();
      return;
    }
    const voice = localVoices(this.engine.getVoices()).find(
      (item) => voiceKey(item) === this.selected,
    );
    if (!voice) {
      this.fail();
      return;
    }
    const generation = this.generation;
    const utterance = this.createUtterance(text);
    this.utterance = utterance;
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.onend = () => {
      if (this.generation !== generation || this.utterance !== utterance) return;
      this.utterance = undefined;
      this.next++;
      try {
        this.speakNext();
      } catch {
        this.fail();
      }
    };
    utterance.onerror = () => {
      if (this.generation === generation && this.utterance === utterance) this.fail();
    };
    this.engine.speak(utterance);
  }
}
