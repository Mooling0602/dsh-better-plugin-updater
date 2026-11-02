import type { InstalledBundle, SourceContext, UpdateSource } from './types.js';
/** Normalize an explicit HTTPS registry without embedding credentials in plans or logs. */
export declare function normalizeRegistry(value: string): string;
/** Read a GitHub source identity without resolving its ref or executing Git. */
export declare function githubRepository(spec: string): {
    repository: string;
    baseSpec: string;
    ref: string;
} | undefined;
/** Read an exact GitHub release attachment URL, not an auto-generated source archive. */
export declare function releaseAttachment(spec: string): {
    repository: string;
    tag: string;
    asset: string;
} | undefined;
/** Infer a provider request; unsupported forms remain visible rather than falling back to another origin. */
export declare function inferSource(bundle: InstalledBundle, context: SourceContext): UpdateSource;
