import { Pin, PinOff, Search } from 'lucide-react';
import { useState } from 'react';
import { Button, Dialog, IconButton, TextInput } from '@/components/ui';
import {
  filterRecipes,
  RECIPE_CATEGORIES,
  recipeLibrary,
  toggleQuickAction,
  type Recipe,
  type RecipeCategory,
} from '@/core/recipes';
import { DEFAULT_SETTINGS, updateSettings } from '@/storage/settings';
import { recipeLabel, t } from '../../shared/i18n';
import { usePanel } from '../store';

const DESCRIPTION_KEYS: Record<string, string> = {
  summarize: 'actionDescriptions.summarize',
  'key-points': 'actionDescriptions.keyPoints',
  'explain-code': 'actionDescriptions.explainCode',
  simplify: 'actionDescriptions.simplify',
  'action-items': 'actionDescriptions.actionItems',
  translate: 'actionDescriptions.translate',
  explain: 'actionDescriptions.explain',
  rewrite: 'actionDescriptions.rewrite',
  proofread: 'actionDescriptions.proofread',
  compare: 'actionDescriptions.compare',
  'research-brief': 'actionDescriptions.researchBrief',
  'evidence-gaps': 'actionDescriptions.evidenceGaps',
  'study-guide': 'actionDescriptions.studyGuide',
  flashcards: 'actionDescriptions.flashcards',
  quiz: 'actionDescriptions.quiz',
  glossary: 'actionDescriptions.glossary',
  'decision-brief': 'actionDescriptions.decisionBrief',
  'extract-table': 'actionDescriptions.extractTable',
  'code-review': 'actionDescriptions.codeReview',
  'meeting-notes': 'actionDescriptions.meetingNotes',
  'email-reply': 'actionDescriptions.emailReply',
  timeline: 'actionDescriptions.timeline',
  'argument-map': 'actionDescriptions.argumentMap',
  'discussion-questions': 'actionDescriptions.discussionQuestions',
};

function description(recipe: Recipe): string {
  const key = !recipe.custom && DESCRIPTION_KEYS[recipe.id];
  return key ? (t as (key: string) => string)(key) : recipe.prompt;
}

export function categoryLabel(category: RecipeCategory): string {
  return (t as (key: string) => string)(`actionLibrary.${category}`);
}

/** Browse every action without filling the toolbar; pins are saved only on this device. */
export function ActionLibrary({
  open,
  onClose,
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  disabled: boolean;
}) {
  const settings = usePanel((state) => state.settings);
  const runRecipe = usePanel((state) => state.runRecipe);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<RecipeCategory | ''>('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const ids = settings?.quickActions ?? DEFAULT_SETTINGS.quickActions;
  const recipes = recipeLibrary(settings?.customRecipes);
  const results = filterRecipes(
    recipes,
    query,
    category || undefined,
    (recipe) => `${recipeLabel(recipe)} ${description(recipe)} ${recipe.prompt}`,
  );

  const togglePin = async (id: string) => {
    setSaving(true);
    setFailed(false);
    try {
      await updateSettings((current) => ({
        quickActions: toggleQuickAction(current.quickActions, id),
      }));
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t('actionLibrary.title')}>
      <p className="text-[0.8rem] text-muted">{t('actionLibrary.note')}</p>
      <label className="relative mt-3 block">
        <span className="sr-only">{t('actionLibrary.search')}</span>
        <Search
          className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted"
          aria-hidden
        />
        <TextInput
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('actionLibrary.searchPlaceholder')}
          className="pl-9"
        />
      </label>
      <label className="mt-2 flex items-center gap-2 text-[0.8rem]">
        <span>{t('actionLibrary.category')}</span>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as RecipeCategory | '')}
          className="h-9 min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-2 text-sm"
        >
          <option value="">{t('actionLibrary.all')}</option>
          {RECIPE_CATEGORIES.map((group) => (
            <option key={group} value={group}>
              {categoryLabel(group)}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-3 text-[0.76rem] text-muted" role="status">
        {t('actionLibrary.results', results.length)}
      </p>
      <ul
        aria-label={t('actionLibrary.list')}
        className="mt-2 max-h-[42vh] space-y-2 overflow-y-auto"
      >
        {results.map((recipe) => {
          const pinned = ids.includes(recipe.id);
          const label = recipeLabel(recipe);
          return (
            <li key={recipe.id} className="rounded-[10px] border border-line p-3">
              <h3 className="text-sm font-semibold [overflow-wrap:anywhere]">{label}</h3>
              <p className="mt-1 text-[0.78rem] text-muted [overflow-wrap:anywhere]">
                {description(recipe)}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  disabled={disabled}
                  aria-label={t('actionLibrary.runLabel', { label })}
                  onClick={() => {
                    onClose();
                    void runRecipe(recipe.id);
                  }}
                >
                  {t('actionLibrary.run')}
                </Button>
                <IconButton
                  label={t(pinned ? 'actionLibrary.unpin' : 'actionLibrary.pin', { label })}
                  aria-pressed={pinned}
                  disabled={saving}
                  onClick={() => void togglePin(recipe.id)}
                >
                  {pinned ? (
                    <PinOff className="h-4 w-4" aria-hidden />
                  ) : (
                    <Pin className="h-4 w-4" aria-hidden />
                  )}
                </IconButton>
              </div>
            </li>
          );
        })}
      </ul>
      {results.length === 0 && (
        <p className="mt-3 text-sm text-muted">{t('actionLibrary.empty')}</p>
      )}
      {failed && (
        <p role="status" className="mt-3 text-sm text-danger">
          {t('actionLibrary.saveFailed')}
        </p>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </Dialog>
  );
}
