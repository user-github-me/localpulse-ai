import { useEffect } from 'react';
import { browser } from '#imports';
import { languageName } from '@/core/prompts';
import { applyTheme } from '@/lib/theme';
import { updateSettings, type Settings, type ThemeSetting } from '@/storage/settings';
import { t } from '../shared/i18n';
import { useSettings } from '../shared/useSettings';
import { PrivacySection } from './PrivacySection';
import { ProvidersSection } from './ProvidersSection';
import { RecipesSection } from './RecipesSection';

const ANSWER_LANGUAGES = [
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'nl',
  'pl',
  'tr',
  'ru',
  'uk',
  'ar',
  'hi',
  'bn',
  'ur',
  'id',
  'vi',
  'th',
  'zh',
  'ja',
  'ko',
];

const SECTIONS = [
  { id: 'providers', title: () => t('options.providers') },
  { id: 'quick-actions', title: () => t('options.quickActions') },
  { id: 'privacy', title: () => t('options.privacy') },
  { id: 'answers', title: () => t('options.answers') },
  { id: 'about', title: () => t('options.about') },
];

export function Options() {
  const settings = useSettings();

  const theme = settings?.theme;
  useEffect(() => (theme ? applyTheme(theme) : undefined), [theme]);

  useEffect(() => {
    if (!settings) return;
    const target = location.hash.slice(1);
    if (target) document.getElementById(target)?.scrollIntoView();
    // Only once, when settings first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(settings)]);

  if (!settings) return null;

  return (
    <div className="mx-auto flex max-w-5xl gap-10 px-6 py-10">
      <nav
        aria-label={t('options.sections')}
        className="sticky top-10 hidden h-fit w-48 flex-none md:block"
      >
        <p className="mb-3 text-sm font-semibold">{t('options.title')}</p>
        <ul className="space-y-1 text-[0.86rem]">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="block rounded-md px-2 py-1 text-muted hover:bg-line/50 hover:text-ink"
              >
                {section.title()}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <main className="min-w-0 max-w-2xl flex-1 space-y-14">
        <Section id="providers" title={t('options.providers')}>
          <ProvidersSection settings={settings} />
        </Section>
        <Section id="quick-actions" title={t('options.quickActions')}>
          <RecipesSection settings={settings} />
        </Section>
        <Section id="privacy" title={t('options.privacy')}>
          <PrivacySection settings={settings} />
        </Section>
        <Section id="answers" title={t('options.answers')}>
          <AnswersSection settings={settings} />
        </Section>
        <Section id="about" title={t('options.about')}>
          <About />
        </Section>
      </main>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-8">
      <h2 id={`${id}-title`} className="mb-4 font-serif text-[1.4rem] leading-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function AnswersSection({ settings }: { settings: Settings }) {
  const browserLanguage = navigator.language;
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="block">
        <span className="text-sm font-semibold">{t('options.answerLanguage')}</span>
        <select
          value={settings.answerLanguage}
          onChange={(event) => void updateSettings({ answerLanguage: event.target.value })}
          className="mt-2 h-9 w-full rounded-[10px] border border-line bg-surface px-2 text-sm"
        >
          <option value="auto">
            {t('options.sameAsBrowser', { language: languageName(browserLanguage) })}
          </option>
          {ANSWER_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {languageName(code)}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-[0.8rem] text-muted">
          {t('options.answerLanguageNote')}
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-semibold">{t('options.theme')}</span>
        <select
          value={settings.theme}
          onChange={(event) => void updateSettings({ theme: event.target.value as ThemeSetting })}
          className="mt-2 h-9 w-full rounded-[10px] border border-line bg-surface px-2 text-sm"
        >
          <option value="system">{t('options.themeSystem')}</option>
          <option value="light">{t('options.themeLight')}</option>
          <option value="dark">{t('options.themeDark')}</option>
        </select>
      </label>
    </div>
  );
}

function About() {
  const version = browser.runtime.getManifest().version;
  return (
    <div className="space-y-2 text-[0.88rem] leading-relaxed">
      <p>{t('options.aboutVersion', { version })}</p>
      <p className="text-muted">{t('options.aboutPrivacy')}</p>
      <p>
        <a
          href={browser.runtime.getURL('/onboarding.html')}
          className="text-local underline underline-offset-2"
        >
          {t('options.showWelcome')}
        </a>
      </p>
    </div>
  );
}
