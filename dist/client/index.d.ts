/** Web Client bridge: carry this caller's effective language through the existing command wire. */
import type { Context } from '@deepseek-ai/cordis';
export interface ClientLocale {
    getSnapshot(): {
        readonly active: unknown;
    };
}
/** Only our exact command receives presentation metadata; all other bytes stay unchanged. */
export declare function withClientLanguage(line: unknown, language: unknown): unknown;
/**
 * rc.4 has no caller-locale field or pre-command hook. Adapt its public execute method in this
 * Client's own namespace, retaining the generated getter's caller Context and lifecycle checks.
 * Never mutate a Host global, settings, transport, composer draft or unrelated command.
 */
export declare function installLanguageBridge(commands: object, activeLanguage: () => unknown): () => void;
export declare const inject: string[];
export declare function apply(ctx: Context): void;
