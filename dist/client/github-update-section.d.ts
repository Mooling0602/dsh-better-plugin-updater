/** A self-contained GitHub update section for a bundle detail page. */
import { type ReactNode } from 'react';
/** A GitHub source and its currently installed revision. */
export type GitHubUpdateSource = {
    readonly kind: 'npm';
} | {
    readonly kind: 'github';
    readonly id: string;
    readonly repository: string;
    readonly mode: 'commit' | 'release';
    readonly installed: string;
    readonly fixedPin: boolean;
};
/** A candidate returned by the caller's check, identified by the exact target to apply. */
export interface GitHubUpdateCandidate {
    readonly target: string;
    readonly detail?: string;
    readonly confirmationId: string;
    readonly warnings: readonly string[];
}
/** A check result distinguishes a current target from an unavailable comparison. */
export interface GitHubUpdateCheck {
    readonly status: 'current' | 'update-available' | 'pinned' | 'unknown' | 'unsupported' | 'skipped' | 'error';
    readonly candidate: GitHubUpdateCandidate | null;
    readonly installed?: string;
    readonly pinned?: boolean;
    readonly detail?: string;
}
/** The outcome reported by the update service, including any unresolved risk. */
export interface GitHubUpdateResult {
    readonly status: 'success' | 'failed' | 'unknown';
    readonly detail: string;
    readonly risk?: string;
    readonly steps?: readonly {
        readonly label: string;
        readonly state: 'done' | 'failed' | 'unknown';
    }[];
}
/** All user-facing text used by the GitHub update section. */
export interface GitHubUpdateLabels {
    readonly title: string;
    readonly check: string;
    readonly checking: string;
    readonly unchecked: string;
    readonly current: string;
    readonly available: string;
    readonly availableTarget: string;
    readonly latest: string;
    readonly failed: string;
    readonly retry: string;
    readonly update: string;
    readonly installed: string;
    readonly fixedPin: string;
    readonly source: string;
    readonly commit: string;
    readonly release: string;
    readonly confirmTitle: string;
    readonly cancel: string;
    readonly close: string;
    readonly running: string;
    readonly finish: string;
    /** Explain that the update is non-atomic, can leave a partial installation, and rollback is not guaranteed. */
    readonly nonAtomicRisk: string;
    readonly acknowledgeRisk: string;
    readonly pinnedNotice: string;
    readonly success: string;
    readonly updateFailed: string;
    readonly unknown: string;
    readonly sourceChanged: string;
}
/** The caller supplies service operations and translated presentation text. */
export interface GitHubUpdateSectionProps {
    readonly source: GitHubUpdateSource;
    readonly labels: GitHubUpdateLabels;
    readonly onCheck: (source: Extract<GitHubUpdateSource, {
        kind: 'github';
    }>) => Promise<GitHubUpdateCheck>;
    readonly onUpdate: (source: Extract<GitHubUpdateSource, {
        kind: 'github';
    }>, candidate: GitHubUpdateCandidate) => Promise<GitHubUpdateResult>;
    readonly onDialogChange?: (open: boolean) => void;
}
/** Class the injected rule targets; the shared modal card fixes its own width. */
export declare const DIALOG_CLASS = "dsh-updater-github-dialog";
/**
 * Widen this dialog only. The shared modal card owns a fixed 380px width and exposes no width prop,
 * while the release URLs and commit hashes shown here need more room to stay readable.
 * @returns a disposer that removes the injected rule, or a no-op outside a browser.
 */
export declare function installDialogStyles(): () => void;
/** Render only GitHub sources and reset local state whenever their identity or installed pin changes. */
export declare function GitHubUpdateSection(props: GitHubUpdateSectionProps): ReactNode;
