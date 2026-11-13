/** Web Client bridge: carry this caller's effective language through the existing command wire. */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import { normalizeLanguage } from '../language.js';
import remoteContribution from '../../dist/typert.remote-client.js';
import { en, zh, type UpdaterSettingsLocaleKey } from './locales.js';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Application-wide overlay surface. */
    'shell.overlay': { kind: 'list'; scope: 'root' };
  }
  interface LocaleNamespaceMap {
    /** Copy the updater's settings page renders. */
    'settings.updater': UpdaterSettingsLocaleKey
  }
}

/** Dictionary namespace this bundle owns. */
export const NS = 'settings.updater';

export interface ClientLocale {
  getSnapshot(): { readonly active: unknown };
  register(ns: string, dicts: Record<string, Record<string, string>>): () => void;
}

/** Only our exact command receives presentation metadata; all other bytes stay unchanged. */
export function withClientLanguage(line: unknown, language: unknown): unknown {
  const selected = normalizeLanguage(language);
  if (!selected || typeof line !== 'string' || !/^\/plugin-updater(?:\s|$)/.test(line)) return line;
  return `${line} --client-lang ${selected}`;
}

/**
 * rc.4 has no caller-locale field or pre-command hook. Adapt its public execute method in this
 * Client's own namespace, retaining the generated getter's caller Context and lifecycle checks.
 * Never mutate a Host global, settings, transport, composer draft or unrelated command.
 */
export function installLanguageBridge(commands: object, activeLanguage: () => unknown): () => void {
  const previous = Object.getOwnPropertyDescriptor(commands, 'execute');
  if (!previous || previous.configurable !== true || (typeof previous.get !== 'function' && typeof previous.value !== 'function')) {
    throw new Error('The updater language bridge requires a configurable commands.execute method.');
  }
  let active = true;
  const get = function(this: unknown) {
    const execute: unknown = previous.get ? Reflect.apply(previous.get, this, []) : previous.value;
    if (typeof execute !== 'function') throw new Error('commands.execute is unavailable.');
    return function(this: unknown, ...args: unknown[]) {
      if (!active || typeof args[1] !== 'string' || !/^\/plugin-updater(?:\s|$)/.test(args[1])) return Reflect.apply(execute, this, args);
      let language: unknown;
      try { language = activeLanguage(); } catch { /* Host keeps its explicit and saved-preference fallbacks. */ }
      const forwarded = [...args];
      forwarded[1] = withClientLanguage(args[1], language);
      return Reflect.apply(execute, this, forwarded);
    };
  };
  Object.defineProperty(commands, 'execute', { configurable: true, enumerable: previous.enumerable ?? true, get });
  return () => {
    active = false;
    // Do not undo another plugin's newer adapter. Captured wrappers become inert after teardown.
    if (Object.getOwnPropertyDescriptor(commands, 'execute')?.get === get) Object.defineProperty(commands, 'execute', previous);
  };
}

export const inject = ['locale', 'remote.commands'];

/** Host entry id this bundle owns in the profile, the settings namespace it serves. */
export const ENTRY_ID = 'better-plugin-updater';

/** The bundle package name the Plugins page keys a bundle page by. */
export const BUNDLE_NAME = 'dsh-better-plugin-updater';

/** The browser factory's module-table resolver, captured for the settings page import. */
let hostRequire: ((specifier: string) => unknown) | undefined;

/**
 * Record the factory resolver the Host assembles for this bundle.
 *
 * The Host resolves shared browser dependencies by specifier, so the page must reach React through
 * this resolver rather than a native dynamic import, which the browser cannot resolve at all.
 * @param resolver - the factory's `require`.
 */
export function captureHostRequire(resolver: (specifier: string) => unknown): void {
  hostRequire = resolver;
}

/**
 * Mount this bundle's settings page through the public bundle-config slot.
 *
 * The page is loaded on demand so the packaged factory still evaluates with no browser dependency
 * present, which keeps the bundle inspectable outside a browser. Registration is gated on the
 * namespace being served, because a page whose fields nothing would accept is worse than none.
 * @param ctx - Client runtime owning slots and served settings forms.
 */
