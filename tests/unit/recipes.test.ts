import { describe, expect, it } from 'vitest';
import {
  BUILTIN_RECIPES,
  exportRecipes,
  fillRecipePrompt,
  filterRecipes,
  questionRecipe,
  recipeById,
  recipeCategory,
  recipeLibrary,
  toCustomRecipe,
  toggleQuickAction,
  validateRecipe,
  type Recipe,
} from '@/core/recipes';

const custom = toCustomRecipe(
  { label: 'Budget helper', prompt: 'Extract costs and uncertainties from the page.' },
  'custom-budget',
);

describe('action library', () => {
  it('finds translated labels as well as task terms, combining query words and categories', () => {
    const recipes = recipeLibrary([custom]);
    const label = (recipe: Recipe) =>
      recipe.id === 'flashcards'
        ? 'Cartes mémoire pour étudier'
        : `${recipe.label} ${recipe.prompt}`;
    expect(
      filterRecipes(recipes, '  MÉMOIRE cartes  ', 'learn', label).map((recipe) => recipe.id),
    ).toEqual(['flashcards']);
    expect(filterRecipes(recipes, 'memoire', 'work', label)).toEqual([]);
    expect(filterRecipes(recipes, ' COSTS uncertainties ', 'custom')).toEqual([custom]);
    expect(filterRecipes(recipes, '', 'custom')).toEqual([custom]);
  });

  it('preserves built-in precedence when custom data duplicates an id', () => {
    const collision = { ...custom, id: 'summarize' };
    const recipes = recipeLibrary([collision, custom, custom]);
    expect(recipes.filter((recipe) => recipe.id === 'summarize')).toEqual([
      recipeById('summarize'),
    ]);
    expect(recipes.filter((recipe) => recipe.id === custom.id)).toEqual([custom]);
    expect(recipeById('summarize', [collision])).toBe(recipeById('summarize'));
  });

  it('uses user category regardless of imported category metadata', () => {
    expect(recipeCategory({ ...custom, category: 'work' })).toBe('custom');
    expect(recipeCategory(recipeById('code-review') as Recipe)).toBe('code');
  });

  it('toggles pins without changing the order of other actions or mutating settings', () => {
    const ids = ['summarize', 'custom-budget', 'translate', 'custom-budget'];
    expect(toggleQuickAction(ids, 'custom-budget')).toEqual(['summarize', 'translate']);
    expect(toggleQuickAction(ids, 'quiz')).toEqual([...ids, 'quiz']);
    expect(ids).toEqual(['summarize', 'custom-budget', 'translate', 'custom-budget']);
  });
});

describe('recipe contracts', () => {
  it('keeps summary, translation, writing and question handling intact', () => {
    expect(recipeById('summarize')?.summary).toEqual({ type: 'tldr', length: 'medium' });
    expect(recipeById('key-points')?.summary).toEqual({ type: 'key-points', length: 'medium' });
    expect(recipeById('translate')?.mode).toBe('transform');
    expect(fillRecipePrompt(recipeById('translate') as Recipe, 'fr')).toContain('into French');
    expect(fillRecipePrompt(recipeById('email-reply') as Recipe, 'bn')).toContain('in Bangla');
    expect(recipeById('proofread')?.mode).toBe('transform');
    expect(recipeById('rewrite')?.mode).toBe('transform');
    expect(questionRecipe('What changed?').mode).toBe('qa');
  });

  it('exports custom prompts and execution modes without executable or provider metadata', () => {
    const imported = {
      label: '  Draft  ',
      prompt: '  Write in {{language}}.  ',
      input: 'selection' as const,
      mode: 'transform' as const,
      prefer: 'ep:untrusted',
      summary: { type: 'tldr' as const, length: 'short' as const },
    };
    expect(validateRecipe(imported)).toBeUndefined();
    const recipe = toCustomRecipe(imported, 'custom-draft');
    expect(recipe.prefer).toBeUndefined();
    expect(recipe.summary).toBeUndefined();
    const [value] = JSON.parse(exportRecipes([recipe])) as Partial<Recipe>[];
    expect(validateRecipe(value)).toBeUndefined();
    expect(toCustomRecipe(value as Partial<Recipe>, 'custom-copy')).toEqual({
      ...recipe,
      id: 'custom-copy',
    });
    expect(exportRecipes([recipe])).not.toContain('custom-draft');
  });

  it('rejects malformed imports before they can be saved', () => {
    for (const value of [
      null,
      [],
      {},
      { label: 'x', prompt: '' },
      { label: 'x', prompt: 'x', mode: 'execute' },
      { label: 'x', prompt: 'x', input: 'url' },
      { label: 'x', prompt: 'x'.repeat(4001) },
    ]) {
      expect(validateRecipe(value)).toBeDefined();
    }
  });

  it('ships distinct source-analysis actions without external verification claims', () => {
    const ids = BUILTIN_RECIPES.map((recipe) => recipe.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(recipeById('evidence-gaps')?.prompt).toContain('not independent fact verification');
    expect(recipeById('code-review')?.prompt).toContain(
      'Do not claim to have executed code or tests',
    );
    expect(recipeById('extract-table')?.prompt).toContain('Do not estimate or fabricate rows');
  });
});
