/** Public contracts shared by source readers, check providers, and the update coordinator. */
import type { Message } from './i18n.js';
/** The package-level facts returned by the DSH plugin manager. */
export interface InstalledBundle {
    readonly name: string;
    readonly version?: string;
    readonly source?: string;
    readonly enabled: boolean;
    readonly installed: boolean;
    readonly removable: boolean;
    readonly availability: 'profile' | 'installation' | 'missing';
    readonly readOnlyReason?: string;
    readonly error?: {
        readonly code: string;
        readonly diagnostic?: string;
    };
    readonly installTarget?: {
        readonly spec: string;
        readonly version: string;
    };
}
/** A plugin-specific choice. Index choices are reserved and explicitly unsupported in this version. */
export type SourceOverride = {
    readonly kind: 'npm';
    readonly registry?: string | undefined;
    readonly channel?: string | undefined;
    readonly allowPinned?: boolean;
} | {
    readonly kind: 'github-source';
    readonly repository: string;
    readonly ref?: string | undefined;
    readonly allowPinned?: boolean;
} | {
    readonly kind: 'github-release';
    readonly repository: string;
    readonly assetTemplate: string;
    readonly allowPinned?: boolean;
} | {
    readonly kind: 'index';
    readonly url: string;
};
/** A registry package and the requested npm channel. */
export interface NpmSource {
    readonly kind: 'npm';
    readonly packageName: string;
    readonly registry: string;
    readonly channel: string;
    readonly pinned: boolean;
}
/** A GitHub repository tracking a ref, with an optional lockfile-resolved baseline. */
export interface GithubSource {
    readonly kind: 'github-source';
    readonly repository: string;
    readonly ref: string;
    readonly baseSpec: string;
    readonly currentRevision?: string;
    readonly pinned: boolean;
}
/** A release attachment selected by exact name after expanding {tag} and {version}. */
export interface GithubReleaseSource {
    readonly kind: 'github-release';
    readonly repository: string;
    readonly assetTemplate: string;
    readonly currentTag?: string;
    readonly pinned: boolean;
}
/** Supported provider requests, or an explicit reason a source cannot be checked. */
export type UpdateSource = NpmSource | GithubSource | GithubReleaseSource | {
    readonly kind: 'unsupported';
    readonly reason: string;
    readonly detail?: Message;
};
/** An exact install target produced by a read-only check. */
export interface UpdateCandidate {
    readonly spec: string;
    readonly version?: string;
    readonly revision?: string;
    readonly registry?: string;
    readonly url?: string;
}
/** Provider comparison result. Unknown baselines never become actionable updates. */
export interface ProviderResult {
    readonly status: 'current' | 'update-available' | 'pinned' | 'unknown' | 'unsupported';
    readonly message: string;
    readonly detail?: Message;
    readonly candidate?: UpdateCandidate;
}
/** Bounded JSON requests; credentials are supplied only to the exact GitHub API host. */
export interface JsonClient {
    get(url: string, signal?: AbortSignal): Promise<unknown>;
}
/** A source-specific, read-only version or revision check. */
export interface UpdateProvider {
    readonly kind: 'npm' | 'github-source' | 'github-release';
    check(bundle: InstalledBundle, source: UpdateSource, client: JsonClient, signal?: AbortSignal, gitBranch?: string): Promise<ProviderResult>;
}
/** Source inference inputs provided by the host adapter or tests. */
export interface SourceContext {
    readonly registry: string;
    readonly override?: SourceOverride;
    readonly currentRevision?: string | null;
    readonly gitBranch?: string;
}
/** User-visible inventory and provider outcomes. */
export interface CheckResult {
    readonly bundle: InstalledBundle;
    readonly source: UpdateSource;
    readonly status: ProviderResult['status'] | 'skipped' | 'error';
    readonly message: string;
    readonly detail?: Message;
    readonly candidate?: UpdateCandidate;
}
/** Immutable in-memory approval target, valid only while its originating service runs. */
export interface UpdatePlan {
    readonly id: string;
    readonly createdAt: string;
    readonly expiresAt: string;
    readonly command: string;
    readonly gitBranch?: string;
    readonly bundle: InstalledBundle;
    readonly source: UpdateSource;
    readonly candidate: UpdateCandidate;
    readonly warnings: readonly string[];
    readonly warningDetails?: readonly Message[];
}
/** The subset of DSH management outcomes consumed by this adapter. */
export interface ManagementResult {
    readonly application: 'applied' | 'restart-required' | 'failed' | 'cancelled' | 'overridden';
    readonly changed?: boolean;
    readonly bundle?: string;
    readonly version?: string;
    readonly error?: {
        readonly code: string;
        readonly diagnostic?: string;
    };
    readonly pendingBuilds?: readonly string[];
    readonly restartReason?: string;
}
/** Structural adapter for the host service, deliberately isolated from DSH implementation imports. */
export interface PluginManager {
    listBundles(): Promise<InstalledBundle[]>;
    registries(): Promise<{
        readonly registry: string | null;
        readonly resolved?: string | null;
    }>;
    removeBundle(name: string): Promise<ManagementResult>;
    installBundle(spec: string, options: {
        readonly enabled: boolean;
        readonly requestId: string;
        readonly registry?: string;
        readonly saveExact: boolean;
    }): Promise<ManagementResult>;
}
/** An update is not a transaction; the outcome names both stages and the observed remaining package. */
export interface ApplyResult {
    readonly status: 'updated' | 'restart-required' | 'failed';
    readonly message: string;
    readonly detail?: Message;
    readonly removal?: ManagementResult;
    readonly installation?: ManagementResult;
    readonly remaining?: InstalledBundle;
    readonly recovery?: UpdateCandidate;
    /** The package manager's own text when staging failed before removal, preserved verbatim. */
    readonly diagnostic?: string;
}
