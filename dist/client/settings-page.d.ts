/**
 * The updater's settings page: the scalar options this bundle's Host entry
 * reads, staged through the shared settings form so a save is the only write.
 */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { UpdaterCardFace, UpdaterCardState } from './settings-controller.js';
/** Props the renderer binds for this page. */
export interface UpdaterSettingsProps extends UpdaterCardFace, PropsLocale<'settings.updater'> {
    /** Which surface the Plugins page asks for. */
    readonly view?: 'summary' | 'page';
    /** Bound page snapshot, supplied by the renderer from the injected hook. */
    readonly useUpdaterCard: <S>(select: (state: UpdaterCardState) => S) => S;
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
export declare function UpdaterSettingsPage(props: UpdaterSettingsProps): import("react").JSX.Element;
