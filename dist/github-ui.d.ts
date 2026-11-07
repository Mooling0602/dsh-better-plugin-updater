import { Updater } from './updater.js';
import type { ApplyResult, CheckResult, UpdatePlan } from './types.js';
/** A readable GitHub dependency that can be presented on a bundle detail page. */
export interface GitHubDetail {
    readonly name: string;
    readonly repository: string;
    readonly kind: 'github-source' | 'github-release';
    readonly installed?: string;
    readonly fixedPin: boolean;
}
/** A check result and its separately identified, immutable confirmation plan. */
export interface GitHubDetailCheck {
    readonly result: CheckResult;
    readonly confirmation?: {
        readonly id: string;
        readonly plan: UpdatePlan;
    };
}
/** Restrict a page adapter to GitHub operations without accepting a browser-supplied target. */
export declare class GitHubUi {
    private readonly updater;
    private readonly now;
    private readonly confirmations;
    private readonly checking;
    constructor(updater: Updater, now?: () => number);
    /** Identify a GitHub source using current Host inventory without making a network request. */
    describe(name: string): Promise<GitHubDetail | undefined>;
    /** Check through the same providers as the slash command and freeze any actionable target. */
    check(name: string, signal?: AbortSignal): Promise<GitHubDetailCheck | undefined>;
    /** Apply only a single-use plan issued by this adapter after explicit risk acknowledgement. */
    apply(id: string, acceptRemovalRisk: boolean): Promise<ApplyResult>;
}
