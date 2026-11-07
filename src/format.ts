/** Human-readable, localized command presentation. Model tools retain their English JSON fields. */
import { errorDetail } from './errors.js';
import { t, translate } from './i18n.js';
import type { Language, MessageKey } from './i18n.js';
import { githubRepository, releaseAttachment } from './sources.js';
import { isActionable } from './updater.js';
import type { ApplyResult, CheckResult, InstalledBundle, ManagementResult, UpdateCandidate, UpdateSource } from './types.js';

const STATUS: Record<CheckResult['status'], MessageKey> = {
  'update-available': 'ui.status.update', current: 'ui.status.current', pinned: 'ui.status.pinned',
  unknown: 'ui.status.unknown', unsupported: 'ui.status.unsupported', skipped: 'ui.status.skipped', error: 'ui.status.error',
};
const ORDER: readonly CheckResult['status'][] = ['update-available', 'error', 'unknown', 'pinned', 'current', 'unsupported', 'skipped'];
function inline(value: string): string { return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim(); }
function shortRevision(value: string): string { return inline(value).slice(0, 12); }
function sourceLabel(source: string | undefined, language: Language): string {
  const key = !source ? 'ui.source.unknown' : releaseAttachment(source) ? 'ui.source.release'
    : githubRepository(source) ? 'ui.source.git' : /^(?:link:|file:|\/)/.test(source) ? 'ui.source.local'
      : source.includes('@') && !source.includes(':') ? 'ui.source.npm' : 'ui.source.other';
  return t(language, key);
}
function providerLabel(source: UpdateSource, language: Language): string {
  return t(language, source.kind === 'npm' ? 'ui.source.npm' : source.kind === 'github-source' ? 'ui.source.git'
    : source.kind === 'github-release' ? 'ui.source.release' : 'ui.source.unsupported');
}
function bundleLine(bundle: InstalledBundle, language: Language): string {
  return `- ${inline(bundle.name)}${bundle.version ? ` v${inline(bundle.version)}` : ''}`
    + ` (${t(language, bundle.enabled ? 'ui.enabled' : 'ui.disabled')}, ${sourceLabel(bundle.source, language)})`;
}
function targetLines(candidate: UpdateCandidate, language: Language): string[] {
  return [t(language, 'ui.installTarget', { spec: inline(candidate.spec) }),
    ...(candidate.registry ? [t(language, 'ui.registry', { registry: inline(candidate.registry) })] : [])];
}

/** Render installed packages separately from DSH-owned bundles and absent catalog offers. */
export function formatInventory(bundles: readonly InstalledBundle[], language: Language = 'en'): string {
  if (bundles.length === 0) return t(language, 'ui.inventory.empty');
  const profile = bundles.filter(bundle => bundle.installed && bundle.availability === 'profile');
  const provided = bundles.filter(bundle => bundle.availability === 'installation');
  const other = bundles.filter(bundle => bundle.availability !== 'installation' && !(bundle.installed && bundle.availability === 'profile'));
  const lines = [t(language, 'ui.inventory.summary', { profile: profile.length, provided: provided.length, other: other.length })];
  const group = (key: MessageKey, entries: readonly InstalledBundle[]) => {
    if (entries.length === 0) return;
    lines.push('', t(language, 'ui.group', { title: t(language, key), count: entries.length }));
    for (const bundle of entries) {
      lines.push(bundleLine(bundle, language));
      if (bundle.error) lines.push(`  ${t(language, 'ui.problem', { code: inline(bundle.error.code) })}`);
    }
  };
  group('ui.inventory.profile', profile);
  group('ui.inventory.provided', provided);
  group('ui.inventory.other', other);
  lines.push('', t(language, 'ui.checkHint'));
  return lines.join('\n');
}

function checkLines(result: CheckResult, language: Language): string[] {
  const { bundle, source, candidate } = result;
  let version = bundle.version ? `v${inline(bundle.version)}` : t(language, 'ui.versionUnknown');
  if (candidate?.version && candidate.version !== bundle.version) {
    version += result.status === 'update-available' ? ` -> v${inline(candidate.version)}` : t(language, 'ui.offeredVersion', { version: inline(candidate.version) });
  }
  if (source.kind === 'github-source' && candidate?.revision) {
    version += source.currentRevision === candidate.revision ? t(language, 'ui.commit', { revision: shortRevision(candidate.revision) })
      : (result.status === 'update-available' || (result.status === 'pinned' && source.currentRevision)) ? t(language, 'ui.commitChange', {
        current: source.currentRevision ? shortRevision(source.currentRevision) : t(language, 'ui.unknown'), target: shortRevision(candidate.revision),
      }) : t(language, 'ui.offeredCommit', { revision: shortRevision(candidate.revision) });
  }
  const lines = [`- ${inline(bundle.name)}: ${version}`, `  ${inline(translate(result.detail, result.message, language))}`];
  if (source.kind !== 'unsupported') lines.push(`  ${t(language, 'ui.source', { source: providerLabel(source, language) })}`);
  if (source.kind === 'github-source') lines.push(`  ${source.ref === 'HEAD' ? t(language, 'ui.gitDefaultRef') : t(language, 'ui.gitRef', { ref: inline(source.ref) })}`);
  if (isActionable(result)) lines.push(`  ${t(language, 'ui.planHint', { name: inline(bundle.name) })}`);
  return lines;
}

