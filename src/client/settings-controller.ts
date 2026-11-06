/** Staged form for the updater bundle's own settings namespace. */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import {
  SettingsFormModel, settingsNumberField, settingsTextField,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormScope, type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives';

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
export class UpdaterCardController {
  private readonly form: SettingsFormModel<UpdaterSettings>;
  private readonly store: SnapshotStore<UpdaterCardState>;

  /** @param scope - the bound settings scope for this plugin's namespace. */
  constructor(scope: SettingsFormScope<UpdaterSettings>) {
    this.form = new SettingsFormModel(scope, [
      settingsTextField('language'),
      settingsNumberField('requestTimeoutMs'),
      settingsNumberField('maxMetadataBytes'),
      settingsNumberField('planTtlMs'),
      settingsTextField('githubTokenEnv'),
    ]);
    this.store = this.form.bind(() => this.projection());
  }

  private projection(): UpdaterCardState {
    return {
      ...this.form.shell(),
      language: this.form.field('language'),
      requestTimeoutMs: this.form.field('requestTimeoutMs'),
      maxMetadataBytes: this.form.field('maxMetadataBytes'),
      planTtlMs: this.form.field('planTtlMs'),
      githubTokenEnv: this.form.field('githubTokenEnv'),
    };
  }

  /**
   * Build the face the page's slot registration injects.
   * @returns the page's snapshot and its form actions.
   */
  inject(): UpdaterCardFace {
    return { hooks: { updaterCard: this.store }, ...this.form.actions() };
  }

  /** Release accepted-value subscriptions. */
  dispose(): void { this.form.dispose(); }
}
