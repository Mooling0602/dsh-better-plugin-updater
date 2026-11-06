/** Update checking and explicit, single-use plans over DSH's non-transactional management API. */
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { gt, valid } from 'semver';
import { errorDetail, UpdaterError } from './errors.js';
import { message, t } from './i18n.js';
import { githubRepository, inferSource } from './sources.js';
function freeze(value) {
    if (value && typeof value === 'object') {
        for (const item of Object.values(value))
            freeze(item);
        Object.freeze(value);
    }
    return value;
}
function fingerprint(bundle) {
    return [bundle.name, bundle.version, bundle.source, bundle.enabled, bundle.installed,
        bundle.removable, bundle.availability, bundle.readOnlyReason, bundle.error, bundle.installTarget];
}
function skipReason(bundle) {
    if (bundle.name === 'dsh-better-plugin-updater')
        return { key: 'msg.self' };
    if (!bundle.installed || bundle.availability === 'missing')
        return { key: 'msg.unavailable' };
    if (bundle.availability === 'installation')
        return { key: 'msg.provided' };
    if (bundle.installTarget)
        return { key: 'msg.official' };
    if (!bundle.removable || bundle.readOnlyReason)
        return { key: 'msg.protected' };
    if (bundle.error)
        return { key: 'msg.broken' };
    return undefined;
}
function failureMessage(error) {
    const detail = errorDetail(error);
    return { message: error instanceof Error ? error.message : t('en', 'error.generic'), ...(detail ? { detail } : {}) };
}
/** Decide whether a checked target may enter an update confirmation. */
export function isActionable(result, allowPinned = false) {
    if (!result?.candidate)
        return false;
    if (result.status === 'update-available')
        return result.source.kind !== 'unsupported' && !result.source.pinned;
    const source = result.source;
    const candidate = result.candidate;
    return allowPinned && result.status === 'pinned' && source.kind === 'npm' && source.pinned
        && result.detail?.key === 'msg.npmPinnedUpdate' && source.packageName === result.bundle.name
        && candidate.registry === source.registry && candidate.version !== undefined && valid(candidate.version) !== null
        && result.bundle.version !== undefined && valid(result.bundle.version) !== null
        && gt(candidate.version, result.bundle.version) && candidate.spec === `${source.packageName}@${candidate.version}`;
}
/** A profile-local coordinator. Construction does no I/O; checks never perform package writes. */
export class Updater {
    options;
    plans = new Map();
    abort = new AbortController();
    active = new Set();
    applying = false;
    now;
    ttl;
    constructor(options) {
        this.options = options;
        this.now = options.now ?? Date.now;
        this.ttl = options.planTtlMs ?? 10 * 60_000;
        this.ttlMs();
    }
    /** Read the plan lifetime, so a saved setting applies to the next plan without a reload. */
    ttlMs() {
        const ttl = typeof this.ttl === 'function' ? this.ttl() : this.ttl;
        if (!Number.isSafeInteger(ttl) || ttl < 1)
            throw new UpdaterError('error.ttl');
        return ttl;
    }
    /** Read only the public bundle facts, without UI metadata or unrelated profile data. */
    async list() {
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
    check(name, signal) {
        return this.track(this.checkInternal(name, signal));
    }
    async source(bundle) {
        const override = this.options.overrides?.[bundle.name];
        let registry = '';
        if (override?.kind === 'npm' && override.registry)
            registry = override.registry;
        else if (bundle.source?.startsWith(`${bundle.name}@`)) {
            const configured = await this.options.manager.registries();
            registry = configured.registry ?? configured.resolved ?? '';
            if (!registry)
                throw new UpdaterError('error.registryUnknown');
        }
        const currentRevision = bundle.source && githubRepository(bundle.source)
            ? await this.options.currentRevision?.(bundle) : undefined;
        return inferSource(bundle, { registry, ...(override === undefined ? {} : { override }),
            ...(currentRevision === undefined ? {} : { currentRevision }) });
    }
    async checkInternal(name, callerSignal) {
        const signal = callerSignal ? AbortSignal.any([this.abort.signal, callerSignal]) : this.abort.signal;
        signal.throwIfAborted();
        const all = await this.list();
        const bundles = name === undefined ? all : all.filter(bundle => bundle.name === name);
        if (name !== undefined && bundles.length !== 1)
            throw new UpdaterError('error.bundleUnknown');
        const results = [];
        for (const bundle of bundles) {
            signal.throwIfAborted();
            const reason = skipReason(bundle);
            if (reason) {
                const text = message(reason.key, reason.params);
                results.push({ bundle, source: { kind: 'unsupported', reason: text.message, detail: reason }, status: 'skipped', ...text });
                continue;
            }
            try {
                const source = await this.source(bundle);
                if (source.kind === 'unsupported') {
                    results.push({ bundle, source, status: 'unsupported', message: source.reason, ...(source.detail ? { detail: source.detail } : {}) });
                    continue;
                }
                const provider = this.options.providers.find(item => item.kind === source.kind);
                if (!provider)
                    throw new UpdaterError('error.providerMissing');
                results.push({ bundle, source, ...await provider.check(bundle, source, this.options.client, signal) });
            }
            catch (error) {
                signal.throwIfAborted();
                const reason = message('msg.checkFailed');
                results.push({ bundle, source: { kind: 'unsupported', reason: reason.message, detail: reason.detail }, status: 'error', ...failureMessage(error) });
            }
        }
        return results;
    }
    /** Freeze a checked target, with optional one-time authorization for a pinned npm package. */
    prepare(result, allowPinned = false) {
        if (!isActionable(result, allowPinned) || !result?.candidate) {
            if (result?.detail)
                throw new UpdaterError(result.detail.key, result.detail.params);
            if (result)
                throw new Error(result.message);
            throw new UpdaterError('error.noUpdate');
        }
        const created = this.now();
        for (const [id, plan] of this.plans)
            if (Date.parse(plan.expiresAt) <= created)
                this.plans.delete(id);
        if (this.plans.size >= 1000)
            throw new Error('Too many pending update confirmations.');
        const id = randomUUID();
        const trackingWarning = result.source.kind === 'github-source'
            ? { key: 'warning.gitPin', params: { name: result.bundle.name, ref: result.source.ref } }
            : result.source.kind === 'npm' ? { key: 'warning.npmPin', params: { name: result.bundle.name } } : { key: 'warning.release' };
        const warningDetails = [{ key: 'warning.nonAtomic' }, { key: 'warning.recovery' }, { key: 'warning.permissions' }, trackingWarning];
        const plan = freeze(structuredClone({ id, createdAt: new Date(created).toISOString(),
            expiresAt: new Date(created + this.ttlMs()).toISOString(), command: `/plugin-updater update ${result.bundle.name}${result.status === 'pinned' ? ' --allow-pinned' : ''}`,
            bundle: result.bundle, source: result.source, candidate: result.candidate,
            warnings: warningDetails.map(detail => t('en', detail.key, detail.params)), warningDetails }));
        this.abort.signal.throwIfAborted();
        this.plans.set(plan.id, plan);
        return plan;
    }
    /** Execute one saved plan only after explicit acknowledgement; never approve dependency scripts or compatibility exemptions. */
    apply(id, acceptRemovalRisk) {
        this.abort.signal.throwIfAborted();
        if (!acceptRemovalRisk)
            throw new UpdaterError('error.acceptRisk');
        if (this.applying)
            throw new UpdaterError('error.busy');
        const plan = this.plans.get(id);
        if (!plan || Date.parse(plan.expiresAt) <= this.now())
            throw new UpdaterError('error.expired');
        this.applying = true;
        return this.track(this.applyInternal(plan).finally(() => { this.applying = false; }));
    }
    async applyInternal(plan) {
        const current = (await this.list()).find(bundle => bundle.name === plan.bundle.name);
        if (!current || skipReason(current) || !isDeepStrictEqual(fingerprint(current), fingerprint(plan.bundle))
            || !isDeepStrictEqual(await this.source(current), plan.source))
            throw new UpdaterError('error.stale');
        this.abort.signal.throwIfAborted();
        this.plans.delete(plan.id);
        let removal;
        let installation;
        const recovery = this.recovery(plan);
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
                const source = await this.source(remaining);
                matches = source.kind === 'github-source' && source.currentRevision === plan.candidate.revision;
            }
            const needsRestart = removal.application === 'restart-required' || installation.application === 'restart-required';
            return { status: matches ? needsRestart ? 'restart-required' : 'updated' : 'failed',
                ...message(matches ? 'msg.installed' : 'msg.unexpectedState'),
                removal, installation, ...observed, ...(recovery ? { recovery } : {}) };
        }
        catch (error) {
            return { status: 'failed', ...failureMessage(error), ...(removal ? { removal } : {}),
                ...(installation ? { installation } : {}), ...await this.observe(current.name), ...(recovery ? { recovery } : {}) };
        }
    }
    recovery(plan) {
        if (plan.source.kind === 'npm' && plan.bundle.version && valid(plan.bundle.version)) {
            return { spec: `${plan.bundle.name}@${plan.bundle.version}`, version: plan.bundle.version, registry: plan.source.registry };
        }
        if (plan.source.kind === 'github-source' && plan.source.currentRevision) {
            return { spec: `${plan.source.baseSpec}#${plan.source.currentRevision}`, revision: plan.source.currentRevision };
        }
        if (plan.source.kind === 'github-release' && plan.bundle.source)
            return { spec: plan.bundle.source };
        return undefined;
    }
    async observe(name) {
        try {
            const remaining = (await this.options.manager.listBundles()).find(bundle => bundle.name === name);
            return remaining ? { remaining: structuredClone({ name: remaining.name,
                    ...(remaining.version === undefined ? {} : { version: remaining.version }),
                    ...(remaining.source === undefined ? {} : { source: remaining.source }),
                    enabled: remaining.enabled, installed: remaining.installed, removable: remaining.removable,
                    availability: remaining.availability, ...(remaining.error ? { error: remaining.error } : {}) }) } : {};
        }
        catch {
            return {};
        }
    }
    track(work) {
        this.active.add(work);
        void work.finally(() => this.active.delete(work)).catch(() => undefined);
        return work;
    }
    /** Abort outstanding metadata reads and await active updates before the owning plugin unloads. */
    async dispose() {
        this.abort.abort();
        this.plans.clear();
        await Promise.allSettled([...this.active]);
    }
}
//# sourceMappingURL=updater.js.map