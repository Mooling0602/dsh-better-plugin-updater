/**
 * Locale bundles for the updater's settings page.
 *
 * This is the Client half of the page's copy, separate from `src/locales/`
 * which the Host renders command output from. The keys are a compile-time
 * contract: the English dictionary defines them, and every other language must
 * supply all of them and nothing else.
 */
/** English copy, which also defines the key set. */
export const en = {
    title: 'Plugin updater',
    summary: 'Checks registry and GitHub releases, then applies the update you review.',
    language: 'Plugin language',
    languageHint: 'Language the plugin uses for its own output. Auto follows the interface.',
    languageAuto: 'Auto',
    languageEn: 'English',
    languageZh: '简体中文',
    requestTimeout: 'Request timeout',
    requestTimeoutHint: 'Deadline for one registry or metadata request, in milliseconds.',
    maxMetadata: 'Max metadata size',
    maxMetadataHint: 'Largest registry response this plugin reads, in bytes.',
    planLifetime: 'Confirmation lifetime',
    planLifetimeHint: 'How long an update confirmation stays valid, in milliseconds.',
    tokenVariable: 'GitHub token variable',
    tokenVariableHint: 'Name of the environment variable holding a token. The token itself never enters this page.',
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
export const zh = {
    title: '插件更新助手',
    summary: '检查 registry 与 GitHub 上的发布，然后执行你确认过的更新。',
    language: '插件语言',
    languageHint: '插件自身输出使用的语言。自动跟随界面语言。',
    languageAuto: '自动',
    languageEn: 'English',
    languageZh: '简体中文',
    requestTimeout: '请求超时',
    requestTimeoutHint: '单次 registry 或元数据请求的时限，单位为毫秒。',
    maxMetadata: '元数据大小上限',
    maxMetadataHint: '本插件接受的 registry 响应最大字节数。',
    planLifetime: '确认有效期',
    planLifetimeHint: '更新确认保持有效的时长，单位为毫秒。',
    tokenVariable: 'GitHub 令牌变量名',
    tokenVariableHint: '保存令牌的环境变量名。令牌本身不会出现在本页。',
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
export function formLabels(t) {
    return {
        unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'),
        save: t('save'), saving: t('saving'),
    };
}
//# sourceMappingURL=locales.js.map