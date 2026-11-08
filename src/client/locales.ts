/**
 * Locale bundles for the updater's settings page.
 *
 * This is the Client half of the page's copy, separate from `src/locales/`
 * which the Host renders command output from. Settings shared with the schema
 * come from `settings-copy.ts`. The keys are a compile-time
 * contract: the English dictionary defines them, and every other language must
 * supply all of them and nothing else.
 */

import type { SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives';
import { settingsCopy } from '../settings-copy.js';

/** Locale keys the settings page renders. */
export type UpdaterSettingsLocaleKey =
  | 'title' | 'summary'
  | 'language' | 'languageHint' | 'languageAuto' | 'languageEn' | 'languageZh'
  | 'requestTimeout' | 'requestTimeoutHint'
  | 'maxMetadata' | 'maxMetadataHint'
  | 'planLifetime' | 'planLifetimeHint'
  | 'tokenVariable' | 'tokenVariableHint'
  | 'overridden' | 'reset' | 'invalid'
  | 'readOnly' | 'unavailable' | 'save' | 'saving' | 'saveFailed';

/** English copy, which also defines the key set. */
export const en: Record<UpdaterSettingsLocaleKey, string> = {
  title: 'Plugin updater',
  summary: 'Checks registry and GitHub releases, then applies the update you review.',
  language: settingsCopy.en.language.label,
  languageHint: settingsCopy.en.language.hint,
  languageAuto: settingsCopy.en.languageOptions.auto,
  languageEn: settingsCopy.en.languageOptions.en,
  languageZh: settingsCopy.en.languageOptions.zh,
  requestTimeout: settingsCopy.en.requestTimeoutMs.label,
  requestTimeoutHint: settingsCopy.en.requestTimeoutMs.hint,
  maxMetadata: settingsCopy.en.maxMetadataBytes.label,
  maxMetadataHint: settingsCopy.en.maxMetadataBytes.hint,
  planLifetime: settingsCopy.en.planTtlMs.label,
  planLifetimeHint: settingsCopy.en.planTtlMs.hint,
  tokenVariable: settingsCopy.en.githubTokenEnv.label,
  tokenVariableHint: settingsCopy.en.githubTokenEnv.hint,
  overridden: 'Overridden',
  reset: 'Reset',
  invalid: 'Enter a whole number within the allowed range.',
  readOnly: 'This deployment stores settings read-only.',
  unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
};

/** Simplified Chinese copy. */
export const zh: Record<UpdaterSettingsLocaleKey, string> = {
  title: '插件更新助手',
  summary: '检查 registry 与 GitHub 上的发布，然后执行你确认过的更新。',
  language: settingsCopy.zh.language.label,
  languageHint: settingsCopy.zh.language.hint,
  languageAuto: settingsCopy.zh.languageOptions.auto,
  languageEn: settingsCopy.zh.languageOptions.en,
  languageZh: settingsCopy.zh.languageOptions.zh,
  requestTimeout: settingsCopy.zh.requestTimeoutMs.label,
  requestTimeoutHint: settingsCopy.zh.requestTimeoutMs.hint,
  maxMetadata: settingsCopy.zh.maxMetadataBytes.label,
  maxMetadataHint: settingsCopy.zh.maxMetadataBytes.hint,
  planLifetime: settingsCopy.zh.planTtlMs.label,
  planLifetimeHint: settingsCopy.zh.planTtlMs.hint,
  tokenVariable: settingsCopy.zh.githubTokenEnv.label,
  tokenVariableHint: settingsCopy.zh.githubTokenEnv.hint,
  overridden: '已覆盖',
  reset: '恢复默认',
  invalid: '请填写允许范围内的整数。',
  readOnly: '本部署的设置为只读。',
  unavailable: '该插件当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
};

/**
 * The form frame's copy, read from this page's dictionary.
 * @param t - the page's locale reader.
 * @returns the labels the shared settings form renders.
 */
export function formLabels(t: (key: UpdaterSettingsLocaleKey) => string): SettingsFormLabels {
  return {
    unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'),
    save: t('save'), saving: t('saving'),
  };
}
