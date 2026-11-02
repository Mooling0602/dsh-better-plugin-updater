/** Match only supported, well-formed BCP 47-style tags; never guess from OS or process globals. */
export function normalizeLanguage(value) {
    if (typeof value !== 'string' || value.length > 63 || value.trim() !== value || !/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value))
        return undefined;
    const primary = value.split('-')[0]?.toLowerCase();
    return primary === 'en' || primary === 'zh' ? primary : undefined;
}
//# sourceMappingURL=language.js.map