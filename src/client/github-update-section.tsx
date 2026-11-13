/** A self-contained GitHub update section for a bundle detail page. */
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Button, IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconCloseOutlineRegular, IconDownloadOutlineRegular, IconRefreshOutlineRegular, IconWarningOutlineRegular, Modal, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

/** A GitHub source and its currently installed revision. */
export type GitHubUpdateSource =
  | { readonly kind: 'npm' }
  | { readonly kind: 'github'; readonly id: string; readonly repository: string; readonly mode: 'commit' | 'release'; readonly installed: string; readonly fixedPin: boolean };

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
  readonly steps?: readonly { readonly label: string; readonly state: 'done' | 'failed' | 'unknown' }[];
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
  readonly onCheck: (source: Extract<GitHubUpdateSource, { kind: 'github' }>) => Promise<GitHubUpdateCheck>;
  readonly onUpdate: (source: Extract<GitHubUpdateSource, { kind: 'github' }>, candidate: GitHubUpdateCandidate) => Promise<GitHubUpdateResult>;
  readonly onDialogChange?: (open: boolean) => void;
  readonly dialog?: GitHubDialogStore;
}

const styles = {
  section: { display: 'flex', flexDirection: 'column', gap: 12 },
  head: { display: 'flex', alignItems: 'baseline', gap: 10 },
  title: { margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 500, flex: 1 },
  panel: { overflow: 'hidden', border: '0.5px solid var(--dsw-alias-settings-card-stroke)', borderRadius: 'var(--dsw-radius-xl)', background: 'var(--dsw-alias-settings-card-fill)' },
  summary: { display: 'flex', alignItems: 'center', gap: 12, boxSizing: 'border-box', width: '100%', minHeight: 64, padding: '12px 16px', border: 0, background: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left' },
  glyph: { display: 'inline-flex', flex: 'none', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-secondary)' },
  summaryText: { display: 'flex', flex: 1, flexDirection: 'column', gap: 2, minWidth: 0 },
  summaryTitle: { fontSize: 14, lineHeight: '20px', fontWeight: 500 },
  sub: { fontSize: 12.5, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)', overflowWrap: 'anywhere' },
  body: { padding: '0 16px', borderTop: '0.5px solid var(--dsw-alias-border-l2)' },
  row: { display: 'flex', alignItems: 'center', gap: 16, minHeight: 28, padding: '12px 0', borderBottom: '0.5px solid var(--dsw-alias-border-l2)' },
  version: { fontFamily: 'var(--ds-font-family-code)', fontSize: 13, lineHeight: '20px', fontWeight: 500, overflowWrap: 'anywhere' },
  dialog: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 },
  versions: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '20px 16px', borderRadius: 'var(--dsw-radius-md)', background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-tertiary)' },
  fact: { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: 8, margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)' },
  text: { margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)', overflowWrap: 'anywhere' },
  outcome: { display: 'flex', alignItems: 'flex-start', gap: 12 },
  steps: { display: 'flex', flexDirection: 'column', gap: 12, margin: 0, padding: '12px 16px', borderRadius: 'var(--dsw-radius-md)', background: 'var(--dsw-alias-bg-module-platform)', listStyle: 'none', fontSize: 13 },
} satisfies Record<string, CSSProperties>;

type GitHubSource = Extract<GitHubUpdateSource, { kind: 'github' }>;
type CheckState = { phase: 'idle' | 'checking' } | { phase: 'done'; result: GitHubUpdateCheck } | { phase: 'error'; error: string };
type UpdateState = { phase: 'confirm' } | { phase: 'running' } | { phase: 'done'; result: GitHubUpdateResult };
type DialogSnapshot = { readonly source: GitHubSource; readonly selected: GitHubUpdateCandidate; readonly installed: string; readonly pinned: boolean; readonly labels: GitHubUpdateLabels; readonly onUpdate: GitHubUpdateSectionProps['onUpdate']; readonly onDialogChange?: (open: boolean) => void; readonly update: UpdateState; readonly acknowledged: boolean };

