/**
 * The updater's settings page: the scalar options this bundle's Host entry
 * reads, staged through the shared settings form so a save is the only write.
 */

import { SegmentedControl, SettingsForm, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { formLabels } from './locales.js';
import type { UpdaterCardFace, UpdaterCardState } from './settings-controller.js';

/** The command languages the schema accepts, in the order the selector shows them. */
const LANGUAGES = [
  { value: 'auto', key: 'languageAuto' },
  { value: 'en', key: 'languageEn' },
  { value: 'zh', key: 'languageZh' },
] as const;

/** One accepted command language. */
type Language = typeof LANGUAGES[number]['value'];

/** The token-backed layout the shared settings fields use, for the one field they cannot render. */
const STYLE = {
  field: { display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 0', borderBottom: '0.5px solid var(--dsw-alias-border-l2)' },
  head: { display: 'flex', alignItems: 'center', gap: 8 },
  labelGroup: { display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 },
  label: { fontSize: 13, fontWeight: 500, lineHeight: 1.5, color: 'var(--dsw-alias-label-primary)' },
  badges: { display: 'inline-flex', alignItems: 'center', gap: 8 },
  reset: { border: 'none', background: 'none', padding: 0, font: 'inherit', fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer' },
  hint: { margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary)' },
  tag: { padding: '0 6px', border: '0.5px solid var(--dsw-alias-border-l2)', borderRadius: 'var(--dsw-radius-sm)', fontSize: 12, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' },
} as const;

/** Props the renderer binds for this page. */
export interface UpdaterSettingsProps extends UpdaterCardFace, PropsLocale<'settings.updater'> {
  /** Which surface the Plugins page asks for. */
  readonly view?: 'summary' | 'page';
  /** Bound page snapshot, supplied by the renderer from the injected hook. */
  readonly useUpdaterCard: <S>(select: (state: UpdaterCardState) => S) => S;
}

/**
 * Render the plugin language as a flat three-way switch.
 *
 * The shared value field renders a text input only, so this one field carries
 * its own frame. The frame copies the official field exactly: same gap, same
 * padding, and the same label, badge and hint typography, so the row reads as
 * part of the form rather than as a control bolted onto it. The bottom border
 * stands in for the border the next official field would otherwise draw above
 * itself, which a sibling without the module's own class cannot trigger.
 * @param props - the field copy, the selected language, and the write action.
 * @returns the labelled switch.
 */
function LanguageField(props: {
  readonly label: string;
  readonly hint: string;
  readonly value: Language;
  readonly overridden: boolean;
  readonly disabled: boolean;
  readonly options: readonly { readonly value: Language, readonly label: string }[];
  readonly overriddenLabel: string;
  readonly resetLabel: string;
  readonly onChange: (next: Language) => void;
  readonly onReset: () => void;
}) {
  return (
    <div style={STYLE.field}>
      <div style={STYLE.head}>
        <div style={STYLE.labelGroup}>
          <span style={STYLE.label} id="plugin-config-updater-language-label">{props.label}</span>
        </div>
        {props.overridden
          ? (
            <span style={STYLE.badges}>
              <span style={STYLE.tag}>{props.overriddenLabel}</span>
              <button type="button" style={STYLE.reset} disabled={props.disabled} onClick={props.onReset}>
                {props.resetLabel}
              </button>
            </span>
          )
          : null}
      </div>
      <SegmentedControl
        id="plugin-config-updater-language"
        label={props.label}
        value={props.value}
        options={props.options}
        disabled={props.disabled}
        onChange={props.onChange}
      />
      <p style={STYLE.hint}>{props.hint}</p>
    </div>
  );
}

/**
 * Render the updater's options as a staged form.
 *
 * Every field stages its draft locally and the form writes them together on
 * save, which is what the official settings pages do: leaving the page drops
 * unsaved edits, and a rejected write leaves the stored value untouched.
 * @param props - the bound snapshot, the page's copy, and the form actions.
 * @returns the form, or the one-line description while the summary is asked for.
 */
export function UpdaterSettingsPage(props: UpdaterSettingsProps) {
  const state = props.useUpdaterCard(snapshot => snapshot);
  const { t } = props;
  const disabled = !state.writable || state.saving;
  if (props.view === 'summary') return <>{t('summary')}</>;
  const field = (name: string, label: string, hint: string, value: typeof state.language) => (
    <SettingsValueField
      id={`plugin-config-updater-${name}`}
      label={label}
      hint={hint}
      overriddenLabel={t('overridden')}
      resetLabel={t('reset')}
      invalidLabel={t('invalid')}
      disabled={disabled}
      {...value}
      onEdit={text => { props.edit(name, text) }}
      onReset={() => { props.resetField(name) }}
    />
  );
  return (
    <SettingsForm labels={formLabels(t)} state={state} onSave={props.save} onDiscard={props.discard}>
      <LanguageField
        label={t('language')}
        hint={t('languageHint')}
        value={readLanguage(state.language.text)}
        overridden={state.language.overridden}
        disabled={disabled}
        options={LANGUAGES.map(choice => ({ value: choice.value, label: t(choice.key) }))}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        onChange={next => { props.edit('language', next) }}
        onReset={() => { props.resetField('language') }}
      />
      {field('requestTimeoutMs', t('requestTimeout'), t('requestTimeoutHint'), state.requestTimeoutMs)}
      {field('maxMetadataBytes', t('maxMetadata'), t('maxMetadataHint'), state.maxMetadataBytes)}
      {field('planTtlMs', t('planLifetime'), t('planLifetimeHint'), state.planTtlMs)}
      {field('githubTokenEnv', t('tokenVariable'), t('tokenVariableHint'), state.githubTokenEnv)}
    </SettingsForm>
  );
}

/**
 * Read a draft as one of the accepted languages.
 *
 * A draft the schema would reject still has to render, so anything outside the
 * vocabulary falls back to the default instead of leaving the switch with no
 * selected segment.
 * @param text - the staged draft.
 * @returns the draft when it is a known language, otherwise auto.
 */
function readLanguage(text: string): Language {
  const known = LANGUAGES.some(choice => choice.value === text);
  return known ? text as Language : 'auto';
}
