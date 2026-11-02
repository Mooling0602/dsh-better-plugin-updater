/** Stable owned diagnostics. Unknown dependency and host errors retain their original text. */
import { t } from './i18n.js';
/** An owned failure with an English message for wire compatibility and a translatable identity. */
export class UpdaterError extends Error {
    detail;
    constructor(key, params) {
        super(t('en', key, params));
        this.name = 'UpdaterError';
        this.detail = { key, ...(params === undefined ? {} : { params }) };
    }
}
/** Extract known diagnostics without translating arbitrary external error messages by text matching. */
export function errorDetail(error) {
    if (error instanceof UpdaterError)
        return error.detail;
    if (error instanceof Error && error.name === 'AbortError')
        return { key: 'error.cancelled' };
    return undefined;
}
//# sourceMappingURL=errors.js.map