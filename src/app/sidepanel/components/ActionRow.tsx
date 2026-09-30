import {
  Baby,
  Code,
  Columns2,
  FileText,
  Languages,
  Lightbulb,
  List,
  ListChecks,
  PenLine,
  Sparkles,
  SpellCheck,
  type LucideIcon,
} from 'lucide-react';
import { recipeById, type Recipe } from '@/core/recipes';
import { DEFAULT_SETTINGS } from '@/storage/settings';
import { recipeLabel, t } from '../../shared/i18n';
import { usePanel } from '../store';

export const RECIPE_ICONS: Record<string, LucideIcon> = {
  'file-text': FileText,
  list: List,
  code: Code,
  baby: Baby,
  'list-checks': ListChecks,
  languages: Languages,
  lightbulb: Lightbulb,
  'pen-line': PenLine,
  'spell-check': SpellCheck,
  sparkles: Sparkles,
  columns: Columns2,
};

/** Offered whenever the selected text is in a text field, where the result can replace it. */
const WRITING_TOOLS = ['proofread', 'rewrite'];

/** Quick actions as chips. */
export function ActionRow() {
  const runRecipe = usePanel((state) => state.runRecipe);
  const busy = usePanel((state) => state.busy);
  const status = usePanel((state) => state.tab.status);
  const quickActions = usePanel((state) => state.settings?.quickActions);
  const customRecipes = usePanel((state) => state.settings?.customRecipes);
  const hasFile = usePanel((state) => state.file !== null);
  const disabled = busy || (status === 'no-access' && !hasFile);
  const hasExtraTabs = usePanel((state) => state.extraTabs.length > 0);
  const editing = usePanel(
    (state) => state.file === null && Boolean(state.tab.page?.selectionEditable),
  );
  const ids = quickActions ?? DEFAULT_SETTINGS.quickActions;
  // Text selected in a field: offer the writing tools first. With several tabs, offer Compare.
  const first = [...(editing ? WRITING_TOOLS : []), ...(hasExtraTabs ? ['compare'] : [])].filter(
    (id) => !ids.includes(id),
  );
  const recipes = [...first, ...ids]
    .map((id) => recipeById(id, customRecipes))
    .filter((recipe): recipe is Recipe => recipe !== undefined);
  if (recipes.length === 0) return null;

  return (
    <nav
      aria-label={t('actions.label')}
      className="flex flex-wrap gap-1.5 border-b border-line bg-surface px-3 py-2.5"
    >
      {recipes.map((recipe) => {
        const Icon = (recipe.icon && RECIPE_ICONS[recipe.icon]) || Sparkles;
        return (
          <button
            key={recipe.id}
            type="button"
            disabled={disabled}
            onClick={() => void runRecipe(recipe.id)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[0.8rem] font-medium transition-colors hover:border-local hover:text-local disabled:pointer-events-none disabled:opacity-45"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {recipeLabel(recipe)}
          </button>
        );
      })}
    </nav>
  );
}
