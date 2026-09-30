import { create } from 'zustand';
import { browser } from '#imports';
import { conversationHistory, sourceKey, UNKNOWN_SOURCE } from '@/core/conversation';
import {
  decodeAddress,
  hasPlaceholder,
  isNeverCloudSite,
  Redactor,
  redactPage,
  type HiddenValue,
} from '@/core/privacy';
import { checkQuotes, type CheckedQuote } from '@/core/quotes';
import { stripPageTags, type PromptPage } from '@/core/prompts';
import { fillRecipePrompt, questionRecipe, recipeById, type Recipe } from '@/core/recipes';
import { route, type RouteDecision, type RoutePolicy } from '@/core/router';
import { runTurn, type TurnStatus, type TurnStrategy } from '@/core/run';
import type { ExtractedPage } from '@/extractors/types';
import { errorMessage, isAbortError, ProviderError } from '@/lib/errors';
import { countWords, hostnameOf, originPattern, randomId } from '@/lib/text';
import { presetById } from '@/providers/presets';
import { createProviders, orderProviders } from '@/providers/registry';
import type { Privacy, Provider, ProviderState, TaskKind } from '@/providers/types';
import { getConsent, grantConsent } from '@/storage/consent';
import { conversationTitle, getConversation, saveConversation } from '@/storage/history';
import { pendingActionItem, takePendingAction, type PendingAction } from '@/storage/pending';
import {
  getSettings,
  resolveAnswerLanguage,
  updateSettings,
  watchSettings,
  type Settings,
} from '@/storage/settings';
import { hasFirefoxDataConsent } from '../shared/firefox';
import { recipeLabel, t } from '../shared/i18n';
import { canOpenFile, PdfAccessError, readFile, readPdfFromUrl } from './documents';
import { activeTabId, forcedTabId, readTab, type TabContext } from './tab-context';

export interface ItemContext {
  title: string;
  url: string;
  source: 'page' | 'selection';
  /** The selection was in a text field of this tab, so a rewrite can replace it. */
  editableTabId?: number;
  /** That selection's exact text: Replace only overwrites the same text, on the same page. */
  editableText?: string;
  /** Set when the content came from several tabs. */
  tabCount?: number;
}

export interface ChatItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Quick action label for user items, e.g. "Summarize". */
  actionLabel?: string;
  context?: ItemContext;
  /** The instruction sent to the model, reused for hand-off and retry. */
  instruction?: string;
  recipeId?: string;
  state?: 'streaming' | 'done' | 'stopped' | 'error';
  providerLabel?: string;
  privacy?: Privacy;
  /** Progress for long pages, e.g. "Reading part 2 of 5…". */
  status?: string;
  error?: string;
  /** Explains a provider switch after a failure. */
  notice?: string;
  strategy?: TurnStrategy;
  partsUsed?: number;
  partsTotal?: number;
  redactions?: number;
  /** Quotes in the answer, checked against the page (core/quotes.ts). */
  quotes?: CheckedQuote[];
  /** The provider that wrote an answer, and its server (core/conversation.ts, providerKey). */
  providerKey?: string;
  /** Text chosen outside the panel for this request, so Try again uses it too. Not saved. */
  selection?: SelectionSource;
  /**
   * The tab an action started from (right-click, shortcut), so Try again reads that tab again, not
   * a file open in the panel. Not saved.
   */
  fromTabId?: number;
  /** Where an answer's content came from, including earlier turns (core/conversation.ts). */
  sources?: string[];
  /** Earlier turns not sent with this question because they may not go to its provider. */
  leftOut?: number;
  /** A rewrite, proofread or translation: its single line breaks are part of the text. */
  lineBreaks?: boolean;
  /** Values a cloud provider saw as placeholders, which the answer shows again. */
  hidden?: HiddenValue[];
  /**
   * A rewrite or translation that lost a hidden value, e.g. its placeholder was translated: Replace
   * would put a placeholder into the page.
   */
  unrestored?: boolean;
}

/** Text chosen outside the panel, with the address of the page it's on. */
export interface SelectionSource {
  text: string;
  url?: string;
  /** The tab's page, when the text is in a frame from another site. */
  pageUrl?: string;
}

export interface RunOptions {
  selection?: SelectionSource;
  /**
   * The tab an action started from (context menu, shortcut): it's read even when a file is open
   * in the panel.
   */
  tabId?: number;
}

export type ConsentChoice = 'once' | 'site' | 'always' | 'cancel' | 'use-alternative';