export function mountSettingsPage(ctx: Context): void {
  ctx.inject(['slots', 'configForms', 'locale'], inner => inner.effect(() => {
    // A front end that serves settings without a locale service still gets the page, just in English.
    const locale = inner.locale as ClientLocale | undefined;
    const releaseDicts = locale?.register(NS, { en, zh });
    const disposePage = inner.configForms.whileServed([ENTRY_ID], () => {
      if (!hostRequire) return () => {};
      const controllerModule = require('./settings-controller.js') as {
        UpdaterCardController: new (scope: never) => { inject(): never, dispose(): void };
      };
      const page = require('./settings-page.js') as { UpdaterSettingsPage: never };
      const controller = new controllerModule.UpdaterCardController(
        inner.configForms.get<Record<string, unknown>>(ENTRY_ID) as never,
      );
      const face = controller.inject();
      const Card = page.UpdaterSettingsPage as unknown as (props: never) => never;
      const disposeSlot = inner.slots.inject('plugins.bundle.config', () => inner.slots.register({
        name: 'plugins.bundle.config', key: BUNDLE_NAME,
        ...(releaseDicts ? { locale: NS } : {}), inject: () => face,
      }, Card));
      return () => { disposeSlot?.(); controller.dispose(); };
    });
    return () => { disposePage?.(); releaseDicts?.(); };
  }, 'dsh-better-plugin-updater: settings page'));
}

/** Mount the repository link independently of the bundle's settings form. */
export function mountRepositoryLink(ctx: Context): void {
  ctx.inject(['slots'], inner => inner.slots.inject('plugins.detail.actions', () => {
    if (!hostRequire) return () => {};
    const { RepositoryLink } = require('./repository-link.js') as { RepositoryLink: never };
    return inner.slots.register({
      name: 'plugins.detail.actions', id: `${BUNDLE_NAME}.github`, inject: () => ({ bundleName: BUNDLE_NAME }),
    }, RepositoryLink);
  }));
}

/** Mount GitHub detail controls only after their Remote contribution is available. */
export function mountGitHubUpdate(ctx: Context): void {
  ctx.inject(['slots', 'remote', 'locale'], inner => inner.effect(() => {
    let active = true;
    let releaseRemote: (() => Promise<void>) | undefined;
    let releaseSlot: (() => void) | undefined;
    let releaseOverlay: (() => void) | undefined;
    let removeStyles: (() => void) | undefined;
    const remote = inner.get('remote') as {
      $mount(contribution: typeof remoteContribution): Promise<() => Promise<void>>;
      $on(event: 'plugin-manager/changed', listener: () => void): () => void;
    };
    const events = { subscribe: (listener: () => void) => remote.$on('plugin-manager/changed', listener) };
    void remote.$mount(remoteContribution).then(release => {
      if (!active) { void release(); return; }
      releaseRemote = release;
      if (!hostRequire) return;
      const { GitHubUpdateView } = require('./github-update-view.js') as { GitHubUpdateView: never };
      const { GitHubDialogStore, GitHubUpdateDialog, installDialogStyles } = require('./github-update-section.js') as typeof import('./github-update-section.js');
      const dialog = new GitHubDialogStore();
      removeStyles = installDialogStyles();
      releaseOverlay = inner.slots.inject('shell.overlay', () => inner.slots.register({
        name: 'shell.overlay', id: `${BUNDLE_NAME}.github-update-dialog`, inject: () => ({ dialog }),
      }, GitHubUpdateDialog));
      releaseSlot = inner.slots.inject('plugins.detail.section', () => inner.slots.register({
        name: 'plugins.detail.section', id: `${BUNDLE_NAME}.github-update`,
        inject: () => ({ remote: inner.get('remote.betterPluginUpdaterUi'), locale: inner.locale, events, dialog }),
      }, GitHubUpdateView));
    }).catch(error => { if (active) console.warn('GitHub update controls are unavailable:', error); });
    return () => { active = false; releaseSlot?.(); releaseOverlay?.(); removeStyles?.(); if (releaseRemote) void releaseRemote(); };
  }, 'dsh-better-plugin-updater: GitHub detail controls'));
}

export function apply(ctx: Context): void {
  const commands = ctx.get('remote.commands') as object | undefined;
  const locale = ctx.get('locale') as ClientLocale | undefined;
  // The settings page is the primary surface, so a Host missing the command wire must not cost it.
  mountSettingsPage(ctx);
  mountRepositoryLink(ctx);
  mountGitHubUpdate(ctx);
  if (!commands || !locale) return;
  ctx.effect(() => installLanguageBridge(commands, () => locale.getSnapshot().active));
}
