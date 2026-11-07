import { jsx as _jsx } from "react/jsx-runtime";
/** Connect a GitHub detail contribution to its owner-only Host facade. */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { translate } from '../i18n.js';
import { normalizeLanguage } from '../language.js';
import { en, zh } from './github-locales.js';
import { GitHubUpdateSection } from './github-update-section.js';
async function decode(operation) {
    const result = await operation;
    if (!result.ok)
        throw new Error(result.error.message);
    return JSON.parse(result.value);
}
function BundleView({ name, remote, locale, events }) {
    const [detail, setDetail] = useState(null);
    const [revision, setRevision] = useState(0);
    const [loadedRevision, setLoadedRevision] = useState(0);
    const [dialogOpen, setDialogOpen] = useState(false);
    const language = normalizeLanguage(useSyncExternalStore(listener => locale.subscribe(listener), () => locale.getSnapshot().active)) ?? 'en';
    useEffect(() => events.subscribe(() => { setRevision(value => value + 1); }), [events]);
    useEffect(() => {
        if (dialogOpen)
            return;
        let active = true;
        void decode(remote.describe(name)).then(value => {
            if (active) {
                setDetail(value);
                setLoadedRevision(revision);
            }
        }, () => { if (active)
            setDetail(null); });
        return () => { active = false; };
    }, [name, remote, revision, dialogOpen]);
    if (!detail || (!dialogOpen && revision !== loadedRevision))
        return null;
    const labels = language === 'zh' ? zh : en;
    const source = { kind: 'github', id: detail.name, repository: detail.repository,
        mode: detail.kind === 'github-source' ? 'commit' : 'release',
        installed: detail.installed ?? labels.unknown, fixedPin: detail.fixedPin };
    const check = async () => {
        const checked = await decode(remote.check(name));
        if (!checked)
            throw new Error(labels.sourceChanged);
        const { result, confirmation } = checked;
        const installed = result.source.kind === 'github-source' ? result.source.currentRevision : result.bundle.version;
        const candidate = confirmation ? {
            target: confirmation.plan.candidate.revision ?? confirmation.plan.candidate.version ?? confirmation.plan.candidate.spec,
            detail: confirmation.plan.candidate.spec,
            confirmationId: confirmation.id,
            warnings: (confirmation.plan.warningDetails ?? [])
                .filter(item => item.key !== 'warning.nonAtomic' && item.key !== 'warning.recovery')
                .map(item => translate(item, '', language)),
        } : null;
        return { status: result.status, candidate, ...(installed === undefined ? {} : { installed }),
            pinned: result.source.kind !== 'unsupported' && result.source.pinned, detail: translate(result.detail, result.message, language) };
    };
    const update = async (_source, candidate) => {
        const result = await decode(remote.apply(candidate.confirmationId, true, language));
        return { status: result.status === 'failed' ? 'failed' : 'success', detail: result.text };
    };
    return _jsx(GitHubUpdateSection, { source: source, labels: labels, onCheck: check, onUpdate: update, onDialogChange: setDialogOpen }, loadedRevision);
}
/** Contribute only to package detail pages and reset state when their subject changes. */
export function GitHubUpdateView({ subject, remote, locale, events }) {
    if (subject.kind !== 'bundle')
        return null;
    return _jsx(BundleView, { name: subject.pkg.name, remote: remote, locale: locale, events: events }, subject.pkg.name);
}
//# sourceMappingURL=github-update-view.js.map