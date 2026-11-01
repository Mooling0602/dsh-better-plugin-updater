import test from 'node:test';
import assert from 'node:assert/strict';
import { Updater, createProviders } from '../dist/core.js';

function fixture(options = {}) {
  let bundles = [{ name: 'plugin', version: '1.0.0', source: 'plugin@^1.0.0', enabled: false, installed: true, removable: true, availability: 'profile' }];
  const calls = [];
  const manager = {
    async listBundles() { return structuredClone(bundles); },
    async registries() { return { registry: null, resolved: 'https://registry.test/' }; },
    async removeBundle(name) { calls.push(['remove', name]); bundles = []; return { application: 'applied' }; },
    async installBundle(spec, settings) {
      calls.push(['install', spec, settings]);
      bundles = [{ name: 'plugin', version: '2.0.0', source: spec, enabled: settings.enabled, installed: true, removable: true, availability: 'profile' }];
      return { application: 'applied', bundle: 'plugin', version: '2.0.0' };
    },
  };
  const provider = { kind: 'npm', async check() { return { status: 'update-available', message: 'fixture', candidate: { spec: 'plugin@2.0.0', version: '2.0.0', registry: 'https://registry.test/' } }; } };
  const updater = new Updater({ manager, client: { async get() { throw new Error('No real network in coordinator tests.'); } }, providers: [provider], ...options });
  return { updater, manager, provider, calls, get bundles() { return bundles; }, set bundles(value) { bundles = value; } };
}

test('checking and planning are read-only; plans freeze exact targets', async () => {
  const f = fixture();
  assert.equal((await f.updater.check())[0].status, 'update-available');
  const plan = await f.updater.plan('plugin');
  assert.deepEqual(f.calls, []);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.candidate), true);
  assert.throws(() => { plan.candidate.spec = 'malicious'; });
  assert.equal(plan.bundle.enabled, false);
  assert.equal(plan.candidate.spec, 'plugin@2.0.0');
  assert.equal(plan.command, `/plugin-updater update ${plan.id} --accept-removal-risk`);
  assert.match(plan.warnings.join(' '), /version-pinned/);
  await f.updater.dispose();
});

test('explicit acknowledgement is mandatory and plans are single use', async () => {
  const f = fixture();
  const plan = await f.updater.plan('plugin');
  assert.throws(() => f.updater.apply(plan.id, false), /acceptance/);
  assert.deepEqual(f.calls, []);
  const result = await f.updater.apply(plan.id, true);
  assert.equal(result.status, 'updated');
  assert.deepEqual(f.calls.map(call => call[0]), ['remove', 'install']);
  assert.equal(f.calls[1][2].enabled, false);
  assert.equal(f.calls[1][2].saveExact, true);
  assert.equal(f.calls[1][2].approvedBuilds, undefined);
  assert.equal(result.recovery.spec, 'plugin@1.0.0');
  assert.throws(() => f.updater.apply(plan.id, true), /missing or expired/);
});

test('expiry, package changes, and registry changes invalidate a plan before writes', async () => {
  let now = 1000;
  const f = fixture({ now: () => now, planTtlMs: 100 });
  const expired = await f.updater.plan('plugin'); now += 101;
  assert.throws(() => f.updater.apply(expired.id, true), /expired/);
  const stale = await f.updater.plan('plugin');
  f.bundles = [{ ...f.bundles[0], enabled: true }];
  await assert.rejects(f.updater.apply(stale.id, true), /stale/);
  const changed = await f.updater.plan('plugin');
  f.manager.registries = async () => ({ registry: 'https://private.test/' });
  await assert.rejects(f.updater.apply(changed.id, true), /stale/);
  assert.deepEqual(f.calls, []);
});

test('protected, installation, official-target and self bundles are not checked', async () => {
  const f = fixture();
  const base = f.bundles[0];
  f.bundles = [
    { ...base, name: 'dsh-better-plugin-updater' },
    { ...base, name: 'official', installTarget: { spec: 'official@2', version: '2' } },
    { ...base, name: 'shipped', availability: 'installation' },
    { ...base, name: 'protected', removable: false },
    { ...base, name: 'absent', availability: 'missing' },
  ];
  const results = await f.updater.check();
  assert.equal(results.every(result => result.status === 'skipped'), true);
  await assert.rejects(f.updater.plan('official'));
  await assert.rejects(f.updater.check('not-present'));
  assert.deepEqual(f.calls, []);
});

test('a failed removal never proceeds to installation', async () => {
  const f = fixture();
  const plan = await f.updater.plan('plugin');
  f.manager.removeBundle = async () => ({ application: 'failed', error: { code: 'bundle-in-use' } });
  const result = await f.updater.apply(plan.id, true);
  assert.equal(result.status, 'failed');
  assert.equal(result.installation, undefined);
  assert.equal(result.remaining.version, '1.0.0');
});

