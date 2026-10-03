import type { Privacy, SummaryType } from '@/providers/types';
import builtinRecipes from '@/recipes/builtin.json';
import { languageName } from './prompts';

export const RECIPE_CATEGORIES = ['research', 'learn', 'work', 'write', 'code', 'custom'] as const;
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

/**
 * A quick action. Built-in ones and user recipes share this format, so contributors can add one
 * without code.
 */
export interface Recipe {
  id: string;
  label: string;
  /** Icon name from lucide (kebab-case). */
  icon?: string;
  /** Library group. User recipes always appear under "custom". */
  category?: RecipeCategory;
  /** What the recipe reads. "selection" falls back to the page when nothing is selected. */
  input: 'page' | 'selection' | 'none';
  /**
   * How long content is handled: "reduce" summarizes it in parts, "transform" processes each part
   * and joins the results (translation), "qa" picks the relevant sections.
   */
  mode: 'reduce' | 'transform' | 'qa';
  /** The instruction. `{{language}}` becomes the answer language. */
  prompt: string;
  /** Lets the built-in Summarizer API handle this recipe. */
  summary?: { type: SummaryType; length: 'short' | 'medium' | 'long' };
  /** Privacy level or provider id to prefer for this recipe. */
  prefer?: Privacy | string;
  /** True for recipes the user created. */
  custom?: boolean;
}

export const BUILTIN_RECIPES: readonly Recipe[] = builtinRecipes as Recipe[];

export function recipeById(id: string, custom: readonly Recipe[] = []): Recipe | undefined {
  return [...BUILTIN_RECIPES, ...custom].find((recipe) => recipe.id === id);
}

/** Built-ins followed by user actions, with one action per id (built-ins take precedence). */
export function recipeLibrary(custom: readonly Recipe[] = []): Recipe[] {
  const seen = new Set<string>();
  return [...BUILTIN_RECIPES, ...custom].filter((recipe) => {
    if (seen.has(recipe.id)) return false;
    seen.add(recipe.id);
    return true;
  });
}

export function recipeCategory(recipe: Recipe): RecipeCategory {
  return recipe.custom ? 'custom' : (recipe.category ?? 'research');
}

/** Search can include translated labels and descriptions supplied by the UI. */
export function filterRecipes(
  recipes: readonly Recipe[],
  query: string,
  category?: RecipeCategory,
  searchText: (recipe: Recipe) => string = (recipe) => `${recipe.label} ${recipe.prompt}`,
): Recipe[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return recipes.filter(
    (recipe) =>
      (!category || recipeCategory(recipe) === category) &&
      words.every((word) => searchText(recipe).toLocaleLowerCase().includes(word)),
  );
}

/** Toggling a pin preserves toolbar order and removes duplicate copies of an unpinned id. */
export function toggleQuickAction(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

/** A free-form question behaves like a recipe that picks the relevant sections of long pages. */
export function questionRecipe(question: string): Recipe {
  return { id: 'question', label: 'Question', input: 'page', mode: 'qa', prompt: question };
}

/** Checks a recipe from an imported file. Returns an error message, or undefined if it's valid. */
export function validateRecipe(value: unknown): string | undefined {
  const recipe = value as Partial<Recipe> | null;
  if (!recipe || typeof recipe !== 'object') return 'Not a recipe object.';
  if (typeof recipe.label !== 'string' || !recipe.label.trim()) return 'A recipe needs a label.';
  if (typeof recipe.prompt !== 'string' || !recipe.prompt.trim()) return 'A recipe needs a prompt.';
  if (recipe.input !== undefined && !['page', 'selection', 'none'].includes(recipe.input)) {
    return `"${recipe.label}": input must be page, selection or none.`;
  }
  if (recipe.mode !== undefined && !['reduce', 'transform', 'qa'].includes(recipe.mode)) {
    return `"${recipe.label}": mode must be reduce, transform or qa.`;
  }
  if (recipe.prompt.length > 4000) return `"${recipe.label}": the prompt is too long.`;
  return undefined;
}

/** Turns imported data into a user recipe with a fresh id. */
export function toCustomRecipe(value: Partial<Recipe>, id: string): Recipe {
  return {
    id,
    label: (value.label ?? '').trim().slice(0, 40),
    prompt: (value.prompt ?? '').trim(),
    input: value.input ?? 'page',
    mode: value.mode ?? 'reduce',
    icon: typeof value.icon === 'string' ? value.icon : 'sparkles',
    custom: true,
  };
}

/** Recipes in the export format: everything except the id and the custom flag. */
export function exportRecipes(recipes: readonly Recipe[]): string {
  return JSON.stringify(
    recipes.map(({ label, prompt, input, mode, icon }) => ({ label, prompt, input, mode, icon })),
    null,
    2,
  );
}

export function fillRecipePrompt(recipe: Recipe, language: string): string {
  return recipe.prompt.replace(/\{\{\s*language\s*\}\}/g, languageName(language));
}
