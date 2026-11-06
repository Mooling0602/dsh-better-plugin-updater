/**
 * Locale bundles for the updater's settings page.
 *
 * This is the Client half of the page's copy, separate from `src/locales/`
 * which the Host renders command output from. The keys are a compile-time
 * contract: the English dictionary defines them, and every other language must
 * supply all of them and nothing else.
 */
import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives';
/** Locale keys the settings page renders. */
export type UpdaterSettingsLocaleKey = 'title' | 'summary' | 'language' | 'languageHint' | 'languageAuto' | 'languageEn' | 'languageZh' | 'requestTimeout' | 'requestTimeoutHint' | 'maxMetadata' | 'maxMetadataHint' | 'planLifetime' | 'planLifetimeHint' | 'tokenVariable' | 'tokenVariableHint' | 'overridden' | 'reset' | 'invalid' | 'readOnly' | 'unavailable' | 'save' | 'saving' | 'saveFailed';
/** English copy, which also defines the key set. */
export declare const en: Record<UpdaterSettingsLocaleKey, string>;
/** Simplified Chinese copy. */
export declare const zh: Record<UpdaterSettingsLocaleKey, string>;
/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export declare function formLabels(t: (key: UpdaterSettingsLocaleKey) => string): SettingsFormLabels;
