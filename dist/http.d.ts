import type { JsonClient } from './types.js';
/** Request limits and injectable transport. A token is sent only to api.github.com. */
export interface JsonClientOptions {
    readonly timeoutMs?: number;
    readonly maxBytes?: number;
    /** Static token for standalone consumers; ignored when a resolver is supplied. */
    readonly githubToken?: string;
    /** Resolve anew only for the exact GitHub API origin. Absence does not fall back to the static token. */
    readonly resolveGithubToken?: () => Promise<string | undefined>;
    readonly fetch?: typeof globalThis.fetch;
}
/** Create a JSON client with a deadline covering both headers and streamed body consumption. */
export declare function createJsonClient(options?: JsonClientOptions): JsonClient;
