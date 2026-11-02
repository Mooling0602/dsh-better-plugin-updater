/** Small browser-safe language vocabulary; no Host services or translation dictionaries. */
export type Language = 'en' | 'zh';
/** Match only supported, well-formed BCP 47-style tags; never guess from OS or process globals. */
export declare function normalizeLanguage(value: unknown): Language | undefined;
