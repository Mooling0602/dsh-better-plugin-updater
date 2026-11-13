/** Connect a GitHub detail contribution to its owner-only Host facade. */
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { PluginDetailProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol';
import type { GitHubDetail, GitHubDetailCheck } from '../github-ui.js';
import { translate } from '../i18n.js';
import { normalizeLanguage } from '../language.js';
import { en, zh } from './github-locales.js';
import { GitHubUpdateSection } from './github-update-section.js';
import type { GitHubDialogStore, GitHubUpdateCandidate, GitHubUpdateCheck, GitHubUpdateResult } from './github-update-section.js';

/** Client-side Remote methods provided by the mounted contribution. */
export interface GitHubRemoteClient {
  describe(name: string): Promise<RemoteResult<string>>;
  check(name: string): Promise<RemoteResult<string>>;
  apply(id: string, acceptRemovalRisk: boolean, language: string): Promise<RemoteResult<string>>;
}

/** The observable interface-language source needed by the detail contribution. */
export interface GitHubViewLocale {
  getSnapshot(): { readonly active: unknown };
  subscribe(listener: () => void): () => void;
}

/** Host inventory change notifications used to refresh an open detail page. */
export interface GitHubViewEvents {
  subscribe(listener: () => void): () => void;
}

/** Slot owner props and the services injected by its registration. */
export interface GitHubUpdateViewProps extends PluginDetailProps {
  readonly remote: GitHubRemoteClient;
  readonly locale: GitHubViewLocale;
  readonly events: GitHubViewEvents;
  readonly dialog: GitHubDialogStore;
}

async function decode<T>(operation: Promise<RemoteResult<string>>): Promise<T> {
  const result = await operation;
  if (!result.ok) throw new Error(result.error.message);
  return JSON.parse(result.value) as T;
}

function BundleView({ name, remote, locale, events, dialog }: { readonly name: string; readonly remote: GitHubRemoteClient; readonly locale: GitHubViewLocale; readonly events: GitHubViewEvents; readonly dialog: GitHubDialogStore }): ReactNode {
  const [detail, setDetail] = useState<GitHubDetail | null>(null);
  const [revision, setRevision] = useState(0);
  const [loadedRevision, setLoadedRevision] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const language = normalizeLanguage(useSyncExternalStore(listener => locale.subscribe(listener), () => locale.getSnapshot().active)) ?? 'en';
  useEffect(() => events.subscribe(() => { setRevision(value => value + 1); }), [events]);
  useEffect(() => {
    if (dialogOpen) return;
    let active = true;
    void decode<GitHubDetail | null>(remote.describe(name)).then(value => {
      if (active) { setDetail(value); setLoadedRevision(revision); }
    }, () => { if (active) setDetail(null); });
    return () => { active = false; };
  }, [name, remote, revision, dialogOpen]);
  if (!detail || (!dialogOpen && revision !== loadedRevision)) return null;
  const labels = language === 'zh' ? zh : en;
  const source = { kind: 'github' as const, id: detail.name, repository: detail.repository,
    mode: detail.kind === 'github-source' ? 'commit' as const : 'release' as const,
    installed: detail.installed ?? labels.unknown, fixedPin: detail.fixedPin };
  const check = async (): Promise<GitHubUpdateCheck> => {
    const checked = await decode<GitHubDetailCheck | null>(remote.check(name));
    if (!checked) throw new Error(labels.sourceChanged);
    const { result, confirmation } = checked;
    const installed = result.source.kind === 'github-source' ? result.source.currentRevision : result.bundle.version;
    const candidate: GitHubUpdateCandidate | null = confirmation ? {
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
  const update = async (_source: typeof source, candidate: GitHubUpdateCandidate): Promise<GitHubUpdateResult> => {
    const result = await decode<{ status: 'updated' | 'restart-required' | 'failed'; text: string }>(remote.apply(candidate.confirmationId, true, language));
    return { status: result.status === 'failed' ? 'failed' : 'success', detail: result.text };
  };
  return <GitHubUpdateSection key={loadedRevision} source={source} labels={labels} onCheck={check} onUpdate={update} onDialogChange={setDialogOpen} dialog={dialog} />;
}

/** Contribute only to package detail pages and reset state when their subject changes. */
export function GitHubUpdateView({ subject, remote, locale, events, dialog }: GitHubUpdateViewProps): ReactNode {
  if (subject.kind !== 'bundle') return null;
  return <BundleView key={subject.pkg.name} name={subject.pkg.name} remote={remote} locale={locale} events={events} dialog={dialog} />;
}
