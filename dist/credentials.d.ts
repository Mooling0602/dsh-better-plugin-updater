/** Minimal read-only structural view of ctx.credentials; the provider owns storage and precedence. */
export interface CredentialReferences {
    resolve(reference: string): Promise<{
        readonly value: string;
    } | undefined>;
}
/** Resolve per request so stored rotations/removals take effect without caching or reactivation. */
export declare function resolveGithubToken(reference: string, credentials?: CredentialReferences, environment?: Readonly<Record<string, string | undefined>>): Promise<string | undefined>;
