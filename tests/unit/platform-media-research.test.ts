import { expect, it } from 'vitest';
import { formatShortcut } from '@/app/shared/open';
import { monoSamples } from '@/core/media';
import { parseSearchResults, publicSourceUrl, researchEndpoint } from '@/core/web-research';
it('formats platform modifiers consistently', () => {
  expect(formatShortcut('Alt+Shift+L', true)).toBe('⌥⇧L');
  expect(formatShortcut('Alt+Shift+L', false)).toBe('Alt+Shift+L');
  expect(formatShortcut('Command+V', false)).toBe('Ctrl+V');
  expect(formatShortcut('Command+Shift+K', true)).toBe('⌘⇧K');
  expect(formatShortcut('MacCtrl+S', true)).toBe('⌃S');
});
it('mixes audio channels and resamples within the duration bound', () => {
  expect([
    ...monoSamples([new Float32Array([1, 1, 1, 1]), new Float32Array([-1, -1, -1, -1])], 16000),
  ]).toEqual([0, 0, 0, 0]);
  expect(monoSamples([new Float32Array(48000)], 48000)).toHaveLength(16000);
  expect(() => monoSamples([], 16000)).toThrow();
});
it('search results remain inert, deduplicated and bounded', () => {
  expect(researchEndpoint('https://search.test/')).toBe('https://search.test');
  expect(researchEndpoint('https://user:pass@search.test')).toBeUndefined();
  expect(publicSourceUrl('javascript:alert(1)')).toBeUndefined();
  expect(publicSourceUrl('http://127.0.0.1/private')).toBeUndefined();
  const entries = parseSearchResults({
    results: [
      { title: 'Source', url: 'https://source.test/', content: 'text', script: 'evil' },
      { title: 'Duplicate', url: 'https://source.test/' },
      { title: 'Bad', url: 'javascript:alert(1)' },
    ],
  });
  expect(entries).toEqual([{ title: 'Source', url: 'https://source.test/', snippet: 'text' }]);
});
