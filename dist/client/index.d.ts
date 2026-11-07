/** Web Client bridge: carry this caller's effective language through the existing command wire. */
import type { Context } from '@deepseek-ai/cordis';
import { type UpdaterSettingsLocaleKey } from './locales.js';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Copy the updater's settings page renders. */
        'settings.updater': UpdaterSettingsLocaleKey;
    }
}
/** Dictionary namespace this bundle owns. */
export declare const NS = "settings.updater";
export interface ClientLocale {
    getSnapshot(): {
        readonly active: unknown;
    };
    register(ns: string, dicts: Record<string, Record<string, string>>): () => void;
}
/** Only our exact command receives presentation metadata; all other bytes stay unchanged. */
export declare function withClientLanguage(line: unknown, language: unknown): unknown;
/**
 * rc.4 has no caller-locale field or pre-command hook. Adapt its public execute method in this
 * Client's own namespace, retaining the generated getter's caller Context and lifecycle checks.
 * Never mutate a Host global, settings, transport, composer draft or unrelated command.
 */
export declare function installLanguageBridge(commands: object, activeLanguage: () => unknown): () => void;
export declare const inject: string[];
/** Host entry id this bundle owns in the profile, the settings namespace it serves. */
export declare const ENTRY_ID = "better-plugin-updater";
/** The bundle package name the Plugins page keys a bundle page by. */
export declare const BUNDLE_NAME = "dsh-better-plugin-updater";
/**
 * Record the factory resolver the Host assembles for this bundle.
 *
 * The Host resolves shared browser dependencies by specifier, so the page must reach React through
 * this resolver rather than a native dynamic import, which the browser cannot resolve at all.
 * @param resolver - the factory's `require`.
 */
export declare function captureHostRequire(resolver: (specifier: string) => unknown): void;
/**
 * Mount this bundle's settings page through the public bundle-config slot.
 *
 * The page is loaded on demand so the packaged factory still evaluates with no browser dependency
 * present, which keeps the bundle inspectable outside a browser. Registration is gated on the
 * namespace being served, because a page whose fields nothing would accept is worse than none.
 * @param ctx - Client runtime owning slots and served settings forms.
 */
export declare function mountSettingsPage(ctx: Context): void;
/** Mount the repository link independently of the bundle's settings form. */
export declare function mountRepositoryLink(ctx: Context): void;
/** Mount GitHub detail controls only after their Remote contribution is available. */
export declare function mountGitHubUpdate(ctx: Context): void;
export declare function apply(ctx: Context): void;
