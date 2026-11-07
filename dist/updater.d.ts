import type { PrewarmOptions } from './prewarm.js';
import type { ApplyResult, CheckResult, InstalledBundle, JsonClient, PluginManager, SourceOverride, UpdatePlan, UpdateProvider } from './types.js';
/** Dependencies and policy injected by the Cordis adapter or isolated tests. */
export interface UpdaterOptions {
    readonly manager: PluginManager;
    readonly client: JsonClient;
    readonly providers: readonly UpdateProvider[];
    readonly overrides?: Readonly<Record<string, SourceOverride>>;
    readonly currentRevision?: (bundle: InstalledBundle) => Promise<string | null | undefined>;
    /** A fixed lifetime, or a reader evaluated per plan so a saved setting applies at once. */
    readonly planTtlMs?: number | (() => number);
    readonly now?: () => number;
    /** Package-manager facts for staging a registry target; omitted means staging is skipped. */
    readonly prewarm?: PrewarmOptions & {
        readonly profileDir: string;
    };
}
/** Identify the active executor, which can be checked but cannot update itself. */
export declare function isSelfBundle(bundle: Pick<InstalledBundle, 'name'>): boolean;
/** Decide whether a checked target may enter an update confirmation. */
export declare function isActionable(result: CheckResult | undefined, allowPinned?: boolean): boolean;
/** A profile-local coordinator. Construction does no I/O; checks never perform package writes. */
export declare class Updater {
    private readonly options;
    private readonly plans;
    private readonly planOverrides;
    private readonly checks;
    private readonly abort;
    private readonly active;
    private applying;
    private readonly now;
    private readonly ttl;
    constructor(options: UpdaterOptions);
    /** Read the plan lifetime, so a saved setting applies to the next plan without a reload. */
    private ttlMs;
    /** Read only the public bundle facts, without UI metadata or unrelated profile data. */
    list(): Promise<InstalledBundle[]>;
    /** Check one or all bundles sequentially, bounding traffic and isolating per-package failures. */
    check(name?: string, signal?: AbortSignal, gitBranch?: string): Promise<CheckResult[]>;
    /** Check one GitHub-backed bundle without issuing requests for other source kinds. */
    checkGithub(name: string, signal?: AbortSignal): Promise<CheckResult | undefined>;
    private source;
    private checkInternal;
    /** Freeze a checked target, with optional one-time authorization for an eligible pin. */
    prepare(result: CheckResult | undefined, allowPinned?: boolean, gitBranch?: string): UpdatePlan;
    /** Withdraw an unconfirmed plan without touching any package. */
    discard(id: string): void;
    /** Execute one saved plan only after explicit acknowledgement; never approve dependency scripts or compatibility exemptions. */
    apply(id: string, acceptRemovalRisk: boolean): Promise<ApplyResult>;
    private applyInternal;
    private stage;
    private recovery;
    private observe;
    private track;
    /** Abort outstanding metadata reads and await active updates before the owning plugin unloads. */
    dispose(): Promise<void>;
}
