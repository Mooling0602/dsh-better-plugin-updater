/** Update checking and explicit, single-use plans over DSH's non-transactional management API. */
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { gt, valid } from 'semver';
import { errorDetail, UpdaterError } from './errors.js';
import { message, t } from './i18n.js';
import type { Message } from './i18n.js';
import { githubRepository, inferSource, releaseAttachment } from './sources.js';
import { prewarm } from './prewarm.js';
import type { PrewarmOptions, PrewarmResult } from './prewarm.js';
import type { ApplyResult, CheckResult, InstalledBundle, JsonClient, ManagementResult, PluginManager, SourceOverride, UpdateCandidate, UpdatePlan, UpdateProvider } from './types.js';

/** Dependencies and policy injected by the Cordis adapter or isolated tests. */
export interface UpdaterOptions {
  readonly manager: PluginManager;
  readonly client: JsonClient;
  readonly providers: readonly UpdateProvider[];
  readonly overrides?: Readonly<Record<string, SourceOverride>>;
  readonly currentRevision?: (bundle: InstalledBundle) => Promise<string | null | undefined>;
  /** A fixed lifetime, or a reader evaluated per plan so a saved setting applies at once. */
  readonly planTtlMs?: number | (() => number);
  readonly now?: () => number;
  /** Package-manager facts for staging a registry target; omitted means staging is skipped. */
  readonly prewarm?: PrewarmOptions & { readonly profileDir: string };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function fingerprint(bundle: InstalledBundle): unknown[] {
  return [bundle.name, bundle.version, bundle.source, bundle.enabled, bundle.installed,
    bundle.removable, bundle.availability, bundle.readOnlyReason, bundle.error, bundle.installTarget];
}
/** Identify the active executor, which can be checked but cannot update itself. */
export function isSelfBundle(bundle: Pick<InstalledBundle, 'name'>): boolean {
  return bundle.name === 'dsh-better-plugin-updater';
}
function skipReason(bundle: InstalledBundle): Message | undefined {
  if (bundle.availability === 'installation') return { key: 'msg.provided' };
  if (bundle.installTarget) return { key: 'msg.official' };
  if (!bundle.installed) return { key: 'msg.unavailable' };
  if (bundle.availability === 'missing') return { key: 'msg.filesUnavailable' };
  if (!bundle.removable || bundle.readOnlyReason) return { key: 'msg.protected' };
  if (bundle.error) return { key: 'msg.broken' };
  return undefined;
}
function failureMessage(error: unknown): { message: string; detail?: Message } {
  const detail = errorDetail(error);
  return { message: error instanceof Error ? error.message : t('en', 'error.generic'), ...(detail ? { detail } : {}) };
}

/** Decide whether a checked target may enter an update confirmation. */
export function isActionable(result: CheckResult | undefined, allowPinned = false): boolean {
  if (!result?.candidate || isSelfBundle(result.bundle)) return false;
  const source = result.source;
  const candidate = result.candidate;
  if (source.kind === 'github-source') {
    const installed = result.bundle.source && githubRepository(result.bundle.source);
    if (!installed || installed.baseSpec !== source.baseSpec || installed.repository.toLowerCase() !== source.repository.toLowerCase()
      || !source.currentRevision || !/^[a-f0-9]{40}$/i.test(source.currentRevision)
      || (/^[a-f0-9]{40}$/i.test(installed.ref) && installed.ref.toLowerCase() !== source.currentRevision.toLowerCase())
      || !candidate.revision || !/^[a-f0-9]{40}$/.test(candidate.revision)
      || candidate.revision === source.currentRevision.toLowerCase()
      || candidate.spec !== `${source.baseSpec}#${candidate.revision}`
      || candidate.registry !== undefined || candidate.version !== undefined || candidate.url !== undefined) return false;
  }
  if (result.status === 'update-available') return source.kind !== 'unsupported' && !source.pinned;
  if (allowPinned && result.status === 'pinned' && source.kind === 'github-source' && source.pinned
    && result.detail?.key === 'msg.gitPinnedUpdate' && result.detail.params?.name === result.bundle.name) {
    const installed = result.bundle.source && githubRepository(result.bundle.source);
    return !!installed && /^[a-f0-9]{40}$/i.test(installed.ref)
      && installed.baseSpec === source.baseSpec && installed.repository.toLowerCase() === source.repository.toLowerCase()
      && source.currentRevision !== undefined && /^[a-f0-9]{40}$/i.test(source.currentRevision)
      && source.currentRevision.toLowerCase() === installed.ref.toLowerCase()
      && candidate.revision !== undefined && /^[a-f0-9]{40}$/.test(candidate.revision)
      && candidate.revision !== source.currentRevision.toLowerCase()
      && candidate.spec === `${source.baseSpec}#${candidate.revision}`
      && candidate.registry === undefined && candidate.version === undefined && candidate.url === undefined;
  }
  return allowPinned && result.status === 'pinned' && source.kind === 'npm' && source.pinned
    && result.detail?.key === 'msg.npmPinnedUpdate' && source.packageName === result.bundle.name
    && candidate.registry === source.registry && candidate.version !== undefined && valid(candidate.version) !== null
    && result.bundle.version !== undefined && valid(result.bundle.version) !== null
    && gt(candidate.version, result.bundle.version) && candidate.spec === `${source.packageName}@${candidate.version}`;
}

/** A profile-local coordinator. Construction does no I/O; checks never perform package writes. */
export class Updater {
  private readonly plans = new Map<string, UpdatePlan>();
  private readonly planOverrides = new Map<string, SourceOverride | undefined>();
  private readonly checks = new WeakMap<CheckResult, { result: CheckResult; override: SourceOverride | undefined; gitBranch: string | undefined }>();
  private readonly abort = new AbortController();
  private readonly active = new Set<Promise<unknown>>();
  private applying = false;
  private readonly now: () => number;
  private readonly ttl: number | (() => number);