/** Group check outcomes by actionability without hiding skipped or failed packages. */
export function formatChecks(results: readonly CheckResult[], language: Language = 'en'): string {
  if (results.length === 0) return t(language, 'ui.check.empty');
  const groups = ORDER.map(status => ({ status, entries: results.filter(result => result.status === status) }))
    .filter(group => group.entries.length > 0);
  const lines = [t(language, 'ui.check.summary', { count: results.length }),
    groups.map(group => `${t(language, STATUS[group.status])}: ${group.entries.length}`).join(' | ')];
  for (const { status, entries } of groups) {
    lines.push('', t(language, 'ui.group', { title: t(language, STATUS[status]), count: entries.length }));
    for (const entry of entries) lines.push(...checkLines(entry, language));
  }
  lines.push('', t(language, 'ui.check.readOnly'));
  return lines.join('\n');
}

function stageLines(name: MessageKey, result: ManagementResult | undefined, language: Language): string[] {
  if (!result) return [];
  const labels: Record<ManagementResult['application'], MessageKey> = {
    applied: 'ui.stage.applied', 'restart-required': 'ui.stage.restart', failed: 'ui.stage.failed',
    cancelled: 'ui.stage.cancelled', overridden: 'ui.stage.overridden',
  };
  const lines = [`${t(language, name)}: ${t(language, labels[result.application])}`];
  if (result.error) {
    lines.push(`  ${t(language, 'ui.stage.reason', { code: inline(result.error.code) })}`);
    if (result.error.diagnostic) for (const line of result.error.diagnostic.split(/\r?\n/)) lines.push(`  ${inline(line)}`);
  }
  if (result.pendingBuilds?.length) lines.push(`  ${t(language, 'ui.stage.builds', { names: result.pendingBuilds.map(inline).join(', ') })}`);
  if (result.restartReason) lines.push(`  ${t(language, 'ui.stage.restartReason', { reason: inline(result.restartReason) })}`);
  return lines;
}

/** Preserve partial failures and raw third-party diagnostics in both supported languages. */
export function formatApply(result: ApplyResult, language: Language = 'en'): string {
  const title = t(language, result.status === 'updated' ? 'ui.apply.updated' : result.status === 'restart-required' ? 'ui.apply.restart' : 'ui.apply.failed');
  const lines = [title, '', inline(translate(result.detail, result.message, language)),
    ...stageLines('ui.apply.removal', result.removal, language), ...stageLines('ui.apply.installation', result.installation, language)];
  if (result.diagnostic) for (const line of result.diagnostic.split(/\r?\n/).filter(line => line.trim() !== '')) lines.push('', `  ${inline(line)}`);
  if (result.remaining) {
    const bundle = result.remaining;
    const state = t(language, !bundle.installed ? 'ui.notInstalled' : bundle.availability === 'missing' ? 'ui.missing' : bundle.enabled ? 'ui.enabled' : 'ui.disabled');
    lines.push('', t(language, 'ui.apply.observed', { name: inline(bundle.name), version: bundle.version ? ` v${inline(bundle.version)}` : '', state }));
    if (bundle.error) lines.push(t(language, 'ui.problem', { code: inline(bundle.error.code) }));
  } else lines.push('', t(language, 'ui.apply.unconfirmed'));
  if (result.status === 'failed' && result.recovery) lines.push('', t(language, 'ui.apply.recovery'), ...targetLines(result.recovery, language));
  if (result.status === 'restart-required') lines.push('', t(language, 'ui.apply.restartHint'));
  return lines.join('\n');
}

/** Render help without translating literal command keywords or the explicit risk acknowledgement. */
export function formatUsage(language: Language = 'en'): string {
  return [t(language, 'ui.help.title'), '',
    `/plugin-updater                  ${t(language, 'ui.help.list')}`,
    `/plugin-updater list             ${t(language, 'ui.help.list')}`,
    `/plugin-updater check [package] [--git-branch branch]  ${t(language, 'ui.help.check')}`,
    `/plugin-updater update <package ...> [--allow-pinned | --accept-removal-risk] [--git-branch branch]   ${t(language, 'ui.help.update')}`,
    '/plugin-updater ok | confirm',
    `/plugin-updater help             ${t(language, 'ui.help.help')}`, '', t(language, 'ui.help.language'), '', t(language, 'ui.help.risk')].join('\n');
}

/** Translate owned failures by identifier; never guess translations from arbitrary diagnostic text. */
export function formatCommandError(error: unknown, language: Language = 'en'): string {
  return [t(language, 'ui.error.title'), '', translate(errorDetail(error), error instanceof Error ? error.message : t(language, 'error.command'), language),
    '', t(language, 'ui.error.help')].join('\n');
}
