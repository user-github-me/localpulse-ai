import { defineUnlistedScript, browser } from '#imports';
import { composeEditors, tokenFromImageSource } from '@/core/webmail';
import { t } from '@/app/shared/i18n';
interface Activity {
  token: string;
  count: number;
  lastAt: number | null;
}
interface Draft {
  id: string;
  token?: string;
  pixelUrl?: string;
  enabled: boolean;
  busy: boolean;
  retryAfter?: number;
  control: HTMLButtonElement;
  image?: HTMLImageElement;
}
/** Public capabilities and display counts only. This script never reads email text or private keys. */
export default defineUnlistedScript({
  main() {
    const scope = globalThis as typeof globalThis & { localpulseMailActive?: boolean };
    if (scope.localpulseMailActive) return;
    scope.localpulseMailActive = true;
    const drafts = new Map<HTMLElement, Draft>();
    let active = true;
    let scanning = false;
    const style =
      'font:12px system-ui,sans-serif;color:#176c4d;background:#e8f3ed;border:1px solid #7aaa94;border-radius:6px;padding:4px 8px;margin:4px;cursor:pointer;';
    const send = (action: string, extra: Record<string, unknown> = {}) =>
      browser.runtime.sendMessage({ type: 'localpulse:webmail', action, ...extra }) as Promise<{
        ok?: boolean;
        disabled?: boolean;
        token?: string;
        pixelUrl?: string;
        activity?: Activity[];
      }>;
    function setDraftLabel(draft: Draft) {
      draft.control.textContent = t(
        draft.busy
          ? 'trackingAuto.preparing'
          : draft.enabled
            ? 'trackingAuto.draftOn'
            : 'trackingAuto.draftOff',
      );
      draft.control.setAttribute('aria-pressed', String(draft.enabled));
    }
    async function attach(editor: HTMLElement, draft: Draft) {
      if (draft.busy || !draft.enabled || !active || (draft.retryAfter ?? 0) > Date.now()) return;
      if (draft.image?.isConnected) return;
      draft.busy = true;
      setDraftLabel(draft);
      try {
        if (!draft.pixelUrl) {
          const result = await send('allocate', { draftId: draft.id });
          if (!result.ok || !result.token || !result.pixelUrl) throw new Error();
          draft.token = result.token;
          draft.pixelUrl = result.pixelUrl;
        }
        if (!active || !draft.enabled || !editor.isConnected) return;
        const image = document.createElement('img');
        image.src = draft.pixelUrl!;
        image.width = 1;
        image.height = 1;
        image.alt = '';
        image.setAttribute('data-localpulse-pixel', 'true');
        image.style.cssText = 'width:1px;height:1px;border:0;';
        draft.image = image;
        editor.append(image);
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
      } catch {
        draft.retryAfter = Date.now() + 30000;
        draft.control.textContent = t('trackingAuto.draftError');
        draft.control.title = t('trackingAuto.retry');
      } finally {
        draft.busy = false;
        if (draft.image?.isConnected || !draft.enabled) setDraftLabel(draft);
      }
    }
    async function scan() {
      if (scanning || !active) return;
      scanning = true;
      try {
        const editors = composeEditors(document, location.hostname);
        for (const editor of editors) {
          let draft = drafts.get(editor);
          if (!draft) {
            const control = document.createElement('button');
            control.type = 'button';
            control.style.cssText = style;
            control.dataset.localpulseTools = 'draft';
            control.title = t('trackingAuto.draftHint');
            const existing = [...editor.querySelectorAll('img')]
              .filter((image) => !image.closest('.gmail_quote, blockquote, #divRplyFwdMsg'))
              .map((image) => ({
                image,
                token: tokenFromImageSource(image.getAttribute('src') ?? ''),
              }))
              .find((value) => value.token);
            draft = {
              id: crypto.randomUUID(),
              enabled: true,
              busy: false,
              control,
              ...(existing && {
                token: existing.token,
                image: existing.image,
                pixelUrl: existing.image.getAttribute('src') ?? undefined,
              }),
            };
            drafts.set(editor, draft);
            const current = draft;
            control.addEventListener('click', () => {
              if (current.busy) return;
              if (!current.image?.isConnected && current.enabled) {
                current.retryAfter = 0;
                void attach(editor, current);
                return;
              }
              current.enabled = !current.enabled;
              if (!current.enabled) current.image?.remove();
              else void attach(editor, current);
              setDraftLabel(current);
            });
            editor.insertAdjacentElement('afterend', control);
            setDraftLabel(draft);
          }
          if (!draft.image?.isConnected && draft.enabled) void attach(editor, draft);
        }
        // Inspect image URLs only. Never inspect subjects, recipients, body text or message IDs.
        const images = [...document.querySelectorAll<HTMLImageElement>('img')].filter(
          (image) => !editors.some((editor) => editor.contains(image)),
        );
        const entries = images
          .flatMap((image) => {
            const token = tokenFromImageSource(image.getAttribute('src') ?? '');
            return token ? [{ image, token }] : [];
          })
          .slice(0, 100);
        if (!entries.length) return;
        const result = await send('status', {
          tokens: [...new Set(entries.map((entry) => entry.token))],
        });
        if (!result.ok) {
          if (result.disabled) cleanup();
          return;
        }
        for (const { image, token } of entries) {
          const activity = result.activity?.find((value) => value.token === token);
          if (!activity) continue;
          const container =
            location.hostname === 'mail.google.com'
              ? image.closest('.adn, .gs')
              : image.closest('[data-app-section="MailReadCompose"], [role="article"]');
          const place =
            container?.querySelector('.g3, [data-localpulse-header]') ??
            container ??
            image.parentElement;
          if (!place) continue;
          let badge = [
            ...place.querySelectorAll<HTMLButtonElement>('[data-localpulse-tools="badge"]'),
          ].find((node) => node.dataset.localpulseToken === token);
          if (!badge) {
            badge = document.createElement('button');
            badge.type = 'button';
            badge.style.cssText = style;
            badge.dataset.localpulseTools = 'badge';
            badge.dataset.localpulseToken = token;
            place.append(badge);
            badge.addEventListener('click', () => {
              badge!.disabled = true;
              void send('refresh', { token }).finally(() => {
                badge!.disabled = false;
                void scan();
              });
            });
          }
          const label = t('trackingAuto.badge', { count: String(activity.count) });
          if (badge.textContent !== label) badge.textContent = label;
          badge.title = activity.lastAt
            ? t('trackingAuto.badgeTime', { time: new Date(activity.lastAt).toLocaleString() })
            : t('trackingAuto.badgeEmpty');
          badge.setAttribute('aria-label', `${badge.textContent}. ${badge.title}`);
        }
      } catch {
        /* A sleeping/reloaded extension is retried on the next scan; never expose error details. */
      } finally {
        scanning = false;
      }
    }
    function cleanup() {
      active = false;
      observer.disconnect();
      clearInterval(timer);
      if (scheduled) clearTimeout(scheduled);
      for (const draft of drafts.values()) draft.control.remove();
      document.querySelectorAll('[data-localpulse-tools="badge"]').forEach((node) => node.remove());
      scope.localpulseMailActive = false;
    }
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      if (!scheduled)
        scheduled = setTimeout(() => {
          scheduled = undefined;
          void scan();
        }, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setInterval(() => {
      void send('ready')
        .then((result) => {
          if (!result.ok) cleanup();
          else void scan();
        })
        .catch(() => {});
    }, 15000);
    window.addEventListener('pagehide', cleanup, { once: true });
    void scan();
  },
});