  constructor(private readonly options: UpdaterOptions) {
    this.now = options.now ?? Date.now;
    this.ttl = options.planTtlMs ?? 10 * 60_000;
    this.ttlMs();
  }

  /** Read the plan lifetime, so a saved setting applies to the next plan without a reload. */
  private ttlMs(): number {
    const ttl = typeof this.ttl === 'function' ? this.ttl() : this.ttl;
    if (!Number.isSafeInteger(ttl) || ttl < 1) throw new UpdaterError('error.ttl');
    return ttl;
  }

  /** Read only the public bundle facts, without UI metadata or unrelated profile data. */
  async list(): Promise<InstalledBundle[]> {
    this.abort.signal.throwIfAborted();
    return (await this.options.manager.listBundles()).map(bundle => ({ name: bundle.name,
      ...(bundle.version === undefined ? {} : { version: bundle.version }),
      ...(bundle.source === undefined ? {} : { source: bundle.source }),
      enabled: bundle.enabled, installed: bundle.installed, removable: bundle.removable, availability: bundle.availability,
      ...(bundle.readOnlyReason === undefined ? {} : { readOnlyReason: bundle.readOnlyReason }),
      ...(bundle.error === undefined ? {} : { error: { ...bundle.error } }),
      ...(bundle.installTarget === undefined ? {} : { installTarget: { ...bundle.installTarget } }) }));
  }

  /** Check one or all bundles sequentially, bounding traffic and isolating per-package failures. */
  check(name?: string, signal?: AbortSignal, gitBranch?: string): Promise<CheckResult[]> {
    return this.track(this.checkInternal(name, signal, gitBranch));
  }

  /** Check one GitHub-backed bundle without issuing requests for other source kinds. */
  async checkGithub(name: string, signal?: AbortSignal): Promise<CheckResult | undefined> {
    return (await this.track(this.checkInternal(name, signal, undefined, true)))[0];
  }