export interface ExtraTab {
  tabId: number;
  title: string;
  url: string;
}

export interface ConsentPrompt {
  providerId: string;
  providerLabel: string;
  host?: string;
  /** Number of tabs when the content comes from several. */
  tabCount?: number;
  words: number;
  source: 'page' | 'selection' | 'none';
  dataNote?: string;
  termsUrl?: string;
  alternative?: { id: string; label: string };
  /** False when the content's site is unknown: then the choice can't be saved. */
  remember: boolean;
  resolve: (choice: ConsentChoice) => void;
}

export interface SetupInfo {
  /** The request that couldn't run, so it can be handed off or retried after setup. */
  pending: {
    recipeId: string;
    label: string;
    instruction: string;
    contextUrl?: string;
    selection?: SelectionSource;
    tabId?: number;
  };
  downloadable?: { id: string; label: string };
  cloudBlocked: boolean;
  /** Why each provider isn't ready, for the setup card. */
  reasons: { label: string; reason: string }[];
}

export interface RoutePreview {
  kind: RouteDecision['kind'];
  label?: string;
  privacy?: Privacy;
}

export interface ProviderSummary {
  id: string;
  label: string;
  privacy: Privacy;
  state: ProviderState;
}

interface PanelState {
  settings: Settings | null;
  tab: TabContext;
  items: ChatItem[];
  busy: boolean;
  preview: RoutePreview | null;
  consent: ConsentPrompt | null;
  setup: SetupInfo | null;
  download: { providerId: string; progress: number; error?: string } | null;
  toast: string | null;
  /** A file the user dropped or picked; used instead of the tab until closed. */
  file: ExtractedPage | null;
  /** Progress while a dropped file is read. */
  fileStatus: string | null;
  /** Id of the current conversation in history. */
  conversationId: string;
  historyOpen: boolean;
  /** Other tabs read together with the current one. */
  extraTabs: ExtraTab[];
  init(): () => void;
  refreshTab(tabId?: number): Promise<void>;
  runRecipe(recipeId: string, options?: RunOptions): Promise<void>;
  ask(question: string): Promise<void>;
  retry(itemId: string): Promise<void>;
  stop(): void;
  clear(): void;
  answerConsent(choice: ConsentChoice): void;
  dismissSetup(): void;
  retrySetup(): Promise<void>;
  enableOnDevice(providerId: string): Promise<void>;
  listProviders(): Promise<ProviderSummary[]>;
  makeDefault(providerId: string): Promise<void>;
  showToast(message: string): void;
  openFile(file: File): Promise<void>;
  closeFile(): void;
  setHistoryOpen(open: boolean): void;
  setExtraTabs(tabs: ExtraTab[]): void;
  loadConversation(id: string): Promise<void>;
}

let abortController: AbortController | undefined;
/** Set from the start of a request, before the first await, so a double click can't start two. */
let running = false;
/** An action from the context menu or a shortcut that arrived during another request. */
let queued: PendingAction | undefined;
/** The sites of the cloud request in progress, so a change of settings can stop it. */
let cloudRequestSites: readonly string[] | undefined;
/** Why a request was stopped when the settings stopped it, rather than the user. */
const CLOUD_OFF = 'localpulse:cloud-off';
let windowId: number | undefined;
let tabRequest = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function describeState(state: ProviderState): string {
  switch (state.kind) {
    case 'ready':
      return t('providerState.ready');
    case 'needs-download':
      return t('providerState.needsDownload');
    case 'downloading':
      return t('providerState.downloading', { percent: String(Math.round(state.progress * 100)) });
    case 'needs-setup':
      return {
        'no-key': t('providerState.noKey'),
        'no-model': t('providerState.noModelShort'),
        'no-permission': t('providerState.noPermission'),
        'server-offline': t('providerState.noServer'),
      }[state.reason];
    case 'unsupported':
      return state.reason;
  }
}

/** The provider and the server it talks to, so history rules notice when an address changes. */
function providerKeyOf(settings: Settings, provider: Provider): string {
  const endpoint = settings.endpoints.find((item) => item.id === provider.id);
  if (!endpoint) return provider.id;
  try {
    return `${provider.id}@${new URL(endpoint.baseUrl).origin}`;
  } catch {
    return `${provider.id}@${endpoint.baseUrl}`;
  }
}

/** The same text, ignoring differences in spacing and line breaks. */
function sameText(a: string, b: string): boolean {
  return a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
}