/** Own one update dialog independently of the transient detail page. */
export class GitHubDialogStore {
  private snapshot: DialogSnapshot | null = null;
  private listeners = new Set<() => void>();
  readonly getSnapshot = (): DialogSnapshot | null => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(snapshot: DialogSnapshot | null): void { this.snapshot = snapshot; for (const listener of this.listeners) listener(); }
  /** Open a confirmation only if another dialog does not already own the overlay. */
  open(data: Omit<DialogSnapshot, 'update' | 'acknowledged'>): void {
    if (this.snapshot) return;
    this.set({ ...data, update: { phase: 'confirm' }, acknowledged: false });
    data.onDialogChange?.(true);
  }
  /** Close a confirmation or result, never an update in progress. */
  close = (): void => {
    const current = this.snapshot;
    if (!current || current.update.phase === 'running') return;
    this.set(null);
    current.onDialogChange?.(false);
  };
  /** Change the explicit risk acknowledgement while confirming. */
  acknowledge(value: boolean): void {
    const current = this.snapshot;
    if (current?.update.phase === 'confirm') this.set({ ...current, acknowledged: value });
  }
  /** Start at most one authorized update and retain its result. */
  async run(): Promise<void> {
    const current = this.snapshot;
    if (!current || current.update.phase !== 'confirm' || !current.acknowledged) return;
    this.set({ ...current, update: { phase: 'running' } });
    let result: GitHubUpdateResult;
    try { result = await current.onUpdate(current.source, current.selected); }
    catch (error) { result = { status: 'unknown', detail: errorText(error), risk: current.labels.nonAtomicRisk }; }
    const running = this.snapshot;
    if (running?.update.phase === 'running') this.set({ ...running, update: { phase: 'done', result } });
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Class the injected rule targets; the shared modal card fixes its own width. */
export const DIALOG_CLASS = 'dsh-updater-github-dialog';

/**
 * Widen this dialog only. The shared modal card owns a fixed 380px width and exposes no width prop,
 * while the release URLs and commit hashes shown here need more room to stay readable.
 * @returns a disposer that removes the injected rule, or a no-op outside a browser.
 */
export function installDialogStyles(): () => void {
  if (typeof document === 'undefined') return () => {};
  const existing = document.getElementById(`${DIALOG_CLASS}-styles`);
  if (existing) return () => {};
  const style = document.createElement('style');
  style.id = `${DIALOG_CLASS}-styles`;
  style.textContent = `.${DIALOG_CLASS}{width:min(560px,100%)}.${DIALOG_CLASS}.running > div:first-child > div:first-child > button{visibility:hidden}`;
  document.head.appendChild(style);
  return () => { style.remove(); };
}

function GitHubSection({ source, labels: t, onCheck, onUpdate, onDialogChange, dialog }: Omit<GitHubUpdateSectionProps, 'source'> & { readonly source: GitHubSource; readonly dialog: GitHubDialogStore }): ReactNode {
  const [check, setCheck] = useState<CheckState>({ phase: 'idle' });
  const [expanded, setExpanded] = useState(false);
  const dialogSnapshot = useSyncExternalStore(dialog.subscribe, dialog.getSnapshot, dialog.getSnapshot);
  const operation = useRef(false);
  const candidate = check.phase === 'done' ? check.result.candidate : null;
  const busy = check.phase === 'checking' || dialogSnapshot !== null;
  const summary = check.phase === 'idle' ? t.unchecked : check.phase === 'checking' ? t.checking : check.phase === 'error' || (check.phase === 'done' && check.result.status === 'error') ? t.failed : candidate ? `${t.available} ${candidate.target}` : check.phase === 'done' && check.result.status === 'current' ? t.latest : t.unknown;
  const installed = check.phase === 'done' ? check.result.installed ?? source.installed : source.installed;
  const pinned = source.fixedPin || (check.phase === 'done' && check.result.pinned === true);
  const detail = check.phase === 'error' ? check.error : check.phase === 'done' ? check.result.detail : undefined;
  const glyph = check.phase === 'checking' ? <StateDot state="ongoing" size={14} /> : check.phase === 'error' || (check.phase === 'done' && check.result.status === 'error') ? <IconCloseOutlineRegular size={14} /> : candidate ? <IconDownloadOutlineRegular size={14} /> : check.phase === 'done' && check.result.status === 'current' ? <IconCheckOutlineRegular size={14} /> : check.phase === 'done' ? <IconWarningOutlineRegular size={14} /> : <IconRefreshOutlineRegular size={14} />;
  const tone = candidate ? 'business' : check.phase === 'done' && check.result.status === 'current' ? 'success' : check.phase === 'error' || (check.phase === 'done' && check.result.status === 'error') ? 'error' : check.phase === 'done' ? 'warn' : undefined;
  const toneColor = tone ? `var(--dsw-alias-state-${tone}-primary)` : undefined;
  const summaryBody = <><span style={{ ...styles.glyph, ...(toneColor ? { background: `color-mix(in srgb, ${toneColor} 10%, transparent)`, color: toneColor } : {}) }} aria-hidden="true">{glyph}</span><span style={styles.summaryText}><span style={styles.summaryTitle}>{summary}</span>{detail ? <span style={styles.sub}>{detail}</span> : null}</span>{candidate ? <span style={styles.sub}>{t.availableTarget} <span style={{ display: 'inline-flex', transform: expanded ? 'rotate(180deg)' : undefined }}><IconChevronDownOutlineRegular size={14} /></span></span> : null}</>;
  const checkNow = async () => {
    if (operation.current) return;
    operation.current = true;
    setCheck({ phase: 'checking' });
    setExpanded(false);
    try { setCheck({ phase: 'done', result: await onCheck(source) }); }
    catch (error) { setCheck({ phase: 'error', error: errorText(error) }); }
    finally { operation.current = false; }
  };
  useEffect(() => { void checkNow(); }, []);
  return (
    <section style={styles.section} data-github-update-section>
      <div style={styles.head}>
        <h4 style={styles.title}>{t.title}</h4>
        <Button variant="ghost" size="sm" icon={<IconRefreshOutlineRegular size={13} />} disabled={busy} onClick={() => { void checkNow(); }}>{check.phase === 'error' ? t.retry : t.check}</Button>
      </div>
      <div style={styles.panel}>
        {candidate
          ? <button type="button" style={{ ...styles.summary, cursor: 'pointer', ...(expanded ? { background: 'var(--dsw-alias-bg-module-platform)' } : {}) }} aria-expanded={expanded} onClick={() => { setExpanded(!expanded); }}>{summaryBody}</button>
          : <div style={styles.summary} role="status">{summaryBody}</div>}
        {expanded && candidate ? <div style={styles.body}>
          <div style={styles.row}><span style={{ ...styles.summaryText, ...styles.version }}>{candidate.target}{candidate.detail ? <span style={styles.sub}>{candidate.detail}</span> : null}</span><Button variant="outline" size="sm" disabled={busy} onClick={() => { dialog.open({ source, selected: candidate, installed, pinned, labels: t, onUpdate: async (selectedSource, selectedCandidate) => { setCheck({ phase: 'idle' }); setExpanded(false); return onUpdate(selectedSource, selectedCandidate); }, ...(onDialogChange ? { onDialogChange } : {}) }); }}>{t.update}</Button></div>
          <div style={{ ...styles.row, borderBottom: 0 }}><span style={styles.version}>{installed}</span><Tag tone="neutral">{t.installed}</Tag>{pinned ? <Tag tone="warning">{t.fixedPin}</Tag> : null}</div>
        </div> : pinned ? <div style={{ ...styles.body, padding: '12px 16px' }}><Tag tone="warning">{t.fixedPin}</Tag></div> : null}
      </div>

    </section>
  );
}

/** Render the overlay from the stable shell slot. */
export function GitHubUpdateDialog({ dialog }: { readonly dialog: GitHubDialogStore }): ReactNode {
  const snapshot = useSyncExternalStore(dialog.subscribe, dialog.getSnapshot, dialog.getSnapshot);
  if (!snapshot) return null;
  const { source, selected, installed, pinned, labels: t, update, acknowledged } = snapshot;
  const result = update.phase === 'done' ? update.result : null;
  return (
    <Modal open className={`${DIALOG_CLASS}${update.phase === 'running' ? ' running' : ''}`} onClose={dialog.close} title={t.confirmTitle} closeLabel={t.close} footer={update.phase === 'confirm' ? <><Button variant="outline" onClick={dialog.close}>{t.cancel}</Button><Button variant="primary" disabled={!acknowledged} onClick={() => { void dialog.run(); }}>{t.update}</Button></> : update.phase === 'running' ? <Button variant="outline" disabled>{t.running}</Button> : <Button variant="primary" onClick={dialog.close}>{t.finish}</Button>}>
        <div style={styles.dialog} data-github-update={update.phase}>
          {update.phase === 'confirm' ? <>
            <div style={styles.versions}><span style={styles.version}>{installed}</span><IconChevronRightOutlineRegular size={14} aria-hidden="true" /><span style={{ ...styles.version, color: 'var(--dsw-alias-label-primary)' }}>{selected.target}</span></div>
            <dl style={styles.fact}><dt style={{ whiteSpace: 'nowrap' }}>{t.source}</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{source.repository} · {source.mode === 'commit' ? t.commit : t.release}</dd></dl>
            {selected.detail ? <p style={styles.text}>{selected.detail}</p> : null}
            {pinned ? <p style={styles.text}>{t.pinnedNotice}</p> : null}
            <p style={styles.text}><IconWarningOutlineRegular size={14} aria-hidden="true" /> {t.nonAtomicRisk}</p>
            {selected.warnings.map(warning => <p key={warning} style={styles.text}>{warning}</p>)}
            <label style={styles.text}><input type="checkbox" checked={acknowledged} onChange={event => { dialog.acknowledge(event.currentTarget.checked); }} /> {t.acknowledgeRisk}</label>
          </> : <>
            {result ? <div style={styles.outcome} role="status"><span style={styles.glyph} aria-hidden="true">{result.status === 'success' ? <IconCheckOutlineRegular size={14} /> : <IconWarningOutlineRegular size={14} />}</span><span style={styles.summaryText}><span style={styles.summaryTitle}>{result.status === 'success' ? t.success : result.status === 'failed' ? t.updateFailed : t.unknown}</span><span style={{ ...styles.sub, whiteSpace: 'pre-wrap' }}>{result.detail}</span>{result.risk ? <span style={styles.sub}>{result.risk}</span> : null}</span></div> : <div role="status" style={styles.text}><StateDot state="ongoing" size={14} /> {t.running}</div>}
            {result?.steps?.length ? <ol style={styles.steps}>{result.steps.map((step, index) => <li key={index} data-state={step.state}>{step.state === 'done' ? '✓' : step.state === 'failed' ? '×' : '?'} {step.label}</li>)}</ol> : null}
          </>}
        </div>
      </Modal>
  );
}

/** Render only GitHub sources and reset local state whenever their identity or installed pin changes. */
export function GitHubUpdateSection(props: GitHubUpdateSectionProps): ReactNode {
  const [localDialog] = useState(() => new GitHubDialogStore());
  if (props.source.kind !== 'github') return null;
  const source = props.source;
  const dialog = props.dialog ?? localDialog;
  return <><GitHubSection key={JSON.stringify([source.id, source.repository, source.mode, source.installed, source.fixedPin])} {...props} source={source} dialog={dialog} />{props.dialog ? null : <GitHubUpdateDialog dialog={dialog} />}</>;
}