  private async source(bundle: InstalledBundle, gitBranch?: string, snapshot?: { override: SourceOverride | undefined }) {
    const override = snapshot ? snapshot.override : structuredClone(this.options.overrides?.[bundle.name]);
    let registry = '';
    if (override?.kind === 'npm' && override.registry) registry = override.registry;
    else if (bundle.source?.startsWith(`${bundle.name}@`)) {
      const configured = await this.options.manager.registries();
      registry = configured.registry ?? configured.resolved ?? '';
      if (!registry) throw new UpdaterError('error.registryUnknown');
    }
    const currentRevision = bundle.source && githubRepository(bundle.source)
      ? await this.options.currentRevision?.(bundle) : undefined;
    return inferSource(bundle, { registry, ...(override === undefined ? {} : { override }),
      ...(currentRevision === undefined ? {} : { currentRevision }), ...(gitBranch === undefined ? {} : { gitBranch }) });
  }

  private async checkInternal(name?: string, callerSignal?: AbortSignal, gitBranch?: string, githubOnly = false): Promise<CheckResult[]> {
    const signal = callerSignal ? AbortSignal.any([this.abort.signal, callerSignal]) : this.abort.signal;
    signal.throwIfAborted();
    const all = await this.list();
    const bundles = name === undefined ? all : all.filter(bundle => bundle.name === name);
    if (name !== undefined && bundles.length !== 1) throw new UpdaterError('error.bundleUnknown');
    const results: CheckResult[] = [];
    for (const bundle of bundles) {
      signal.throwIfAborted();
      if (githubOnly && (!bundle.source || (!githubRepository(bundle.source) && !releaseAttachment(bundle.source)))) continue;
      const reason = skipReason(bundle);
      if (reason) {
        const text = message(reason.key, reason.params);
        results.push({ bundle, source: { kind: 'unsupported', reason: text.message, detail: reason }, status: 'skipped', ...text });
        continue;
      }
      try {
        const override = structuredClone(this.options.overrides?.[bundle.name]);
        const source = await this.source(bundle, gitBranch, { override });
        if (source.kind === 'unsupported') {
          results.push({ bundle, source, status: 'unsupported', message: source.reason, ...(source.detail ? { detail: source.detail } : {}) });
          continue;
        }
        const provider = this.options.providers.find(item => item.kind === source.kind);
        if (!provider) throw new UpdaterError('error.providerMissing');
        const checked = await provider.check(bundle, source, this.options.client, signal, source.kind === 'github-source' ? gitBranch : undefined);
        const selfNotice = isSelfBundle(bundle) && (checked.status === 'update-available' || checked.detail?.key === 'msg.npmPinnedUpdate' || checked.detail?.key === 'msg.gitPinnedUpdate');
        const result: CheckResult = { bundle, source, ...checked, ...(selfNotice ? message(checked.detail?.key === 'msg.npmPinnedUpdate' ? 'msg.selfPinnedUpdate' : 'msg.selfUpdateAvailable') : {}) };
        this.checks.set(result, { result: structuredClone(result), override, gitBranch });
        results.push(result);
      } catch (error) {
        signal.throwIfAborted();
        const reason = message('msg.checkFailed');
        results.push({ bundle, source: { kind: 'unsupported', reason: reason.message, detail: reason.detail }, status: 'error', ...failureMessage(error) });
      }
    }
    return results;
  }

