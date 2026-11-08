/** Shared setting labels and explanations for schema-based and Web settings pages. */
export const settingsCopy = {
  en: {
    language: { label: 'Plugin language', hint: 'Language the plugin uses for its own output. Auto follows the interface.' },
    requestTimeoutMs: { label: 'Request timeout', hint: 'Deadline for one metadata request, in milliseconds.' },
    maxMetadataBytes: { label: 'Max metadata size', hint: 'Largest metadata response accepted, in bytes.' },
    planTtlMs: { label: 'Confirmation lifetime', hint: 'How long an update confirmation stays valid, in milliseconds.' },
    githubTokenEnv: { label: 'GitHub token reference', hint: 'Credential reference naming the GitHub token, not the token value.' },
    languageOptions: { auto: 'Auto', en: 'English', zh: '简体中文' },
  },
  zh: {
    language: { label: '插件语言', hint: '插件自身输出使用的语言。自动跟随界面语言。' },
    requestTimeoutMs: { label: '请求超时', hint: '单次元数据请求的时限，单位毫秒。' },
    maxMetadataBytes: { label: '元数据大小上限', hint: '接受的最大元数据响应大小，单位字节。' },
    planTtlMs: { label: '确认有效期', hint: '更新确认保持有效的时长，单位毫秒。' },
    githubTokenEnv: { label: 'GitHub 令牌引用名', hint: '填写凭据引用名称，不是令牌本身。' },
    languageOptions: { auto: '自动', en: 'English', zh: '简体中文' },
  },
} as const;

/** Compose the single description used by schema-based settings clients. */
export function settingsDescription(field: keyof Omit<typeof settingsCopy.en, 'languageOptions'>, locale: 'en' | 'zh'): string {
  const { label, hint } = settingsCopy[locale][field];
  return locale === 'zh' ? `${label}（${hint.replace(/。$/, '')}）` : hint;
}
