import { describe, expect, it } from 'vitest';
import {
  countWords,
  estimateTokens,
  guessLanguage,
  hostnameOf,
  isLocalUrl,
  normalizeWhitespace,
  originPattern,
  truncateToTokens,
} from '@/lib/text';

describe('estimateTokens', () => {
  it('counts about 4 Latin characters per token', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
    expect(estimateTokens('')).toBe(0);
  });

  it('counts dense scripts such as Bengali, Chinese or Korean as about 1 character per token', () => {
    expect(estimateTokens('বাংলা'.repeat(20))).toBe(100);
    expect(estimateTokens('网页'.repeat(50))).toBe(100);
    expect(estimateTokens('한국어')).toBe(3);
  });

  it('counts other scripts as about 2 characters per token', () => {
    expect(estimateTokens('привет'.repeat(20))).toBe(60);
  });
});

describe('countWords', () => {
  it('counts words in any script, ignoring punctuation', () => {
    expect(countWords('Hello, world! It’s fine.')).toBe(4);
    expect(countWords('আমি বাংলায় লিখি')).toBe(3);
    expect(countWords('   ')).toBe(0);
  });

  it('counts words in Chinese and Japanese, which have no spaces between them', () => {
    expect(countWords('您收到此邮件是因为您在AirTCP申请了密码重置')).toBeGreaterThan(8);
    expect(countWords('パスワードをリセットしました')).toBeGreaterThan(2);
  });
});

describe('guessLanguage', () => {
  it('tells the language from the writing system where only one language uses it', () => {
    expect(guessLanguage('您收到此邮件是因为您在AirTCP申请了密码重置')).toBe('zh');
    expect(guessLanguage('パスワードをリセットしました')).toBe('ja');
    expect(guessLanguage('비밀번호를 재설정했습니다')).toBe('ko');
    expect(guessLanguage('আমি বাংলায় লিখি')).toBe('bn');
  });

  it('gives no guess for scripts many languages share', () => {
    expect(guessLanguage('Hello world')).toBeUndefined();
    expect(guessLanguage('Привет мир')).toBeUndefined();
    expect(guessLanguage('')).toBeUndefined();
  });
});

describe('normalizeWhitespace', () => {
  it('collapses spaces and blank lines in prose', () => {
    expect(normalizeWhitespace('a   b\t c\n\n\n\nd  ')).toBe('a b c\n\nd');
  });

  it('keeps indentation and code blocks intact', () => {
    const markdown = '- item\n    - nested\n\n```py\ndef f():\n    return  1\n```';
    expect(normalizeWhitespace(markdown)).toBe(markdown);
  });
});

describe('truncateToTokens', () => {
  it('returns short text unchanged', () => {
    expect(truncateToTokens('short text', 100)).toBe('short text');
  });

  it('cuts long text to the budget, preferring a paragraph boundary', () => {
    const text = `${'First paragraph sentence. '.repeat(20)}\n\n${'Second paragraph. '.repeat(40)}`;
    const cut = truncateToTokens(text, 150);
    expect(estimateTokens(cut)).toBeLessThanOrEqual(150);
    expect(cut.length).toBeGreaterThan(300);
  });
});

describe('URL helpers', () => {
  it('recognizes local addresses', () => {
    expect(isLocalUrl('http://localhost:11434/v1')).toBe(true);
    expect(isLocalUrl('http://127.0.0.1:8080/v1')).toBe(true);
    expect(isLocalUrl('https://api.groq.com/openai/v1')).toBe(false);
    expect(isLocalUrl('not a url')).toBe(false);
  });

  it('builds origin match patterns without ports', () => {
    expect(originPattern('http://localhost:11434/v1')).toBe('http://localhost/*');
    expect(originPattern('https://example.com/a/b')).toBe('https://example.com/*');
    expect(originPattern('chrome://settings')).toBeUndefined();
  });

  it('reads hostnames safely', () => {
    expect(hostnameOf('https://www.example.com/x')).toBe('www.example.com');
    expect(hostnameOf('')).toBeUndefined();
    expect(hostnameOf('nope')).toBeUndefined();
  });
});