  /** Freeze a checked target, with optional one-time authorization for an eligible pin. */
  prepare(result: CheckResult | undefined, allowPinned = false, gitBranch?: string): UpdatePlan {
    if (result && isSelfBundle(result.bundle)) throw new UpdaterError('msg.self');
    if (!isActionable(result, allowPinned) || !result?.candidate) {
      if (result?.detail) throw new UpdaterError(result.detail.key, result.detail.params);
      if (result) throw new Error(result.message);
      throw new UpdaterError('error.noUpdate');
    }
    const checked = this.checks.get(result);
    const installed = result.source.kind === 'github-source' && result.bundle.source && githubRepository(result.bundle.source);
    if (installed && /^[a-f0-9]{40}$/i.test(installed.ref)
      && (!checked || !isDeepStrictEqual(checked.result, result) || checked.gitBranch !== gitBranch
        || !isDeepStrictEqual(checked.override, this.options.overrides?.[result.bundle.name]))) throw new UpdaterError('error.stale');
    const override = checked ? checked.override : structuredClone(this.options.overrides?.[result.bundle.name]);
    const created = this.now();
    for (const [id, plan] of this.plans) if (Date.parse(plan.expiresAt) <= created) {
      this.plans.delete(id);
      this.planOverrides.delete(id);
    }
    if (this.plans.size >= 1000) throw new Error('Too many pending update confirmations.');
    const id = randomUUID();
    const trackingWarning: Message = result.source.kind === 'github-source'
      ? { key: 'warning.gitPin', params: { name: result.bundle.name, ref: result.source.ref } }
      : result.source.kind === 'npm' ? { key: 'warning.npmPin', params: { name: result.bundle.name } } : { key: 'warning.release' };
    const warningDetails: Message[] = [{ key: 'warning.nonAtomic' }, { key: 'warning.recovery' }, { key: 'warning.permissions' }, trackingWarning];
    const plan = freeze(structuredClone({ id, createdAt: new Date(created).toISOString(),
      expiresAt: new Date(created + this.ttlMs()).toISOString(), command: `/plugin-updater update ${result.bundle.name}${result.status === 'pinned' ? ' --allow-pinned' : ''}${gitBranch === undefined ? '' : ` --git-branch ${gitBranch}`}`,
      ...(gitBranch === undefined ? {} : { gitBranch }), bundle: result.bundle, source: result.source, candidate: result.candidate,
      warnings: warningDetails.map(detail => t('en', detail.key, detail.params)), warningDetails } satisfies UpdatePlan));
    this.abort.signal.throwIfAborted();
    this.plans.set(plan.id, plan);
    this.planOverrides.set(plan.id, structuredClone(override));
    return plan;
  }

  /** Withdraw an unconfirmed plan without touching any package. */
  discard(id: string): void {
    this.plans.delete(id);
    this.planOverrides.delete(id);
  }

  /** Execute one saved plan only after explicit acknowledgement; never approve dependency scripts or compatibility exemptions. */
  apply(id: string, acceptRemovalRisk: boolean): Promise<ApplyResult> {
    this.abort.signal.throwIfAborted();
    if (!acceptRemovalRisk) throw new UpdaterError('error.acceptRisk');
    if (this.applying) throw new UpdaterError('error.busy');
    const plan = this.plans.get(id);
    if (!plan || Date.parse(plan.expiresAt) <= this.now()) throw new UpdaterError('error.expired');
    this.applying = true;
    return this.track(this.applyInternal(plan).finally(() => { this.applying = false; }));
  }

