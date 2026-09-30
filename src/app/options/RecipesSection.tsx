import { ArrowDown, ArrowUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, IconButton, TextInput } from '@/components/ui';
import {
  BUILTIN_RECIPES,
  exportRecipes,
  recipeById,
  toCustomRecipe,
  validateRecipe,
  type Recipe,
} from '@/core/recipes';
import { randomId } from '@/lib/text';
import { updateSettings, type Settings } from '@/storage/settings';
import { recipeLabel, t } from '../shared/i18n';

const MODES: { value: Recipe['mode']; label: () => string }[] = [
  { value: 'reduce', label: () => t('quick.modeReduce') },
  { value: 'transform', label: () => t('quick.modeTransform') },
  { value: 'qa', label: () => t('quick.modeQa') },
];

const EMPTY = {
  id: '',
  label: '',
  prompt: '',
  input: 'page' as Recipe['input'],
  mode: 'reduce' as Recipe['mode'],
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Quick actions: which ones the panel shows, and the user's own. */
export function RecipesSection({ settings }: { settings: Settings }) {
  const [draft, setDraft] = useState(EMPTY);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string }>();
  const fileInput = useRef<HTMLInputElement>(null);
  const custom = settings.customRecipes;
  const shown = settings.quickActions
    .map((id) => recipeById(id, custom))
    .filter((recipe): recipe is Recipe => recipe !== undefined);
  const hidden = [...BUILTIN_RECIPES, ...custom].filter(
    (recipe) => !settings.quickActions.includes(recipe.id),
  );

  const setShown = (ids: string[]) => void updateSettings({ quickActions: ids });
  const move = (index: number, direction: -1 | 1) => {
    const ids = [...settings.quickActions];
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
    setShown(ids);
  };

  const save = async () => {
    const error = validateRecipe(draft);
    if (error) {
      setMessage({ tone: 'error', text: error });
      return;
    }
    const recipe = toCustomRecipe(draft, draft.id || randomId('custom-'));
    await updateSettings((current) => ({
      customRecipes: draft.id
        ? current.customRecipes.map((item) => (item.id === draft.id ? recipe : item))
        : [...current.customRecipes, recipe],
      quickActions: current.quickActions.includes(recipe.id)
        ? current.quickActions
        : [...current.quickActions, recipe.id],
    }));
    setDraft(EMPTY);
    setMessage({ tone: 'ok', text: t('quick.saved', { label: recipe.label }) });
  };

  const remove = (id: string) =>
    void updateSettings((current) => ({
      customRecipes: current.customRecipes.filter((recipe) => recipe.id !== id),
      quickActions: current.quickActions.filter((recipeId) => recipeId !== id),
    }));

  const importFile = async (file: File) => {
    setMessage(undefined);
    try {
      const data: unknown = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : [data];
      for (const item of list) {
        const error = validateRecipe(item);
        if (error) throw new Error(error);
      }
      const recipes = list.map((item) =>
        toCustomRecipe(item as Partial<Recipe>, randomId('custom-')),
      );
      await updateSettings((current) => ({
        customRecipes: [...current.customRecipes, ...recipes],
        quickActions: [...current.quickActions, ...recipes.map((recipe) => recipe.id)],
      }));
      setMessage({ tone: 'ok', text: t('quick.imported', recipes.length) });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: t('quick.importFailed', { error: (error as Error).message }),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">{t('quick.shown')}</h3>
        <ul className="mt-2 divide-y divide-line rounded-[14px] border border-line bg-surface">
          {shown.map((recipe, index) => (
            <li key={recipe.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                {recipeLabel(recipe)}
                {recipe.custom && (
                  <span className="ml-2 text-[0.74rem] text-muted">{t('quick.yours')}</span>
                )}
              </span>
              <IconButton
                label={t('quick.moveUp', { label: recipeLabel(recipe) })}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp className="h-4 w-4" />
              </IconButton>
              <IconButton
                label={t('quick.moveDown', { label: recipeLabel(recipe) })}
                disabled={index === shown.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </IconButton>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShown(settings.quickActions.filter((id) => id !== recipe.id))}
              >
                {t('quick.hide')}
              </Button>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">{t('quick.noneShown')}</li>
          )}
        </ul>
      </div>

      {hidden.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">{t('quick.notShown')}</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {hidden.map((recipe) => (
              <li key={recipe.id}>
                <button
                  type="button"
                  onClick={() => setShown([...settings.quickActions, recipe.id])}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-[0.8rem] font-medium hover:border-local hover:text-local"
                >
                  {t('quick.show', { label: recipeLabel(recipe) })}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {custom.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">{t('quick.yoursTitle')}</h3>
          <ul className="mt-2 divide-y divide-line rounded-[14px] border border-line bg-surface">
            {custom.map((recipe) => (
              <li key={recipe.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{recipe.label}</span>
                  <span className="block truncate text-[0.76rem] text-muted">{recipe.prompt}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraft({
                      id: recipe.id,
                      label: recipe.label,
                      prompt: recipe.prompt,
                      input: recipe.input,
                      mode: recipe.mode,
                    })
                  }
                >
                  {t('quick.edit')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(recipe.id)}>
                  {t('common.delete')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        className="space-y-3 rounded-[14px] border border-line bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h3 className="text-sm font-semibold">
          {draft.id ? t('quick.editTitle', { label: draft.label }) : t('quick.newTitle')}
        </h3>
        <label className="block text-[0.84rem]">
          <span className="mb-1 block font-medium">{t('quick.name')}</span>
          <TextInput
            value={draft.label}
            maxLength={40}
            onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            placeholder={t('quick.namePlaceholder')}
          />
        </label>
        <label className="block text-[0.84rem]">
          <span className="mb-1 block font-medium">{t('quick.prompt')}</span>
          <textarea
            value={draft.prompt}
            onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
            rows={4}
            placeholder={t('quick.promptPlaceholder')}
            className="w-full rounded-[10px] border border-line bg-surface p-3 text-sm focus:border-local focus:outline-none"
          />
          <span className="mt-1 block text-muted">
            {t('quick.promptNote', { token: '{{language}}' })}
          </span>
        </label>
        <fieldset className="text-[0.84rem]">
          <legend className="mb-1 font-medium">{t('quick.reads')}</legend>
          {(['page', 'selection'] as const).map((input) => (
            <label key={input} className="mr-4 inline-flex items-center gap-1.5">
              <input
                type="radio"
                name="recipe-input"
                checked={draft.input === input}
                onChange={() => setDraft({ ...draft, input })}
                className="accent-[var(--color-local)]"
              />
              {input === 'page' ? t('quick.readsPage') : t('quick.readsSelection')}
            </label>
          ))}
        </fieldset>
        <label className="block text-[0.84rem]">
          <span className="mb-1 block font-medium">{t('quick.longPages')}</span>
          <select
            value={draft.mode}
            onChange={(event) => setDraft({ ...draft, mode: event.target.value as Recipe['mode'] })}
            className="h-9 w-full rounded-[10px] border border-line bg-surface px-2 text-sm"
          >
            {MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label()}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary">
            {draft.id ? t('quick.saveChanges') : t('quick.add')}
          </Button>
          {draft.id && (
            <Button variant="ghost" onClick={() => setDraft(EMPTY)}>
              {t('common.cancel')}
            </Button>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => fileInput.current?.click()}>{t('quick.import')}</Button>
        <Button
          disabled={custom.length === 0}
          onClick={() => download('localpulse-quick-actions.json', exportRecipes(custom))}
        >
          {t('quick.export')}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = '';
          }}
        />
      </div>
      <p className="text-[0.8rem] text-muted">{t('quick.community')}</p>
      {message && (
        <p
          role="status"
          className={message.tone === 'ok' ? 'text-sm text-local' : 'text-sm text-danger'}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
