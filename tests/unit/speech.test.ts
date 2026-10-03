import { describe, expect, it, vi } from 'vitest';
import {
  LocalSpeechPlayer,
  localVoices,
  preferredVoice,
  speechChunks,
  speechText,
  MAX_SPEECH_CHARS,
  type SpeechStatus,
} from '@/core/speech';

function voice(name: string, localService = true, lang = 'en-US', isDefault = false) {
  return { name, voiceURI: name, localService, lang, default: isDefault } as SpeechSynthesisVoice;
}

function speechEngine(initial: SpeechSynthesisVoice[] = [voice('Installed')]) {
  let voices = initial;
  const spoken: SpeechSynthesisUtterance[] = [];
  const engine = {
    getVoices: () => voices,
    speak: vi.fn((utterance: SpeechSynthesisUtterance) => spoken.push(utterance)),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
  };
  const statuses: SpeechStatus[] = [];
  const player = new LocalSpeechPlayer(
    engine,
    (state) => statuses.push(state),
    (text) => ({ text }) as SpeechSynthesisUtterance,
  );
  return {
    engine,
    player,
    spoken,
    statuses,
    setVoices: (next: SpeechSynthesisVoice[]) => {
      voices = next;
    },
  };
}

function ended(utterance: SpeechSynthesisUtterance) {
  utterance.onend?.({} as SpeechSynthesisEvent);
}

describe('speech content', () => {
  it('reads formatted content without markdown, link targets, or HTML execution', () => {
    const input =
      '# Overview\n\n- [x] **Ready** _now_. [Documentation](https://private.test/?value=secret)\n\n' +
      '| Name | Value |\n| --- | --- |\n| Total | 42 |\n\n' +
      '```js\nconst snake_case = 1;\nif (x < y && z > a) return;\n```\n<script>alert("evil")</script><img src=x onerror=alert(2)> &amp; `code`.';
    const { text } = speechText(input);
    expect(text).toContain('Overview Ready now. Documentation');
    expect(text).toContain('Total , 42');
    expect(text).toContain('const snake_case = 1;');
    expect(text).toContain('x < y && z > a');
    expect(text).toContain('& code.');
    expect(text).not.toMatch(/private\.test|secret|<script|alert|<img|```|\*\*|\[x\]|---/);
  });

  it('bounds total text and chunks without losing words or splitting surrogate pairs', () => {
    const input = 'First sentence. A considerably longer sentence contains many words. '.repeat(20);
    const chunks = speechChunks(input, 70);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 70)).toBe(true);
    expect(chunks.join(' ')).toBe(input.trim());
    const emoji = speechChunks('😀'.repeat(90), 33);
    expect(emoji.every((chunk) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk))).toBe(true);
    expect(speechText('a'.repeat(MAX_SPEECH_CHARS + 10))).toEqual({
      text: 'a'.repeat(MAX_SPEECH_CHARS),
      truncated: true,
    });
  });
});

describe('local-only speech', () => {
  it('excludes remote/default voices and chooses a matching installed language', () => {
    const remote = voice('Remote default', false, 'en-US', true);
    const english = voice('Installed English');
    const bengali = voice('Installed Bangla', true, 'bn-BD');
    expect(localVoices([remote, english, bengali])).toEqual([english, bengali]);
    expect(preferredVoice([remote, english, bengali], 'bn-IN')).toBe(bengali);
    expect(preferredVoice([remote], 'en-US')).toBeUndefined();
  });

  it('refuses a remote voice even when passed directly to the player', () => {
    const remote = voice('Remote', false);
    const { player, spoken, statuses } = speechEngine([remote]);
    player.start('Private answer.', remote);
    expect(spoken).toHaveLength(0);
    expect(statuses.at(-1)).toBe('error');
  });

  it('plays one bounded utterance at a time and pauses, resumes, and stops', () => {
    const installed = voice('Installed');
    const { player, spoken, engine, statuses } = speechEngine([installed]);
    player.start('A sentence with facts. '.repeat(40), installed);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]?.voice).toBe(installed);
    player.pause();
    expect(engine.pause).toHaveBeenCalledOnce();
    expect(statuses.at(-1)).toBe('paused');
    ended(spoken[0]!);
    expect(spoken).toHaveLength(1);
    player.resume();
    expect(statuses.at(-1)).toBe('playing');
    expect(spoken).toHaveLength(2);
    const cancelled = spoken[1]!;
    player.stop();
    ended(cancelled);
    expect(spoken).toHaveLength(2);
    expect(statuses.at(-1)).toBe('idle');
  });

  it('stops when an installed voice disappears rather than falling back remotely', () => {
    const installed = voice('Installed');
    const { player, spoken, statuses, setVoices } = speechEngine([installed]);
    player.start('A sentence. '.repeat(50), installed);
    setVoices([voice('Cloud default', false, 'en-US', true)]);
    ended(spoken[0]!);
    expect(spoken).toHaveLength(1);
    expect(statuses.at(-1)).toBe('error');
  });

  it('stops the prior answer and ignores its late end/error events', () => {
    const one = speechEngine();
    const two = speechEngine();
    const installed = voice('Installed');
    one.player.start('First answer. '.repeat(50), installed);
    const stale = one.spoken[0]!;
    two.player.start('Second answer.', installed);
    expect(one.statuses.at(-1)).toBe('idle');
    ended(stale);
    stale.onerror?.({} as SpeechSynthesisErrorEvent);
    expect(one.spoken).toHaveLength(1);
    expect(two.statuses.at(-1)).toBe('playing');
    ended(two.spoken[0]!);
    expect(two.statuses.at(-1)).toBe('idle');
    two.player.stop();
  });

  it('reports synthesis failures and cancels queued content', () => {
    const { player, spoken, statuses, engine } = speechEngine();
    player.start('Private answer.', voice('Installed'));
    spoken[0]?.onerror?.({} as SpeechSynthesisErrorEvent);
    expect(statuses.at(-1)).toBe('error');
    expect(engine.cancel).toHaveBeenCalled();
    player.stop();
  });
});