  private async applyInternal(plan: UpdatePlan): Promise<ApplyResult> {
    const current = (await this.list()).find(bundle => bundle.name === plan.bundle.name);
    const override = this.planOverrides.get(plan.id);
    if (!current || isSelfBundle(current) || skipReason(current) || !isDeepStrictEqual(fingerprint(current), fingerprint(plan.bundle))
      || !isDeepStrictEqual(override, this.options.overrides?.[current.name])
      || !isDeepStrictEqual(await this.source(current, plan.gitBranch, { override }), plan.source)
      || !isDeepStrictEqual(override, this.options.overrides?.[current.name])) throw new UpdaterError('error.stale');
    this.abort.signal.throwIfAborted();
    this.plans.delete(plan.id);
    this.planOverrides.delete(plan.id);
    let removal: ManagementResult | undefined;
    let installation: ManagementResult | undefined;
    const recovery = this.recovery(plan);
    const staged = await this.stage(plan);
    if (staged.status === 'failed') {
      return { status: 'failed', ...message('msg.prewarmFailed'), ...(staged.detail ? { detail: staged.detail } : {}),
        ...(staged.diagnostic ? { diagnostic: staged.diagnostic } : {}), ...await this.observe(current.name), ...(recovery ? { recovery } : {}) };
    }
    try {
      removal = await this.options.manager.removeBundle(current.name);
      if (removal.application !== 'applied' && removal.application !== 'restart-required' && removal.error?.code !== 'stop-profile') {
        return { status: 'failed', ...message('msg.removalFailed'), removal,
          ...await this.observe(current.name), ...(recovery ? { recovery } : {}) };
      }
      // Once removal starts, finish recovery-critical installation even if the command caller disconnects.
      installation = await this.options.manager.installBundle(plan.candidate.spec, { enabled: current.enabled,
        requestId: randomUUID(), saveExact: true,
        ...(plan.candidate.registry === undefined ? {} : { registry: plan.candidate.registry }) });
      const observed = await this.observe(current.name);
      const remaining = observed.remaining;
      const accepted = installation.application === 'applied' || installation.application === 'restart-required';
      let matches = accepted && remaining?.installed === true && remaining.availability === 'profile'
        && remaining.enabled === current.enabled && !remaining.error
        && (installation.bundle === undefined || installation.bundle === current.name)
        && (plan.candidate.version === undefined || remaining.version === plan.candidate.version);
      if (matches && plan.candidate.revision && remaining) {
        const installed = remaining.source && githubRepository(remaining.source);
        const source = await this.source(remaining);
        matches = plan.source.kind === 'github-source' && !!installed
          && installed.baseSpec === plan.source.baseSpec && installed.repository.toLowerCase() === plan.source.repository.toLowerCase()
          && installed.ref.toLowerCase() === plan.candidate.revision
          && source.kind === 'github-source' && source.baseSpec === plan.source.baseSpec
          && source.repository.toLowerCase() === plan.source.repository.toLowerCase()
          && source.currentRevision?.toLowerCase() === plan.candidate.revision;
      }
      const needsRestart = removal.application === 'restart-required' || installation.application === 'restart-required';
      return { status: matches ? needsRestart ? 'restart-required' : 'updated' : 'failed',
        ...message(matches ? 'msg.installed' : 'msg.unexpectedState'),
        removal, installation, ...observed, ...(recovery ? { recovery } : {}) };
    } catch (error) {
      return { status: 'failed', ...failureMessage(error), ...(removal ? { removal } : {}),
        ...(installation ? { installation } : {}), ...await this.observe(current.name), ...(recovery ? { recovery } : {}) };
    }
  }

  private async stage(plan: UpdatePlan): Promise<PrewarmResult> {
    const target = this.options.prewarm;
    if (!target) return { status: 'skipped' };
    return await prewarm(plan.source, plan.candidate, target.profileDir, target);
  }
  private recovery(plan: UpdatePlan): UpdateCandidate | undefined {
    if (plan.source.kind === 'npm' && plan.bundle.version && valid(plan.bundle.version)) {
      return { spec: `${plan.bundle.name}@${plan.bundle.version}`, version: plan.bundle.version, registry: plan.source.registry };
    }
    if (plan.source.kind === 'github-source' && plan.source.currentRevision) {
      return { spec: `${plan.source.baseSpec}#${plan.source.currentRevision}`, revision: plan.source.currentRevision };
    }
    if (plan.source.kind === 'github-release' && plan.bundle.source) return { spec: plan.bundle.source };
    return undefined;
  }
  private async observe(name: string): Promise<{ remaining?: InstalledBundle }> {
    try {
      const remaining = (await this.options.manager.listBundles()).find(bundle => bundle.name === name);
      return remaining ? { remaining: structuredClone({ name: remaining.name,
        ...(remaining.version === undefined ? {} : { version: remaining.version }),
        ...(remaining.source === undefined ? {} : { source: remaining.source }),
        enabled: remaining.enabled, installed: remaining.installed, removable: remaining.removable,
        availability: remaining.availability, ...(remaining.error ? { error: remaining.error } : {}) }) } : {};
    } catch { return {}; }
  }
  private track<T>(work: Promise<T>): Promise<T> {
    this.active.add(work);
    void work.finally(() => this.active.delete(work)).catch(() => undefined);
    return work;
  }

  /** Abort outstanding metadata reads and await active updates before the owning plugin unloads. */
  async dispose(): Promise<void> {
    this.abort.abort();
    this.plans.clear();
    this.planOverrides.clear();
    await Promise.allSettled([...this.active]);
  }
}
