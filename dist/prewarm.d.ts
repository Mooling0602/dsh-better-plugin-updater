import type { Message } from './i18n.js';
import type { UpdateCandidate, UpdateSource } from './types.js';
/** How a warm attempt ended. `skipped` means this source kind has no offline guarantee to stage. */
export type PrewarmStatus = 'ready' | 'skipped' | 'failed';
/** The outcome of one warm attempt, keeping the package manager's own text for the caller to render. */
export interface PrewarmResult {
    readonly status: PrewarmStatus;
    readonly detail?: Message;
    readonly diagnostic?: string;
}
/** One command invocation, isolated so a test never reaches a real package manager. */
export type PrewarmRunner = (command: string, args: readonly string[], options: {
    readonly cwd: string;
    readonly env: Readonly<Record<string, string>>;
    readonly timeoutMs: number;
}) => Promise<{
    readonly exitCode: number;
    readonly output: string;
}>;
/** Package-manager facts supplied by the Cordis adapter, so a warm run and DSH's install agree on one store. */
export interface PrewarmOptions {
    /** Executable DSH itself uses for package operations. */
    readonly command?: string;
    /** Leading arguments that executable needs, such as a bundled entry point. */
    readonly args?: readonly string[];
    /**
     * Extra environment for the warm run, layered over the ambient one. A caller that supplies DSH's
     * own package-operation environment reproduces the executable lookup and registry settings the
     * real install will use, so both operate on one store.
     */
    readonly env?: Readonly<Record<string, string>>;
    /** Deadline for one warm run. */
    readonly timeoutMs?: number;
    /**
     * Where the throwaway project is created. It defaults to the operating system temporary
     * directory, which is what `$TMPDIR` names on a system that defines it. The staged package
     * survives in the store, not here, so this location never has to outlive the run.
     */
    readonly tempRoot?: string;
    /** Command runner; isolated tests replace this. */
    readonly run?: PrewarmRunner;
}
/**
 * Decide whether a checked target can be staged for an offline install.
 *
 * Only a registry package qualifies. Its complete dependency closure becomes reusable once the
 * store holds it. A GitHub release attachment is a remote tarball URL that pnpm resolves over the
 * network on every run, and a Git source is fetched again, so neither can be served from a store.
 * @param source The checked source for one bundle.
 * @param candidate The exact target the pending plan recorded.
 * @returns True when staging can make the later installation work without a network.
 */
export declare function isPrewarmable(source: UpdateSource, candidate: UpdateCandidate | undefined): boolean;
/**
 * Populate the profile's package store with one exact npm target and its dependency closure.
 *
 * The package is installed into a throwaway project under the temporary directory, so no profile
 * manifest, lockfile or `node_modules` entry is touched and no bundle is activated. The store is
 * what outlives the run, and the project directory is removed once the run settles.
 * @param source The checked source of the bundle being updated.
 * @param candidate The exact install target the pending plan recorded.
 * @param profileDir Directory of the profile DSH will install into.
 * @param options Package-manager facts and the command runner.
 * @returns Whether the closure is staged, skipped as unsupported, or failed with a diagnostic.
 */
export declare function prewarm(source: UpdateSource, candidate: UpdateCandidate | undefined, profileDir: string, options?: PrewarmOptions): Promise<PrewarmResult>;
