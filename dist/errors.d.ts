import type { Message, MessageKey, MessageParams } from './i18n.js';
/** An owned failure with an English message for wire compatibility and a translatable identity. */
export declare class UpdaterError extends Error {
    readonly detail: Message;
    constructor(key: MessageKey, params?: MessageParams);
}
/** Extract known diagnostics without translating arbitrary external error messages by text matching. */
export declare function errorDetail(error: unknown): Message | undefined;
