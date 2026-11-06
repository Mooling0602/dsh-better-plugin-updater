/** Staged form for the updater bundle's own settings namespace. */
import { SettingsFormModel, settingsNumberField, settingsTextField, } from '@deepseek-ai/dsh-client-ui-primitives';
/** Bridges the updater namespace onto the page's staged form. */
export class UpdaterCardController {
    form;
    store;
    /** @param scope - the bound settings scope for this plugin's namespace. */
    constructor(scope) {
        this.form = new SettingsFormModel(scope, [
            settingsTextField('language'),
            settingsNumberField('requestTimeoutMs'),
            settingsNumberField('maxMetadataBytes'),
            settingsNumberField('planTtlMs'),
            settingsTextField('githubTokenEnv'),
        ]);
        this.store = this.form.bind(() => this.projection());
    }
    projection() {
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
    inject() {
        return { hooks: { updaterCard: this.store }, ...this.form.actions() };
    }
    /** Release accepted-value subscriptions. */
    dispose() { this.form.dispose(); }
}
//# sourceMappingURL=settings-controller.js.map