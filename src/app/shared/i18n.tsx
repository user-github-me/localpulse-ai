import { Fragment, type ReactNode } from 'react';
import { i18n } from '#i18n';
import type { Recipe } from '@/core/recipes';

/** UI text from src/locales/<language>.yml, in the browser's language. */
export const t = i18n.t;

const RECIPE_KEYS: Record<string, string> = {
  summarize: 'recipes.summarize',
  'key-points': 'recipes.keyPoints',
  'explain-code': 'recipes.explainCode',
  simplify: 'recipes.simplify',
  'action-items': 'recipes.actionItems',
  translate: 'recipes.translate',
  explain: 'recipes.explain',
  rewrite: 'recipes.rewrite',
  proofread: 'recipes.proofread',
  compare: 'recipes.compare',
};

/** A quick action's name: translated for built-in ones, as written for the user's own. */
export function recipeLabel(recipe: Pick<Recipe, 'id' | 'label' | 'custom'>): string {
  const key = recipe.custom ? undefined : RECIPE_KEYS[recipe.id];
  return (key && (i18n.t as (key: string) => string)(key)) || recipe.label;
}

/**
 * Puts React nodes into {placeholders} of a translated sentence, so a sentence with bold text
 * stays one message for translators.
 */
export function withNodes(message: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return message.split(/(\{\w+\})/g).map((part, index) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={index}>{name && name in nodes ? nodes[name] : part}</Fragment>;
  });
}

export function formatNumber(value: number): string {
  return value.toLocaleString();
}