test('stop-profile follows the official install-over path and reports restart', async () => {
  const f = fixture();
  const plan = await f.updater.plan('plugin');
  f.manager.removeBundle = async () => ({ application: 'failed', error: { code: 'stop-profile' } });
  const install = f.manager.installBundle;
  f.manager.installBundle = async (...args) => ({ ...await install(...args), application: 'restart-required' });
  const result = await f.updater.apply(plan.id, true);
  assert.equal(result.status, 'restart-required');
  assert.equal(result.remaining.version, '2.0.0');
});

test('failed, cancelled or throwing installation reports actual absence and manual recovery', async () => {
  for (const behavior of ['failed', 'cancelled', 'throw']) {
    const f = fixture();
    const plan = await f.updater.plan('plugin');
    f.manager.installBundle = async () => {
      if (behavior === 'throw') throw new Error('Fixture installation failed.');
      return { application: behavior, pendingBuilds: ['fixture-build'] };
    };
    const result = await f.updater.apply(plan.id, true);
    assert.equal(result.status, 'failed');
    assert.equal(result.remaining, undefined);
    assert.equal(result.recovery.spec, 'plugin@1.0.0');
    assert.deepEqual(f.calls.map(call => call[0]), ['remove']);
  }
});

test('a successful host answer with the wrong installed version is not reported as updated', async () => {
  const f = fixture();
  const plan = await f.updater.plan('plugin');
  f.manager.installBundle = async (_spec, settings) => {
    f.bundles = [{ name: 'plugin', source: 'plugin@3.0.0', version: '3.0.0', enabled: settings.enabled, installed: true, removable: true, availability: 'profile' }];
    return { application: 'applied' };
  };
  assert.equal((await f.updater.apply(plan.id, true)).status, 'failed');
});

test('a second update cannot run concurrently and disposal waits for recovery-critical install', async () => {
  const f = fixture();
  const first = await f.updater.plan('plugin');
  const second = await f.updater.plan('plugin');
  let release;
  let entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const remove = f.manager.removeBundle;
  f.manager.removeBundle = async (...args) => { entered(); await gate; return remove(...args); };
  const running = f.updater.apply(first.id, true);
  await started;
  assert.throws(() => f.updater.apply(second.id, true), /already running/);
  let disposed = false;
  const disposal = f.updater.dispose().then(() => { disposed = true; });
  await Promise.resolve();
  assert.equal(disposed, false);
  release();
  assert.equal((await running).status, 'updated');
  await disposal;
  await assert.rejects(f.updater.check());
});

test('Git updates verify the installed commit independently of the unchanged package version', async () => {
  const next = 'a'.repeat(40);
  let revision = 'b'.repeat(40);
  const f = fixture({ providers: createProviders(), client: { async get() { return { sha: next }; } }, currentRevision: async () => revision,
    overrides: { plugin: { kind: 'github-source', repository: 'owner/repo', ref: 'main' } } });
  f.bundles = [{ ...f.bundles[0], source: 'github:owner/repo#main' }];
  const plan = await f.updater.plan('plugin');
  assert.equal(plan.candidate.version, undefined);
  f.manager.installBundle = async (spec, settings) => {
    revision = next;
    f.bundles = [{ name: 'plugin', source: spec, version: '1.0.0', enabled: settings.enabled, installed: true, removable: true, availability: 'profile' }];
    return { application: 'applied', bundle: 'plugin', version: '1.0.0' };
  };
  const result = await f.updater.apply(plan.id, true);
  assert.equal(result.status, 'updated');
  assert.equal(result.remaining.version, '1.0.0');
  assert.equal((await f.updater.check('plugin'))[0].status, 'current');
});

test('a changed Git baseline invalidates a plan before removing a package', async () => {
  let revision = 'b'.repeat(40);
  const f = fixture({ providers: createProviders(), client: { async get() { return { sha: 'a'.repeat(40) }; } }, currentRevision: async () => revision });
  f.bundles = [{ ...f.bundles[0], source: 'github:owner/repo#main' }];
  const plan = await f.updater.plan('plugin');
  revision = 'c'.repeat(40);
  await assert.rejects(f.updater.apply(plan.id, true), /stale/);
  assert.deepEqual(f.calls, []);
});

test('a failed provider is isolated from other checks and cannot create a plan', async () => {
  const f = fixture();
  f.provider.check = async () => { throw new Error('Fixture error.'); };
  const result = await f.updater.check();
  assert.equal(result[0].status, 'error');
  await assert.rejects(f.updater.plan('plugin'), /Fixture error/);
  assert.deepEqual(f.calls, []);
});
