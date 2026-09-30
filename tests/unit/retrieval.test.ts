import { describe, expect, it } from 'vitest';
import { bm25Scores, selectRelevantSections, tokenize } from '@/core/retrieval';

const sections = [
  'Introduction to the solar system and planets.',
  'Mars is the fourth planet. Mars has two moons, Phobos and Deimos.',
  'Jupiter is the largest planet, a gas giant with a great red spot.',
  'Venus has a thick atmosphere of carbon dioxide.',
  'Saturn has rings made of ice and rock.',
];

describe('tokenize', () => {
  it('lowercases, drops stop words and short tokens', () => {
    expect(tokenize('What are the MOONS of Mars?')).toEqual(['moons', 'mars']);
  });

  it('keeps non-Latin words', () => {
    expect(tokenize('মঙ্গল গ্রহ')).toHaveLength(2);
  });

  it('splits words at apostrophes and periods, so "user" finds "user\'s"', () => {
    expect(tokenize("The user's settings, e.g. the app’s theme")).toEqual([
      'user',
      'settings',
      'app',
      'theme',
    ]);
  });
});

describe('bm25Scores', () => {
  it('ranks the section about the question highest', () => {
    const scores = bm25Scores(sections, 'How many moons does Mars have?');
    const best = scores.indexOf(Math.max(...scores));
    expect(best).toBe(1);
  });
});

describe('selectRelevantSections', () => {
  it('includes the intro and the best match within the budget, in page order', () => {
    const result = selectRelevantSections(sections, 'moons of Mars', 30);
    expect(result.indexes).toEqual([0, 1]);
    expect(result.total).toBe(5);
    expect(result.text.indexOf('Introduction')).toBeLessThan(result.text.indexOf('Mars'));
  });

  it('marks gaps between non-adjacent sections', () => {
    const result = selectRelevantSections(sections, 'Saturn rings', 30);
    expect(result.indexes).toContain(4);
    expect(result.text).toContain('[…]');
  });

  it('falls back to the start of the page when nothing matches', () => {
    const result = selectRelevantSections(sections, 'zebra', 25);
    expect(result.indexes[0]).toBe(0);
  });
});

describe('tokenize in languages without spaces', () => {
  it('splits Chinese into words, so questions find the right section', () => {
    const tokens = tokenize('您在AirTCP申请了密码重置');
    expect(tokens.length).toBeGreaterThan(3);
    expect(tokens).toContain('密码');
    const chinese = [
      '这篇文章介绍了公司的历史和团队。',
      '密码重置：点击邮件里的链接，然后输入新密码。',
      '联系我们：请发送邮件到客服邮箱。',
    ];
    const scores = bm25Scores(chinese, '怎么重置密码');
    expect(scores.indexOf(Math.max(...scores))).toBe(1);
  });
});
