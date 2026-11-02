import type { ApplyResult, CheckResult, InstalledBundle, JsonClient, PluginManager, SourceOverride, UpdatePlan, UpdateProvider } from './types.js';
/** Dependencies and policy injected by the Cordis adapter or isolated tests. */
export interface UpdaterOptions {
    readonly manager: PluginManager;
    readonly client: JsonClient;
    readonly providers: readonly UpdateProvider[];
    readonly overrides?: Readonly<Record<string, SourceOverride>>;
    readonly currentRevision?: (bundle: InstalledBundle) => Promise<string | undefined>;
    readonly planTtlMs?: number;
    readonly now?: () => number;
}
/** A profile-local coordinator. Construction does no I/O; checks never perform package writes. */
export declare class Updater {
    private readonly options;
    private readonly plans;
    private readonly abort;
    private readonly active;
    private applying;
    private readonly now;
    private readonly ttl;
    constructor(options: UpdaterOptions);
    /** Read only the public bundle facts, without UI metadata or unrelated profile data. */
    list(): Promise<InstalledBundle[]>;
    /** Check one or all bundles sequentially, bounding traffic and isolating per-package failures. */
    check(name?: string, signal?: AbortSignal): Promise<CheckResult[]>;
    private source;
    private checkInternal;
    /** Freeze an exact target for ten minutes by default; no package is removed or installed. */
    plan(name: string, signal?: AbortSignal): Promise<UpdatePlan>;
    /** Freeze a previously checked result without fetching a potentially different target. */
    prepare(result: CheckResult | undefined): UpdatePlan;
    /** Execute one saved plan only after explicit acknowledgement; never approve dependency scripts or compatibility exemptions. */
    apply(id: string, acceptRemovalRisk: boolean): Promise<ApplyResult>;
    /** Execute an already-authorized durable target, revalidating its installed baseline. */
    applyDeferred(plan: UpdatePlan): Promise<ApplyResult>;
    private applyInternal;
    private recovery;
    private observe;
    private track;
    /** Abort outstanding metadata reads and await active updates before the owning plugin unloads. */
    dispose(): Promise<void>;
}
