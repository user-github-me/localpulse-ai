import type { ThemeSetting } from '@/storage/settings';

/** Sets data-theme on <html> from the setting, following the system when it's "system". */
export function applyTheme(setting: ThemeSetting): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const update = () => {
    const dark = setting === 'dark' || (setting === 'system' && media.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  };
  update();
  if (setting !== 'system') return () => {};
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}
