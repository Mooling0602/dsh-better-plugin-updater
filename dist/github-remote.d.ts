/** Owner-only Remote facade for the GitHub detail-page update flow. */
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { GitHubUi } from './github-ui.js';
/** Expose only GitHub detail operations, leaving package writes to the shared coordinator. */
export declare class GitHubRemote extends TypertRemoteService {
    private readonly ui;
    constructor(ctx: Context, ui: GitHubUi);
    private owner;
    /** Identify one package without checking a registry or changing the profile. */
    describe(name: string): Promise<string>;
    /** Check one GitHub dependency and return its immutable confirmation when actionable. */
    check(name: string): Promise<string>;
    /** Apply only a plan issued by the detail-page adapter after explicit risk acknowledgement. */
    apply(id: string, acceptRemovalRisk: boolean, language: string): Promise<string>;
}
