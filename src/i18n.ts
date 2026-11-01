/** Typed command dictionaries and locale selection, independent of browser or OS globals. */
import { en } from './locales/en.js';
import { zh } from './locales/zh.js';
import type { Language } from './language.js';
export type { Language } from './language.js';
/** Stable dictionary identifiers used by structured diagnostics. */
export type MessageKey = keyof typeof en;
/** Named interpolation arguments, never executable templates. */
export type MessageParams = Readonly<Record<string, string | number>>;
/** Optional localization metadata beside the unchanged English wire text. */
export interface Message { readonly key: MessageKey; readonly params?: MessageParams }
/** The two complete dictionaries, exported for coverage and placeholder-parity tests. */
export const dictionaries = { en, zh };

/** Translate owned copy; package identifiers and supplied arguments remain literal. */
export function t(language: Language, key: MessageKey, params: MessageParams = {}): string {
  const template = dictionaries[language][key];
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole);
}

/** Render an optional diagnostic descriptor, preserving unknown third-party text verbatim. */
export function translate(detail: Message | undefined, fallback: string, language: Language): string {
  return detail && Object.hasOwn(en, detail.key) ? t(language, detail.key, detail.params) : fallback;
}

/** Build the English-compatible message fields used by core results and machine callers. */
export function message(key: MessageKey, params?: MessageParams): { message: string; detail: Message } {
  return { message: t('en', key, params), detail: { key, ...(params === undefined ? {} : { params }) } };
}

/** Optional, read-only view of DSH's settings form projection. */
export interface LocaleSettings {
  describe(options: { readonly redactSecrets: true }): readonly { readonly ns: string; readonly value?: unknown }[];
}

/** Explicit configuration wins; auto follows validated per-call UI context before saved Host settings. */
export function resolveLanguage(choice: 'auto' | Language, settings?: LocaleSettings, clientLanguage?: Language): Language {
  if (choice !== 'auto') return choice;
  if (clientLanguage === 'en' || clientLanguage === 'zh') return clientLanguage;
  try {
    const entries = settings?.describe({ redactSecrets: true }).filter(entry => entry.ns === 'locale');
    if (entries?.length !== 1) return 'en';
    const value = entries[0]?.value;
    if (!value || typeof value !== 'object' || !('preference' in value) || typeof value.preference !== 'string') return 'en';
    return /^zh(?:-|$)/i.test(value.preference) ? 'zh' : 'en';
  } catch { return 'en'; }
}
