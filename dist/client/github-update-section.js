import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** A self-contained GitHub update section for a bundle detail page. */
import { useEffect, useRef, useState } from 'react';
import { Button, IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, IconCloseOutlineRegular, IconDownloadOutlineRegular, IconRefreshOutlineRegular, IconWarningOutlineRegular, Modal, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
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
};
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Class the injected rule targets; the shared modal card fixes its own width. */
export const DIALOG_CLASS = 'dsh-updater-github-dialog';
/**
 * Widen this dialog only. The shared modal card owns a fixed 380px width and exposes no width prop,
 * while the release URLs and commit hashes shown here need more room to stay readable.
 * @returns a disposer that removes the injected rule, or a no-op outside a browser.
 */
export function installDialogStyles() {
    if (typeof document === 'undefined')
        return () => { };
    const existing = document.getElementById(`${DIALOG_CLASS}-styles`);
    if (existing)
        return () => { };
    const style = document.createElement('style');
    style.id = `${DIALOG_CLASS}-styles`;
    style.textContent = `.${DIALOG_CLASS}{width:min(560px,100%)}`;
    document.head.appendChild(style);
    return () => { style.remove(); };
}
function GitHubSection({ source, labels: t, onCheck, onUpdate, onDialogChange }) {
    const [check, setCheck] = useState({ phase: 'idle' });
    const [expanded, setExpanded] = useState(false);
    const [selected, setSelected] = useState(null);
    const [update, setUpdate] = useState({ phase: 'confirm' });
    const [acknowledged, setAcknowledged] = useState(false);
    const operation = useRef(false);
    const candidate = check.phase === 'done' ? check.result.candidate : null;
    const busy = check.phase === 'checking' || update.phase === 'running';
    const summary = check.phase === 'idle' ? t.unchecked : check.phase === 'checking' ? t.checking : check.phase === 'error' || (check.phase === 'done' && check.result.status === 'error') ? t.failed : candidate ? `${t.available} ${candidate.target}` : check.phase === 'done' && check.result.status === 'current' ? t.latest : t.unknown;
    const installed = check.phase === 'done' ? check.result.installed ?? source.installed : source.installed;
    const pinned = source.fixedPin || (check.phase === 'done' && check.result.pinned === true);
    const detail = check.phase === 'error' ? check.error : check.phase === 'done' ? check.result.detail : undefined;
    const glyph = check.phase === 'checking' ? _jsx(StateDot, { state: "ongoing", size: 14 }) : check.phase === 'error' || (check.phase === 'done' && check.result.status === 'error') ? _jsx(IconCloseOutlineRegular, { size: 14 }) : candidate ? _jsx(IconDownloadOutlineRegular, { size: 14 }) : check.phase === 'done' && check.result.status === 'current' ? _jsx(IconCheckOutlineRegular, { size: 14 }) : check.phase === 'done' ? _jsx(IconWarningOutlineRegular, { size: 14 }) : _jsx(IconRefreshOutlineRegular, { size: 14 });
    const tone = candidate ? 'business' : check.phase === 'done' && check.result.status === 'current' ? 'success' : check.phase === 'error' || (check.phase === 'done' && check.result.status === 'error') ? 'error' : check.phase === 'done' ? 'warn' : undefined;
    const toneColor = tone ? `var(--dsw-alias-state-${tone}-primary)` : undefined;
    const summaryBody = _jsxs(_Fragment, { children: [_jsx("span", { style: { ...styles.glyph, ...(toneColor ? { background: `color-mix(in srgb, ${toneColor} 10%, transparent)`, color: toneColor } : {}) }, "aria-hidden": "true", children: glyph }), _jsxs("span", { style: styles.summaryText, children: [_jsx("span", { style: styles.summaryTitle, children: summary }), detail ? _jsx("span", { style: styles.sub, children: detail }) : null] }), candidate ? _jsxs("span", { style: styles.sub, children: [t.availableTarget, " ", _jsx("span", { style: { display: 'inline-flex', transform: expanded ? 'rotate(180deg)' : undefined }, children: _jsx(IconChevronDownOutlineRegular, { size: 14 }) })] }) : null] });
    const close = () => { if (update.phase !== 'running') {
        setSelected(null);
        setUpdate({ phase: 'confirm' });
        setAcknowledged(false);
        onDialogChange?.(false);
    } };
    const checkNow = async () => {
        if (operation.current)
            return;
        operation.current = true;
        setCheck({ phase: 'checking' });
        setExpanded(false);
        try {
            setCheck({ phase: 'done', result: await onCheck(source) });
        }
        catch (error) {
            setCheck({ phase: 'error', error: errorText(error) });
        }
        finally {
            operation.current = false;
        }
    };
    useEffect(() => { void checkNow(); }, []);
    const run = async () => {
        if (!selected || !acknowledged || update.phase !== 'confirm' || operation.current)
            return;
        operation.current = true;
        setCheck({ phase: 'idle' });
        setExpanded(false);
        setUpdate({ phase: 'running' });
        try {
            setUpdate({ phase: 'done', result: await onUpdate(source, selected) });
        }
        catch (error) {
            setUpdate({ phase: 'done', result: { status: 'unknown', detail: errorText(error), risk: t.nonAtomicRisk } });
        }
        finally {
            operation.current = false;
        }
    };
    const result = update.phase === 'done' ? update.result : null;
    return (_jsxs("section", { style: styles.section, "data-github-update-section": true, children: [_jsxs("div", { style: styles.head, children: [_jsx("h4", { style: styles.title, children: t.title }), _jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(IconRefreshOutlineRegular, { size: 13 }), disabled: busy || selected !== null, onClick: () => { void checkNow(); }, children: check.phase === 'error' ? t.retry : t.check })] }), _jsxs("div", { style: styles.panel, children: [candidate
                        ? _jsx("button", { type: "button", style: { ...styles.summary, cursor: 'pointer', ...(expanded ? { background: 'var(--dsw-alias-bg-module-platform)' } : {}) }, "aria-expanded": expanded, onClick: () => { setExpanded(!expanded); }, children: summaryBody })
                        : _jsx("div", { style: styles.summary, role: "status", children: summaryBody }), expanded && candidate ? _jsxs("div", { style: styles.body, children: [_jsxs("div", { style: styles.row, children: [_jsxs("span", { style: { ...styles.summaryText, ...styles.version }, children: [candidate.target, candidate.detail ? _jsx("span", { style: styles.sub, children: candidate.detail }) : null] }), _jsx(Button, { variant: "outline", size: "sm", disabled: busy, onClick: () => { setUpdate({ phase: 'confirm' }); setAcknowledged(false); setSelected(candidate); onDialogChange?.(true); }, children: t.update })] }), _jsxs("div", { style: { ...styles.row, borderBottom: 0 }, children: [_jsx("span", { style: styles.version, children: installed }), _jsx(Tag, { tone: "neutral", children: t.installed }), pinned ? _jsx(Tag, { tone: "warning", children: t.fixedPin }) : null] })] }) : pinned ? _jsx("div", { style: { ...styles.body, padding: '12px 16px' }, children: _jsx(Tag, { tone: "warning", children: t.fixedPin }) }) : null] }), selected ? _jsx(Modal, { open: true, className: DIALOG_CLASS, onClose: close, title: t.confirmTitle, closeLabel: t.close, footer: update.phase === 'confirm' ? _jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: close, children: t.cancel }), _jsx(Button, { variant: "primary", disabled: !acknowledged, onClick: () => { void run(); }, children: t.update })] }) : update.phase === 'running' ? _jsx(Button, { variant: "outline", disabled: true, children: t.running }) : _jsx(Button, { variant: "primary", onClick: close, children: t.finish }), children: _jsx("div", { style: styles.dialog, "data-github-update": update.phase, children: update.phase === 'confirm' ? _jsxs(_Fragment, { children: [_jsxs("div", { style: styles.versions, children: [_jsx("span", { style: styles.version, children: installed }), _jsx(IconChevronRightOutlineRegular, { size: 14, "aria-hidden": "true" }), _jsx("span", { style: { ...styles.version, color: 'var(--dsw-alias-label-primary)' }, children: selected.target })] }), _jsxs("dl", { style: styles.fact, children: [_jsx("dt", { style: { whiteSpace: 'nowrap' }, children: t.source }), _jsxs("dd", { style: { margin: 0, overflowWrap: 'anywhere' }, children: [source.repository, " \u00B7 ", source.mode === 'commit' ? t.commit : t.release] })] }), selected.detail ? _jsx("p", { style: styles.text, children: selected.detail }) : null, pinned ? _jsx("p", { style: styles.text, children: t.pinnedNotice }) : null, _jsxs("p", { style: styles.text, children: [_jsx(IconWarningOutlineRegular, { size: 14, "aria-hidden": "true" }), " ", t.nonAtomicRisk] }), selected.warnings.map(warning => _jsx("p", { style: styles.text, children: warning }, warning)), _jsxs("label", { style: styles.text, children: [_jsx("input", { type: "checkbox", checked: acknowledged, onChange: event => { setAcknowledged(event.currentTarget.checked); } }), " ", t.acknowledgeRisk] })] }) : _jsxs(_Fragment, { children: [result ? _jsxs("div", { style: styles.outcome, role: "status", children: [_jsx("span", { style: styles.glyph, "aria-hidden": "true", children: result.status === 'success' ? _jsx(IconCheckOutlineRegular, { size: 14 }) : _jsx(IconWarningOutlineRegular, { size: 14 }) }), _jsxs("span", { style: styles.summaryText, children: [_jsx("span", { style: styles.summaryTitle, children: result.status === 'success' ? t.success : result.status === 'failed' ? t.updateFailed : t.unknown }), _jsx("span", { style: { ...styles.sub, whiteSpace: 'pre-wrap' }, children: result.detail }), result.risk ? _jsx("span", { style: styles.sub, children: result.risk }) : null] })] }) : _jsxs("div", { role: "status", style: styles.text, children: [_jsx(StateDot, { state: "ongoing", size: 14 }), " ", t.running] }), result?.steps?.length ? _jsx("ol", { style: styles.steps, children: result.steps.map((step, index) => _jsxs("li", { "data-state": step.state, children: [step.state === 'done' ? '✓' : step.state === 'failed' ? '×' : '?', " ", step.label] }, index)) }) : null] }) }) }) : null] }));
}
/** Render only GitHub sources and reset local state whenever their identity or installed pin changes. */
export function GitHubUpdateSection(props) {
    if (props.source.kind !== 'github')
        return null;
    const source = props.source;
    return _jsx(GitHubSection, { ...props, source: source }, JSON.stringify([source.id, source.repository, source.mode, source.installed, source.fixedPin]));
}
//# sourceMappingURL=github-update-section.js.map