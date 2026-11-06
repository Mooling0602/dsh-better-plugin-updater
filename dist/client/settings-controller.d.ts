/** Staged form for the updater bundle's own settings namespace. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import { type SettingsFieldState, type SettingsFormActions, type SettingsFormScope, type SettingsFormShell } from '@deepseek-ai/dsh-client-ui-primitives';
/** Fields this page edits, in render order. */
export interface UpdaterSettings {
    /** Language used for command output; `auto` follows the interface. */
    language?: string;
    /** Timeout applied to one registry or metadata request. */
    requestTimeoutMs?: number;
    /** Largest registry response this plugin reads. */
    maxMetadataBytes?: number;
    /** How long an update confirmation stays valid. */
    planTtlMs?: number;
    /** Environment variable holding a GitHub token. */
    githubTokenEnv?: string;
}
/** What the updater page renders. */
export interface UpdaterCardState extends SettingsFormShell {
    /** Command output language. */
    language: SettingsFieldState;
    /** Per-request timeout. */
    requestTimeoutMs: SettingsFieldState;
    /** Registry response cap. */
    maxMetadataBytes: SettingsFieldState;
    /** Confirmation lifetime. */
    planTtlMs: SettingsFieldState;
    /** Token variable name. */
    githubTokenEnv: SettingsFieldState;
}
/** The registration-side face the updater page's slot entry injects. */
export interface UpdaterCardFace extends SettingsFormActions {
    hooks: {
        /** Page snapshot bound by the renderer as useUpdaterCard. */
        updaterCard: SnapshotStore<UpdaterCardState>;
    };
}
/** Bridges the updater namespace onto the page's staged form. */
export declare class UpdaterCardController {
    private readonly form;
    private readonly store;
    /** @param scope - the bound settings scope for this plugin's namespace. */
    constructor(scope: SettingsFormScope<UpdaterSettings>);
    private projection;
    /**
     * Build the face the page's slot registration injects.
     * @returns the page's snapshot and its form actions.
     */
    inject(): UpdaterCardFace;
    /** Release accepted-value subscriptions. */
    dispose(): void;
}
