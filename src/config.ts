/** Validated Cordis configuration, with explicit source policy instead of implicit origin switching. */
import Schema from '@deepseek-ai/schemastery';
import { settingsCopy, settingsDescription } from './settings-copy.js';

const repository = Schema.string().pattern(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  .description('GitHub repository in owner/name format.').i18n({ zh: 'GitHub 仓库（格式为 owner/name）' });
const url = Schema.string().pattern(/^https?:\/\/\S+$/);

const allowPinned = Schema.boolean().default(false)
  .description('Allow updates to pinned dependencies.').i18n({ zh: '允许更新固定版本的依赖' });

/** Source policy for one package, discriminated on `kind`. */
export const Source = Schema.union([
  Schema.object({
    kind: Schema.const('npm').description('npm registry').i18n({ zh: 'npm registry' }),
    registry: url.description('Registry URL.').i18n({ zh: 'Registry 地址' }),
    channel: Schema.string().min(1).default('latest').description('Registry distribution tag.').i18n({ zh: 'Registry 分发标签' }),
    allowPinned,
  }),
  Schema.object({
    kind: Schema.const('github-source').description('GitHub source').i18n({ zh: 'GitHub 源码' }),
    repository,
    ref: Schema.string().min(1).description('GitHub branch or ref.').i18n({ zh: 'GitHub 分支或引用' }),
    allowPinned,
  }),
  Schema.object({
    kind: Schema.const('github-release').description('GitHub release').i18n({ zh: 'GitHub Release' }),
    repository,
    assetTemplate: Schema.string().min(1).description('Release asset filename template.').i18n({ zh: 'Release 附件文件名模板' }),
    allowPinned,
  }),
  Schema.object({
    kind: Schema.const('index').description('Plugin index').i18n({ zh: '插件索引' }),
    url: url.description('Plugin index URL.').i18n({ zh: '插件索引地址' }),
  }),
]);

/** Parsed runtime settings. Global indexes are reserved and never fetched in this version. */
export type UpdaterConfig = ReturnType<typeof Config>;

/**
 * Configuration is inert until a user explicitly invokes a check or update command.
 *
 * Cordis validates this schema before `apply` runs, so `apply` receives parsed
 * values. A volatile scalar is a live reference rather than a plain value, and
 * this plugin reads it through `.get()` at the point of use, so a value saved in
 * the settings page applies to the next request or command. Reading such a
 * field once during activation would freeze the value for the plugin lifetime.
 */
export const Config = Schema.object({
  language: Schema.union([
    Schema.const('auto').description(settingsCopy.en.languageOptions.auto).i18n({ zh: settingsCopy.zh.languageOptions.auto }),
    Schema.const('en').description(settingsCopy.en.languageOptions.en).i18n({ zh: settingsCopy.zh.languageOptions.en }),
    Schema.const('zh').description(settingsCopy.en.languageOptions.zh).i18n({ zh: settingsCopy.zh.languageOptions.zh }),
  ]).default('auto').volatile()
    .description(settingsDescription('language', 'en')).i18n({ zh: settingsDescription('language', 'zh') }),
  requestTimeoutMs: Schema.natural().min(100).max(120_000).default(15_000).volatile()
    .description(settingsDescription('requestTimeoutMs', 'en')).i18n({ zh: settingsDescription('requestTimeoutMs', 'zh') }),
  maxMetadataBytes: Schema.natural().min(1024).max(16 * 1024 * 1024).default(4 * 1024 * 1024).volatile()
    .description(settingsDescription('maxMetadataBytes', 'en')).i18n({ zh: settingsDescription('maxMetadataBytes', 'zh') }),
  planTtlMs: Schema.natural().min(1000).max(60 * 60_000).default(10 * 60_000).volatile()
    .description(settingsDescription('planTtlMs', 'en')).i18n({ zh: settingsDescription('planTtlMs', 'zh') }),
  /** Credential reference resolved by DSH (stored refs before environment fallbacks), not a token value. */
  githubTokenEnv: Schema.string().pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).default('GITHUB_TOKEN').volatile()
    .description(settingsDescription('githubTokenEnv', 'en')).i18n({ zh: settingsDescription('githubTokenEnv', 'zh') }),
  sources: Schema.dict(Source).default({})
    .description('Per-package source overrides, keyed by package name.').i18n({ zh: '插件来源覆盖（以包名为键）' }),
  indexes: Schema.array(url.description('Plugin index URL.').i18n({ zh: '插件索引地址' })).default([])
    .description('Reserved index sources. Accepted and never fetched.').i18n({ zh: '预留索引来源（接受配置但不会获取）' }),
});

