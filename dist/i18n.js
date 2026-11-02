/** Typed command dictionaries and locale selection, independent of browser or OS globals. */
import { en } from './locales/en.js';
import { zh } from './locales/zh.js';
/** The two complete dictionaries, exported for coverage and placeholder-parity tests. */
export const dictionaries = { en, zh };
/** Translate owned copy; package identifiers and supplied arguments remain literal. */
export function t(language, key, params = {}) {
    const template = dictionaries[language][key];
    return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (whole, name) => Object.hasOwn(params, name) ? String(params[name]) : whole);
}
/** Render an optional diagnostic descriptor, preserving unknown third-party text verbatim. */
export function translate(detail, fallback, language) {
    return detail && Object.hasOwn(en, detail.key) ? t(language, detail.key, detail.params) : fallback;
}
/** Build the English-compatible message fields used by core results and machine callers. */
export function message(key, params) {
    return { message: t('en', key, params), detail: { key, ...(params === undefined ? {} : { params }) } };
}
/** Explicit configuration wins; auto follows validated per-call UI context before saved Host settings. */
export function resolveLanguage(choice, settings, clientLanguage) {
    if (choice !== 'auto')
        return choice;
    if (clientLanguage === 'en' || clientLanguage === 'zh')
        return clientLanguage;
    try {
        const entries = settings?.describe({ redactSecrets: true }).filter(entry => entry.ns === 'locale');
        if (entries?.length !== 1)
            return 'en';
        const value = entries[0]?.value;
        if (!value || typeof value !== 'object' || !('preference' in value) || typeof value.preference !== 'string')
            return 'en';
        return /^zh(?:-|$)/i.test(value.preference) ? 'zh' : 'en';
    }
    catch {
        return 'en';
    }
}
//# sourceMappingURL=i18n.js.map