/** Progress on long pages as text for the answer's status line. */
function statusText(status: TurnStatus): string {
  if (!('part' in status)) {
    if (status.kind === 'downloading-translator') return t('turn.downloadingTranslator');
    return status.kind === 'writing-answer' ? t('turn.writingAnswer') : t('turn.writingSummary');
  }
  const counts = { part: String(status.part), total: String(status.total) };
  if (status.kind === 'reading') return t('turn.readingPart', counts);
  if (status.kind === 'combining') return t('turn.combining', counts);
  return t('turn.part', counts);
}

function taskFor(recipe: Recipe): TaskKind {
  if (recipe.id === 'translate') return 'translate';
  return recipe.summary ? 'summarize' : 'chat';
}

export const usePanel = create<PanelState>()((set, get) => {
  const patchItem = (id: string, patch: Partial<ChatItem>) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));

  /** Batches streamed text so Markdown re-renders at most every 40 ms. */
  const textBuffer = (id: string) => {
    let pending = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (!pending) return;
      const text = pending;
      pending = '';
      set((state) => ({
        items: state.items.map((item) =>
          item.id === id ? { ...item, text: item.text + text } : item,
        ),
      }));
    };
    return {
      append(chunk: string) {
        pending += chunk;
        timer ??= setTimeout(flush, 40);
      },
      flush,
      reset() {
        if (timer) clearTimeout(timer);
        timer = undefined;
        pending = '';
      },
    };
  };

  const providersFor = (settings: Settings): Provider[] =>
    orderProviders(createProviders(settings), settings);

  const policyFor = async (settings: Settings): Promise<RoutePolicy> => ({
    localOnly: settings.localOnly,
    neverCloudSites: settings.neverCloudSites,
    consent: await getConsent(),
  });

  const refreshPreview = async () => {
    const settings = get().settings;
    if (!settings) return;
    try {
      const decision = await route(
        providersFor(settings),
        { task: 'chat', host: hostnameOf(get().tab.page?.url) },
        await policyFor(settings),
      );
      set({
        preview:
          decision.kind === 'setup'
            ? { kind: 'setup' }
            : {
                kind: decision.kind,
                label: decision.provider.label,
                privacy: decision.provider.privacy,
              },
      });
    } catch {
      set({ preview: null });
    }
  };

  /** Saves the conversation to local history, unless history is turned off. */
  const persist = async () => {
    const { settings, items, conversationId } = get();
    if (!settings?.saveHistory) return;
    const stored = items.filter((item) => item.state !== 'streaming');
    if (!stored.some((item) => item.role === 'assistant')) return;
    const existing = await getConversation(conversationId);
    const now = Date.now();
    await saveConversation({
      id: conversationId,
      title: conversationTitle(stored),
      url: stored.find((item) => item.context?.url)?.context?.url,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      // Tab ids mean nothing after a restart and may point at another tab by then.
      // The selection is page text, which history never keeps.
      items: stored.map(({ status: _status, selection: _selection, fromTabId: _tab, ...item }) => ({
        ...item,
        context: item.context && {
          ...item.context,
          editableTabId: undefined,
          editableText: undefined,
        },
      })),
    });
  };

  /** Whether the latest settings (Local-only mode, never-send sites) keep these sites local. */
  const cloudBlockedNow = (sites: readonly string[]): boolean => {
    const latest = get().settings;
    if (!latest) return false;
    return latest.localOnly || sites.some((site) => isNeverCloudSite(site, latest.neverCloudSites));
  };

  const askConsent = (prompt: Omit<ConsentPrompt, 'resolve'>) =>
    new Promise<ConsentChoice>((resolve) => set({ consent: { ...prompt, resolve } }));

  const runPending = async (action: PendingAction) => {
    if (running || get().busy) {
      queued = action;
      return;
    }
    // No await before runRecipe claims the run, or an action arriving meanwhile would be lost.
    await get().runRecipe(action.recipeId, {
      tabId: action.tabId,
      selection: action.selection
        ? { text: action.selection, url: action.url, pageUrl: action.pageUrl }
        : undefined,
    });
  };

  async function execute(
    recipe: Recipe,
    instruction: string,
    userText: string,
    options: RunOptions = {},
  ): Promise<void> {
    if (running || get().busy) return;
    running = true;
    try {
      await executeTurn(recipe, instruction, userText, options);
    } finally {
      running = false;
      const next = queued;
      queued = undefined;
      if (next) void runPending(next);
    }
  }

  async function executeTurn(
    recipe: Recipe,
    instruction: string,
    userText: string,
    options: RunOptions,
  ): Promise<void> {
    const settings = get().settings ?? (await getSettings());
    const language = resolveAnswerLanguage(settings);
    const override = options.selection;

    // 1. What the model will read, and where it came from. Re-read the tab so it's current.
    let page: PromptPage | undefined;
    let sources: string[] = [];
    // An action started from a page is about that page, even when a file is open in the panel.
    const fromPage = options.tabId !== undefined || override !== undefined;
    const file = fromPage ? null : get().file;
    if (recipe.input !== 'none') {
      // Re-read the tab so it's current (and, for a right-click, to find the field it came from).
      if (fromPage || !file) await get().refreshTab(options.tabId);
      const { tab } = get();
      const extracted = file ?? (tab.status === 'ready' ? tab.page : undefined);
      if (override?.text.trim()) {
        // Text from the context menu. Its own address decides the privacy rules, whatever the
        // panel shows, and the page around a frame from another site counts too.
        const samePage = !file && extracted !== undefined && extracted.url === override.url;
        // The menu's copy of the selection loses line breaks; the page's own copy keeps them.
        const exact =
          samePage && extracted.selection && sameText(extracted.selection, override.text)
            ? extracted.selection
            : undefined;
        page = {
          title: samePage ? extracted.title : 'Selected text',
          url: override.url ?? '',
          text: exact ?? override.text,
          source: 'selection',
          lang: samePage ? extracted.lang : undefined,
        };
        sources = [
          ...new Set([override.url, override.pageUrl].filter(Boolean).map((url) => sourceKey(url))),
        ];
      } else {
        const selection =
          settings.preferSelection || recipe.input === 'selection'
            ? extracted?.selection
            : undefined;
        // Proofread or Rewrite change the text you selected; they never rewrite a whole page.
        if (recipe.input === 'selection' && recipe.mode === 'transform' && !selection) {
          get().showToast(t('toast.selectFirst'));
          return;
        }
        const text = selection ?? extracted?.markdown ?? '';
        if (text.trim()) {
          page = {
            title: extracted?.title ?? 'Selected text',
            url: extracted?.url ?? '',
            text,
            source: selection ? 'selection' : 'page',
            lang: extracted?.lang,
          };
          sources = [sourceKey(page.url)];
        } else if (!file && tab.status === 'no-access') {
          get().showToast(t('toast.allowTab'));
          return;
        } else if (recipe.id !== 'question') {
          get().showToast(
            extracted?.kind === 'pdf'
              ? t('toast.pdfNotReady')
              : tab.status === 'ready'
                ? t('toast.noText')
                : t('toast.openPage'),
          );
          return;
        }
      }
    }
    // Content whose site can't be checked (a local file, an unknown address) is never covered by
    // saved consent or the never-send list: the user is asked every time.
    const unverifiable =
      page !== undefined &&
      sources.some((key) => key === UNKNOWN_SOURCE || key.startsWith('file:'));

    // A rewrite can replace the selection in its text field. Taken now: the tab may change
    // while the consent dialog is open.
    const tabPage = file ? undefined : get().tab.page;
    // Only a rewrite, proofread or translation may replace the text: never an explanation.
    const editable =
      page?.source === 'selection' &&
      recipe.mode === 'transform' &&
      tabPage?.selectionEditable &&
      (!override || page.text === tabPage.selection);
    const editableTabId = editable ? get().tab.tabId : undefined;

    // Several tabs: read the others too and put each under its own heading.
    const { extraTabs } = get();
    let tabCount: number | undefined;
    if (page && page.source === 'page' && extraTabs.length > 0 && !file) {
      const others = await Promise.all(extraTabs.map((tab) => readTab(tab.tabId)));
      const pages = [
        { title: page.title, url: page.url, markdown: page.text },
        ...others.flatMap((result) =>
          result.status === 'ready' && result.page ? [result.page] : [],
        ),
      ];
      if (pages.length > 1) {
        tabCount = pages.length;
        page = {
          title: `${pages.length} tabs`,
          url: page.url,
          source: 'page',
          text: pages
            .map(
              (item, index) =>
                `# Tab ${index + 1}: ${item.title}\n\nFrom ${decodeAddress(item.url)}\n\n${item.markdown}`,
            )
            .join('\n\n'),
        };
        sources = [...new Set(pages.map((item) => sourceKey(item.url)))];
      }
    }

    // 2. Where it runs. Every site the content comes from must allow the cloud.
    const sites = sources.filter((key) => key !== UNKNOWN_SOURCE && !key.startsWith('file:'));
    const host = sites.length === 1 ? sites[0] : undefined;
    const hosts = sites.length > 1 ? sites : undefined;
    const providers = providersFor(settings);
    const task = taskFor(recipe);
    let decision = await route(
      providers,
      {
        task,
        host,
        hosts,
        pinnedProviderId: settings.pinnedProviders[recipe.id],
        requireConsent: unverifiable,
      },
      await policyFor(settings),
    );
    // Firefox: the data-collection permission may have been taken back since consent was saved.
    // Earlier answers are about pages too, so a follow-up question needs it as well.
    const sendsPageContent =
      page !== undefined ||
      (recipe.id === 'question' && get().items.some((item) => item.role === 'assistant'));
    if (
      decision.kind === 'use' &&
      decision.provider.privacy === 'cloud' &&
      sendsPageContent &&
      !(await hasFirefoxDataConsent())
    ) {
      decision = { kind: 'consent', provider: decision.provider };
    }

    if (decision.kind === 'setup') {
      set({
        setup: {
          pending: {
            recipeId: recipe.id,
            label: userText,
            instruction,
            contextUrl: page?.url || undefined,
            selection: override,
            tabId: options.tabId,
          },
          downloadable: decision.downloadable && {
            id: decision.downloadable.id,
            label: decision.downloadable.label,
          },
          cloudBlocked: decision.cloudBlocked,
          reasons: decision.checks.map(({ provider, state }) => ({
            label: provider.label,
            reason: describeState(state),
          })),
        },
      });
      return;
    }

    let provider = decision.provider;
    if (decision.kind === 'consent') {
      const preset = presetById(
        settings.endpoints.find((endpoint) => endpoint.id === provider.id)?.presetId ?? '',
      );
      const choice = await askConsent({
        providerId: provider.id,
        providerLabel: provider.label,
        host,
        tabCount,
        words: page ? countWords(page.text) : 0,
        source: page?.source ?? 'none',
        dataNote: preset?.dataNote,
        termsUrl: preset?.termsUrl,
        alternative: decision.alternative && {
          id: decision.alternative.id,
          label: decision.alternative.label,
        },
        remember: !unverifiable,
      });
      if (choice === 'cancel') return;
      if (choice === 'use-alternative' && decision.alternative) {
        await get().enableOnDevice(decision.alternative.id);
        return;
      }
      if ((choice === 'site' || choice === 'always') && !unverifiable) {
        await grantConsent(provider.id, choice, host);
      }
    }
    // The settings may have changed while the dialog was open.
    if (provider.privacy === 'cloud' && cloudBlockedNow(sites)) {
      get().showToast(t('toast.cloudOff'));
      return;
    }

    // 3. Show the question and an empty answer.
    const context: ItemContext | undefined = page && {
      title: page.title,
      url: page.url,
      source: page.source,
      editableTabId,
      editableText: editable ? page.text : undefined,
      tabCount,
    };
    const earlier = recipe.id === 'question' ? get().items : [];
    const answerId = randomId('a-');
    set((state) => ({
      busy: true,
      setup: null,
      items: [
        ...state.items,
        {
          id: randomId('u-'),
          role: 'user',
          text: userText,
          actionLabel: recipe.id === 'question' ? undefined : recipeLabel(recipe),
          instruction,
          recipeId: recipe.id,
          context,
        },
        {
          id: answerId,
          role: 'assistant',
          text: '',
          state: 'streaming',
          providerLabel: provider.label,
          providerKey: providerKeyOf(settings, provider),
          privacy: provider.privacy,
          instruction,
          recipeId: recipe.id,
          context,
          lineBreaks: recipe.mode === 'transform' || undefined,
          selection: override,
          fromTabId: options.tabId,
        },
      ],
    }));

    // 4. Answer, switching provider if one fails (keeping the privacy level unless allowed).
    const controller = new AbortController();
    abortController = controller;
    const buffer = textBuffer(answerId);
    const tried: string[] = [];
    let budgetScale = 1;
    // One set of placeholders for the page and earlier turns, and the real values for the answer.
    const redactor = new Redactor();
    try {
      for (;;) {
        const cloud = provider.privacy === 'cloud';
        const redact = cloud && settings.redactForCloud;
        // Earlier turns are chosen for each provider: a cloud one only gets what may go to it,
        // under the never-send list as it is now.
        const history = conversationHistory(earlier, {
          providerId: provider.id,
          providerKey: providerKeyOf(settings, provider),
          cloud,
          current: sources,
          neverCloudSites: (get().settings ?? settings).neverCloudSites,
          consent: await getConsent(),
          redactor: redact ? redactor : undefined,
        });
        const redaction = page && redact ? redactPage(page, redactor) : undefined;
        patchItem(answerId, {
          sources: [...new Set([...sources, ...history.sources])],
          leftOut: history.leftOut || undefined,
        });
        // Local-only mode or a never-send site may have been switched on meanwhile.
        if (cloud && cloudBlockedNow(sites)) {
          patchItem(answerId, { state: 'error', status: undefined, error: t('toast.cloudOff') });
          return;
        }
        cloudRequestSites = cloud ? sites : undefined;
        try {
          const result = await runTurn(
            provider,
            {
              recipe,
              instruction,
              page: redaction?.page ?? page,
              history: history.messages,
              language,
              budgetScale,
              placeholders: Boolean(redaction?.count || history.redactions),
            },
            {
              onText: buffer.append,
              onStatus: (status) => patchItem(answerId, { status: status && statusText(status) }),
            },
            controller.signal,
          );
          buffer.flush();
          // The answer shows the real emails and numbers that the cloud provider saw as
          // placeholders; nothing leaves this computer for it.
          const written = stripPageTags(
            get().items.find((item) => item.id === answerId)?.text ?? '',
          );
          const answerText = redactor.restore(written);
          const hidden = redactor.valuesIn(written);
          // A rewrite or translation must keep every value hidden in the text it was written
          // from (not in the tab's title or address, which it doesn't contain).
          const hiddenInText = redaction ? redactor.valuesIn(redaction.page.text) : [];
          const unrestored =
            recipe.mode === 'transform' &&
            hiddenInText.length > 0 &&
            (hasPlaceholder(answerText) ||
              hiddenInText.some(({ value }) => !answerText.includes(value)));
          patchItem(answerId, {
            text: answerText,
            hidden: hidden.length ? hidden : undefined,
            unrestored: unrestored || undefined,
            // A translation or rewrite is new text, so its quotes aren't quotes from the page.
            quotes:
              page && recipe.mode !== 'transform' ? checkQuotes(answerText, page.text) : undefined,
            state: 'done',
            status: undefined,
            strategy: result.strategy,
            partsUsed: result.partsUsed,
            partsTotal: result.partsTotal,
            redactions: (redaction?.count ?? 0) + history.redactions || undefined,
          });
          return;
        } catch (error) {
          buffer.flush();
          if (controller.signal.reason === CLOUD_OFF) {
            patchItem(answerId, { state: 'error', status: undefined, error: t('toast.cloudOff') });
            return;
          }
          if (controller.signal.aborted || isAbortError(error)) {
            patchItem(answerId, { state: 'stopped', status: undefined });
            return;
          }
          // Too much for this model after all (token counts are estimates): smaller parts first.
          if (
            error instanceof ProviderError &&
            error.kind === 'context-too-large' &&
            budgetScale > 0.25
          ) {
            budgetScale /= 2;
            buffer.reset();
            patchItem(answerId, { text: '', status: undefined });
            continue;
          }
          if (error instanceof ProviderError && error.tryNextProvider) {
            tried.push(provider.id);
            const next = await route(
              providers,
              {
                task,
                host,
                hosts,
                exclude: tried,
                onDeviceOnly: provider.privacy === 'on-device' && !settings.allowCloudFallback,
                requireConsent: unverifiable,
              },
              await policyFor(get().settings ?? settings),
            );
            const allowed =
              next.kind === 'use' &&
              (next.provider.privacy !== 'cloud' ||
                !sendsPageContent ||
                (await hasFirefoxDataConsent()));
            if (next.kind === 'use' && allowed) {
              buffer.reset();
              patchItem(answerId, {
                text: '',
                status: undefined,
                notice: t('conversation.switched', {
                  failed: provider.label,
                  reason: error.message,
                  next: next.provider.label,
                }),
                providerLabel: next.provider.label,
                providerKey: providerKeyOf(settings, next.provider),
                privacy: next.provider.privacy,
              });
              provider = next.provider;
              budgetScale = 1;
              continue;
            }
          }
          patchItem(answerId, { state: 'error', status: undefined, error: errorMessage(error) });
          return;
        }
      }
    } finally {
      buffer.flush();
      cloudRequestSites = undefined;
      if (abortController === controller) abortController = undefined;
      set({ busy: false });
      void refreshPreview();
      void persist().catch(() => {});
    }
  }

  return {
    settings: null,
    tab: { status: 'idle' },
    items: [],
    busy: false,
    preview: null,
    consent: null,
    setup: null,
    download: null,
    toast: null,
    file: null,
    fileStatus: null,
    conversationId: randomId('c-'),
    historyOpen: false,
    extraTabs: [],

    init() {
      const cleanups: (() => void)[] = [];
      void (async () => {
        const settings = await getSettings();
        set({ settings });
        windowId = (await browser.windows.getCurrent()).id;
        await get().refreshTab();
        const pending = await takePendingAction(windowId);
        if (pending) await runPending(pending);
      })();

      cleanups.push(
        watchSettings((settings) => {
          set({ settings });
          if (cloudRequestSites && cloudBlockedNow(cloudRequestSites)) {
            abortController?.abort(CLOUD_OFF);
          }
          void refreshPreview();
        }),
      );

      const onActivated = (info: { tabId: number; windowId: number }) => {
        if (info.windowId === windowId && forcedTabId() === undefined)
          void get().refreshTab(info.tabId);
      };
      const onUpdated = (tabId: number, change: { status?: string }) => {
        if (tabId === get().tab.tabId && change.status === 'complete') void get().refreshTab(tabId);
      };
      const onMessage = (message: unknown) => {
        const data = message as { type?: string; tabId?: number; windowId?: number } | null;
        if (data?.type === 'localpulse:tab-access' && data.windowId === windowId) {
          void get().refreshTab(data.tabId);
        }
      };
      const onPermissions = () => void get().refreshTab();
      const onFocus = () => {
        if (!get().busy) void get().refreshTab();
      };
      browser.tabs.onActivated.addListener(onActivated);
      browser.tabs.onUpdated.addListener(onUpdated);
      browser.runtime.onMessage.addListener(onMessage);
      browser.permissions.onAdded.addListener(onPermissions);
      window.addEventListener('focus', onFocus);
      cleanups.push(() => {
        browser.tabs.onActivated.removeListener(onActivated);
        browser.tabs.onUpdated.removeListener(onUpdated);
        browser.runtime.onMessage.removeListener(onMessage);
        browser.permissions.onAdded.removeListener(onPermissions);
        window.removeEventListener('focus', onFocus);
      });

      cleanups.push(
        pendingActionItem.watch((value) => {
          // Until this panel knows its window, the start-up code above takes the action.
          if (!value || windowId === undefined) return;
          void takePendingAction(windowId).then((action) => action && runPending(action));
        }),
      );

      return () => cleanups.forEach((cleanup) => cleanup());
    },

    async refreshTab(tabId) {
      const id = tabId ?? (await activeTabId());
      if (id === undefined) {
        set({ tab: { status: 'idle' } });
        return;
      }
      const request = ++tabRequest;
      set((state) => ({
        tab:
          state.tab.tabId === id && state.tab.status === 'ready'
            ? state.tab
            : { status: 'loading', tabId: id },
      }));
      const result = await readTab(id);
      if (request !== tabRequest) return;
      const page = result.page;
      if (result.status === 'ready' && page?.kind === 'pdf' && !page.markdown) {
        // Chrome's PDF viewer can't be scripted, so read the file itself.
        set({ tab: { status: 'loading', tabId: id, message: t('context.readingPdf') } });
        try {
          const pdf = await readPdfFromUrl(page, (number, total) => {
            if (request === tabRequest) {
              set({
                tab: {
                  status: 'loading',
                  tabId: id,
                  message: t('context.readingPdfPage', {
                    page: String(number),
                    total: String(total),
                  }),
                },
              });
            }
          });
          if (request !== tabRequest) return;
          set({ tab: { status: 'ready', tabId: id, page: pdf } });
        } catch (error) {
          if (request !== tabRequest) return;
          set({
            tab:
              error instanceof PdfAccessError
                ? { status: 'no-access', tabId: id, sitePattern: originPattern(page.url), page }
                : {
                    status: 'error',
                    tabId: id,
                    message: t('context.pdfFailed', { error: errorMessage(error) }),
                  },
          });
        }
      } else {
        set({ tab: result });
      }
      void refreshPreview();
    },

    async runRecipe(recipeId, options = {}) {
      const settings = get().settings ?? (await getSettings());
      const recipe = recipeById(recipeId, settings.customRecipes);
      if (!recipe) return;
      const instruction = fillRecipePrompt(recipe, resolveAnswerLanguage(settings));
      await execute(recipe, instruction, recipe.label, options);
    },

    async ask(question) {
      const text = question.trim();
      if (!text) return;
      await execute(questionRecipe(text), text, text);
    },

    async retry(itemId) {
      const items = get().items;
      const index = items.findIndex((item) => item.id === itemId);
      const answer = items[index];
      if (!answer || get().busy) return;
      set({ items: items.filter((_, i) => i !== index && i !== index - 1) });
      if (answer.recipeId && answer.recipeId !== 'question') {
        await get().runRecipe(answer.recipeId, {
          selection: answer.selection,
          tabId: answer.fromTabId,
        });
      } else if (answer.instruction) await get().ask(answer.instruction);
    },

    stop() {
      abortController?.abort();
    },

    clear() {
      get().stop();
      set({ items: [], setup: null, conversationId: randomId('c-'), historyOpen: false });
    },

    answerConsent(choice) {
      const consent = get().consent;
      set({ consent: null });
      consent?.resolve(choice);
    },

    dismissSetup() {
      set({ setup: null });
    },

    async retrySetup() {
      const pending = get().setup?.pending;
      set({ setup: null });
      if (!pending) return;
      if (pending.recipeId === 'question') await get().ask(pending.instruction);
      else {
        await get().runRecipe(pending.recipeId, {
          selection: pending.selection,
          tabId: pending.tabId,
        });
      }
    },

    async enableOnDevice(providerId) {
      const settings = get().settings ?? (await getSettings());
      const provider = createProviders(settings).find((p) => p.id === providerId);
      if (!provider?.prepare) return;
      set({ download: { providerId, progress: 0 } });
      try {
        await provider.prepare((progress) => set({ download: { providerId, progress } }));
        // Remember which in-browser model was downloaded (no import, so Firefox builds can drop WebLLM).
        const modelId = (provider as Partial<{ modelId: string }>).modelId;
        if (provider.id === 'webllm' && modelId) await updateSettings({ webllmModel: modelId });
        set({ download: null, setup: null });
        get().showToast(t('setup.ready', { provider: provider.label }));
        await refreshPreview();
      } catch (error) {
        set({ download: { providerId, progress: 0, error: errorMessage(error) } });
      }
    },

    async listProviders() {
      const settings = get().settings ?? (await getSettings());
      const providers = providersFor(settings);
      return Promise.all(
        providers.map(async (provider) => ({
          id: provider.id,
          label: provider.label,
          privacy: provider.privacy,
          state: await provider.state('chat'),
        })),
      );
    },

    async makeDefault(providerId) {
      const settings = get().settings ?? (await getSettings());
      const ids = providersFor(settings).map((provider) => provider.id);
      await updateSettings({
        providerOrder: [providerId, ...ids.filter((id) => id !== providerId)],
        disabledProviders: settings.disabledProviders.filter((id) => id !== providerId),
      });
    },

    showToast(message) {
      if (toastTimer) clearTimeout(toastTimer);
      set({ toast: message });
      toastTimer = setTimeout(() => set({ toast: null }), 3500);
    },

    async openFile(file) {
      if (!canOpenFile(file)) {
        get().showToast(t('files.unsupported'));
        return;
      }
      set({ fileStatus: t('files.reading', { name: file.name }) });
      try {
        const page = await readFile(file, (number, total) =>
          set({
            fileStatus: t('files.readingPage', {
              name: file.name,
              page: String(number),
              total: String(total),
            }),
          }),
        );
        set({ file: page, fileStatus: null });
        void refreshPreview();
      } catch (error) {
        set({ fileStatus: null });
        get().showToast(t('files.failed', { name: file.name, error: errorMessage(error) }));
      }
    },

    closeFile() {
      set({ file: null });
      void get().refreshTab();
    },

    setHistoryOpen(open) {
      set({ historyOpen: open });
    },

    setExtraTabs(tabs) {
      set({ extraTabs: tabs });
    },

    async loadConversation(id) {
      const conversation = await getConversation(id);
      if (!conversation) return;
      get().stop();
      set({
        items: conversation.items as ChatItem[],
        conversationId: conversation.id,
        historyOpen: false,
        setup: null,
      });
    },
  };
});
