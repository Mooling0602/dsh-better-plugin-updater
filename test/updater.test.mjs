import test from 'node:test';
import assert from 'node:assert/strict';
import { Updater, createProviders } from '../dist/core.js';
import { createUpdaterCommand } from '../dist/commands.js';
import { createUpdaterTool } from '../dist/tools.js';
import { lockedRevision } from '../dist/lockfile.js';

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

async function prepare(updater, name) {
  return updater.prepare((await updater.check(name))[0]);
}

test('checking and preparation are read-only; confirmations freeze exact targets', async () => {
  const f = fixture();
  assert.equal((await f.updater.check())[0].status, 'update-available');
  const plan = await prepare(f.updater, 'plugin');
  assert.deepEqual(f.calls, []);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.candidate), true);
  assert.throws(() => { plan.candidate.spec = 'malicious'; });
  assert.equal(plan.bundle.enabled, false);
  assert.equal(plan.candidate.spec, 'plugin@2.0.0');
  assert.equal(plan.command, '/plugin-updater update plugin');
  assert.match(plan.warnings.join(' '), /version-pinned/);
  await f.updater.dispose();
});

test('explicit acknowledgement is mandatory and plans are single use', async () => {
  const f = fixture();
  const plan = await prepare(f.updater, 'plugin');
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
  const expired = await prepare(f.updater, 'plugin'); now += 101;
  assert.throws(() => f.updater.apply(expired.id, true), /expired/);
  const stale = await prepare(f.updater, 'plugin');
  f.bundles = [{ ...f.bundles[0], enabled: true }];
  await assert.rejects(f.updater.apply(stale.id, true), /stale/);
  const changed = await prepare(f.updater, 'plugin');
  f.manager.registries = async () => ({ registry: 'https://private.test/' });
  await assert.rejects(f.updater.apply(changed.id, true), /stale/);
  assert.deepEqual(f.calls, []);
});

test('pinned npm checks discover newer versions without authorizing removal', async () => {
  const client = { async get() { return { name: 'plugin', 'dist-tags': { latest: '2.0.0' }, versions: { '2.0.0': { name: 'plugin', version: '2.0.0', dsh: { bundle: {} } } } }; } };
  const f = fixture({ providers: createProviders(), client });
  f.bundles = [{ ...f.bundles[0], source: 'plugin@1.0.0' }];
  const [result] = await f.updater.check('plugin');
  assert.equal(result.source.pinned, true);
  assert.equal(result.status, 'pinned');
  assert.equal(result.candidate.version, '2.0.0');
  assert.throws(() => f.updater.prepare(result));
  const attempt = await createUpdaterCommand(f.updater).handler({ rawInput: 'update plugin --accept-removal-risk' });
  assert.equal(attempt.kind, 'error');
  assert.match(attempt.text, /newer version is available/i);
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();

  const allowed = fixture({ providers: createProviders(), client, overrides: { plugin: { kind: 'npm', allowPinned: true } } });
  allowed.bundles = [{ ...allowed.bundles[0], source: 'plugin@1.0.0' }];
  const [actionable] = await allowed.updater.check('plugin');
  assert.equal(actionable.status, 'update-available');
  assert.equal(actionable.source.pinned, false);
  assert.equal(allowed.updater.prepare(actionable).candidate.spec, 'plugin@2.0.0');
  assert.deepEqual(allowed.calls, []);
  await allowed.updater.dispose();
});

test('one-time authorization rejects inconsistent pinned npm targets', async () => {
  const client = { async get() { return { name: 'plugin', 'dist-tags': { latest: '2.0.0' }, versions: { '2.0.0': { name: 'plugin', version: '2.0.0', dsh: { bundle: {} } } } }; } };
  const f = fixture({ providers: createProviders(), client });
  f.bundles = [{ ...f.bundles[0], source: 'plugin@1.0.0' }];
  const [result] = await f.updater.check('plugin');
  for (const invalid of [
    { ...result, bundle: { ...result.bundle, version: 'unknown' } },
    { ...result, candidate: { ...result.candidate, version: '0.9.0', spec: 'plugin@0.9.0' } },
    { ...result, candidate: { ...result.candidate, spec: 'other@2.0.0' } },
    { ...result, candidate: { ...result.candidate, registry: 'https://other.test/' } },
    { ...result, detail: { key: 'msg.gitPinned' } },
  ]) assert.throws(() => f.updater.prepare(invalid, true));
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('one-time pinned npm authorization requires confirmation and does not persist', async () => {
  let latest = '2.0.0';
  const client = { async get() { return { name: 'plugin', 'dist-tags': { latest }, versions: { [latest]: { name: 'plugin', version: latest, dsh: { bundle: {} } } } }; } };
  const f = fixture({ providers: createProviders(), client });
  f.bundles = [{ ...f.bundles[0], source: 'plugin@1.0.0' }];
  const command = createUpdaterCommand(f.updater);
  const owner = {}, other = {};
  const preview = await command.handler({ rawInput: 'update plugin --allow-pinned', agent: owner });
  assert.equal(preview.kind, 'success');
  assert.match(preview.text, /plugin@2\.0\.0/);
  assert.match(preview.text, /this update only/);
  assert.deepEqual(f.calls, []);
  assert.equal((await command.handler({ rawInput: 'ok', agent: other })).kind, 'error');
  assert.equal((await command.handler({ rawInput: 'ok', agent: owner })).kind, 'success');
  assert.deepEqual(f.calls.map(call => call[0]), ['remove', 'install']);
  assert.equal(f.calls[1][2].saveExact, true);
  assert.equal(f.bundles[0].source, 'plugin@2.0.0');
  latest = '3.0.0';
  const next = await command.handler({ rawInput: 'update plugin', agent: owner });
  assert.equal(next.kind, 'error');
  assert.match(next.text, /--allow-pinned/);
  assert.deepEqual(f.calls.map(call => call[0]), ['remove', 'install']);
  await f.updater.dispose();
});

test('pinned authorization is scoped to the current target and cannot skip confirmation', async () => {
  let latest = '2.0.0';
  const client = { async get() { return { name: 'plugin', 'dist-tags': { latest }, versions: { [latest]: { name: 'plugin', version: latest, dsh: { bundle: {} } } } }; } };
  const f = fixture({ providers: createProviders(), client });
  f.bundles = [{ ...f.bundles[0], source: 'plugin@1.0.0' }];
  const command = createUpdaterCommand(f.updater);
  const owner = {};
  assert.equal((await command.handler({ rawInput: 'update plugin --allow-pinned --accept-removal-risk', agent: owner })).kind, 'error');
  assert.equal((await command.handler({ rawInput: 'update plugin --allow-pinned --allow-pinned', agent: owner })).kind, 'error');
  assert.equal((await command.handler({ rawInput: 'update plugin --allow-pinned', agent: owner })).kind, 'success');
  latest = '3.0.0';
  const changed = await command.handler({ rawInput: 'ok', agent: owner });
  assert.equal(changed.kind, 'success');
  assert.match(changed.text, /plugin@3\.0\.0/);
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('repeating a pinned update must retain its one-time authorization', async () => {
  const client = { async get() { return { name: 'plugin', 'dist-tags': { latest: '2.0.0' }, versions: { '2.0.0': { name: 'plugin', version: '2.0.0', dsh: { bundle: {} } } } }; } };
  const f = fixture({ providers: createProviders(), client });
  f.bundles = [{ ...f.bundles[0], source: 'plugin@1.0.0' }];
  const command = createUpdaterCommand(f.updater);
  assert.equal((await command.handler({ rawInput: 'update plugin --allow-pinned' })).kind, 'success');
  assert.equal((await command.handler({ rawInput: 'update plugin' })).kind, 'error');
  assert.equal((await command.handler({ rawInput: 'ok' })).kind, 'error');
  assert.deepEqual(f.calls, []);
  assert.equal((await command.handler({ rawInput: 'update plugin --allow-pinned' })).kind, 'success');
  assert.equal((await command.handler({ rawInput: 'update plugin --allow-pinned' })).kind, 'success');
  assert.deepEqual(f.calls.map(call => call[0]), ['remove', 'install']);
  await f.updater.dispose();
});

function pinnedGitFixture(options = {}) {
  const baseline = 'a'.repeat(40);
  let revision = baseline;
  let candidate = 'b'.repeat(40);
  const requests = [];
  const client = { async get(url) { requests.push(url); return { sha: candidate, commit: { sha: candidate } }; } };
  const f = fixture({ providers: createProviders(), client, currentRevision: async () => revision, ...options });
  f.bundles = [{ ...f.bundles[0], source: `github:owner/repo#${baseline}` }];
  const bundle = f.bundles[0];
  f.manager.installBundle = async (spec, settings) => {
    f.calls.push(['install', spec, settings]);
    revision = spec.split('#')[1];
    f.bundles = [{ ...bundle, source: spec, version: '1.0.0', enabled: settings.enabled }];
    return { application: 'applied', bundle: 'plugin', version: '1.0.0' };
  };
  return Object.assign(f, { baseline, requests, setRevision(value) { revision = value; }, setCandidate(value) { candidate = value; } });
}

test('one-time authorization previews an exact Git commit and preserves recovery', async () => {
  const f = pinnedGitFixture();
  const [result] = await f.updater.check('plugin');
  assert.equal(f.requests[0], 'https://api.github.com/repos/owner/repo/commits/HEAD');
  assert.equal(result.status, 'pinned');
  assert.equal(result.candidate.spec, `github:owner/repo#${'b'.repeat(40)}`);
  const preview = await createUpdaterCommand(f.updater).handler({ rawInput: 'check plugin --lang zh' });
  assert.match(preview.text, /HEAD（仓库默认分支）/);
  assert.match(preview.text, /提交 a{12} -> b{12}/);
  assert.throws(() => f.updater.prepare(result));
  const plan = f.updater.prepare(result, true);
  assert.deepEqual(f.calls, []);
  assert.equal(plan.candidate.revision, 'b'.repeat(40));
  assert.equal(plan.candidate.version, undefined);
  const applied = await f.updater.apply(plan.id, true);
  assert.equal(applied.status, 'updated');
  assert.equal(f.calls[1][1], `github:owner/repo#${'b'.repeat(40)}`);
  assert.equal(f.calls[1][2].saveExact, true);
  assert.equal(f.calls[1][2].enabled, false);
  assert.equal(applied.recovery.spec, `github:owner/repo#${f.baseline}`);
  await f.updater.dispose();
});

test('pinned Git checks use configured and temporary refs in order', async () => {
  const overrides = { plugin: { kind: 'github-source', repository: 'owner/repo', ref: 'configured' } };
  const f = pinnedGitFixture({ overrides });
  const [configured] = await f.updater.check('plugin');
  assert.match(f.requests.at(-1), /\/commits\/configured$/);
  assert.equal(configured.status, 'pinned');
  const [temporary] = await f.updater.check('plugin', undefined, 'feature/topic');
  assert.match(f.requests.at(-1), /\/branches\/feature%2Ftopic$/);
  assert.equal(temporary.status, 'pinned');
  const plan = f.updater.prepare(temporary, true, 'feature/topic');
  assert.equal(plan.candidate.spec, `github:owner/repo#${'b'.repeat(40)}`);
  await f.updater.check('plugin');
  assert.match(f.requests.at(-1), /\/commits\/configured$/);
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('an explicit Git branch never falls back to a tag or default ref', async () => {
  const calls = [];
  const f = pinnedGitFixture({ client: { async get(url) { calls.push(url); throw new Error('Branch not found'); } } });
  const [result] = await f.updater.check('plugin', undefined, 'release');
  assert.equal(result.status, 'error');
  assert.deepEqual(calls, ['https://api.github.com/repos/owner/repo/branches/release']);
  assert.throws(() => f.updater.prepare(result, true, 'release'));
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('pinned Git requires a different candidate and a consistent baseline', async () => {
  const f = pinnedGitFixture();
  f.setCandidate(f.baseline.toUpperCase());
  const [current] = await f.updater.check('plugin');
  assert.equal(current.status, 'current');
  assert.throws(() => f.updater.prepare(current, true));
  f.setCandidate('b'.repeat(40));
  f.setRevision('c'.repeat(40));
  const [conflicting] = await f.updater.check('plugin');
  assert.throws(() => f.updater.prepare(conflicting, true));
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('mismatched lockfile identities cannot authorize a pinned Git update', async () => {
  const pin = 'a'.repeat(40);
  for (const specifier of [`github:owner/repo#${'b'.repeat(40)}`, `github:other/repo#${pin}`]) {
    const lock = { importers: { '.': { dependencies: { plugin: { specifier, version: `github.com/owner/repo/${pin}` } } } } };
    const f = pinnedGitFixture({ currentRevision: async bundle => lockedRevision(lock, bundle) ?? null });
    const [result] = await f.updater.check('plugin');
    assert.equal(result.status, 'unknown');
    assert.throws(() => f.updater.prepare(result, true));
    assert.deepEqual(f.calls, []);
    await f.updater.dispose();
  }
});

test('one-time Git authorization rejects forged identities and baselines', async () => {
  const f = pinnedGitFixture();
  const [result] = await f.updater.check('plugin');
  const sha = 'b'.repeat(40);
  for (const invalid of [
    { ...result, source: { ...result.source, currentRevision: undefined } },
    { ...result, source: { ...result.source, currentRevision: 'c'.repeat(40) } },
    { ...result, source: { ...result.source, repository: 'attacker/repo' } },
    { ...result, source: { ...result.source, baseSpec: 'github:attacker/repo' } },
    { ...result, status: 'update-available', source: { ...result.source, pinned: false } },
    { ...result, bundle: { ...result.bundle, source: 'github:owner/repo#v1.0.0' } },
    { ...result, candidate: { ...result.candidate, revision: f.baseline, spec: `github:owner/repo#${f.baseline}` } },
    { ...result, candidate: { ...result.candidate, revision: 'short' } },
    { ...result, candidate: { ...result.candidate, spec: `github:attacker/repo#${sha}` } },
    { ...result, candidate: { ...result.candidate, spec: `github:owner/repo#${'c'.repeat(40)}` } },
  ]) assert.throws(() => f.updater.prepare(invalid, true));
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('a pinned Git tag and the updater itself cannot use one-time authorization', async () => {
  for (const [name, ref] of [['plugin', 'v1.0.0'], ['dsh-better-plugin-updater', 'a'.repeat(40)]]) {
    const f = pinnedGitFixture();
    f.bundles = [{ ...f.bundles[0], name, source: `github:owner/repo#${ref}` }];
    const [result] = await f.updater.check(name);
    assert.throws(() => f.updater.prepare(result, true));
    assert.equal((await createUpdaterCommand(f.updater).handler({ rawInput: `update ${name} --allow-pinned` })).kind, 'error');
    assert.deepEqual(f.calls, []);
    await f.updater.dispose();
  }
});

test('temporary Git branch does not authorize a pinned tag', async () => {
  const f = pinnedGitFixture();
  f.bundles = [{ ...f.bundles[0], source: 'github:owner/repo#v1.0.0' }];
  const command = createUpdaterCommand(f.updater);
  for (const rawInput of ['update plugin --git-branch main', 'update plugin --allow-pinned --git-branch main', 'update plugin --git-branch main --accept-removal-risk']) {
    assert.equal((await command.handler({ rawInput })).kind, 'error');
    assert.deepEqual(f.calls, []);
  }
  await f.updater.dispose();
});

test('a configured tracking ref retains its existing behavior for a tagged source', async () => {
  const f = pinnedGitFixture({ overrides: { plugin: { kind: 'github-source', repository: 'owner/repo', ref: 'main' } } });
  f.bundles = [{ ...f.bundles[0], source: 'github:owner/repo#v1.0.0' }];
  const [result] = await f.updater.check('plugin');
  assert.equal(result.status, 'update-available');
  assert.equal(result.source.pinned, false);
  assert.equal(f.updater.prepare(result).candidate.revision, 'b'.repeat(40));
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('pinned Git commands isolate confirmations and require renewed approval for changed refs and commits', async () => {
  const f = pinnedGitFixture();
  const command = createUpdaterCommand(f.updater);
  const owner = {}, other = {};
  assert.equal((await command.handler({ rawInput: 'update plugin', agent: owner })).kind, 'error');
  assert.equal((await command.handler({ rawInput: 'update plugin --allow-pinned --accept-removal-risk', agent: owner })).kind, 'error');
  const first = await command.handler({ rawInput: 'update plugin --allow-pinned --git-branch main', agent: owner });
  assert.equal(first.kind, 'success');
  assert.ok(first.text.includes(`github:owner/repo#${'b'.repeat(40)}`));
  assert.match(first.text, /Tracked Git ref: main/);
  assert.match(first.text, /not necessarily newer/);
  assert.equal((await command.handler({ rawInput: 'ok', agent: other })).kind, 'error');
  const branch = await command.handler({ rawInput: 'update plugin --allow-pinned --git-branch release', agent: owner });
  assert.equal(branch.kind, 'success');
  assert.deepEqual(f.calls, []);
  f.setCandidate('c'.repeat(40));
  const changed = await command.handler({ rawInput: 'ok', agent: owner });
  assert.equal(changed.kind, 'success');
  assert.ok(changed.text.includes(`github:owner/repo#${'c'.repeat(40)}`));
  assert.match(f.requests.at(-1), /\/branches\/release$/);
  assert.deepEqual(f.calls, []);
  assert.equal((await command.handler({ rawInput: 'ok', agent: owner })).kind, 'success');
  assert.deepEqual(f.calls.map(call => call[0]), ['remove', 'install']);
  assert.equal(f.calls[1][1], `github:owner/repo#${'c'.repeat(40)}`);
  f.setCandidate('d'.repeat(40));
  assert.equal((await command.handler({ rawInput: 'update plugin', agent: owner })).kind, 'error');
  assert.deepEqual(f.calls.map(call => call[0]), ['remove', 'install']);
  await f.updater.dispose();
});

test('changing the configured Git ref invalidates a pending confirmation', async () => {
  const overrides = { plugin: { kind: 'github-source', repository: 'owner/repo', ref: 'main' } };
  const f = pinnedGitFixture({ overrides });
  const command = createUpdaterCommand(f.updater), agent = {};
  assert.equal((await command.handler({ rawInput: 'update plugin --allow-pinned', agent })).kind, 'success');
  overrides.plugin.ref = 'release';
  assert.equal((await command.handler({ rawInput: 'ok', agent })).kind, 'success');
  assert.match(f.requests.at(-1), /\/commits\/release$/);
  assert.deepEqual(f.calls, []);
  assert.equal((await command.handler({ rawInput: 'ok', agent })).kind, 'success');
  assert.deepEqual(f.calls.map(call => call[0]), ['remove', 'install']);
  await f.updater.dispose();
});

test('a changed pinned Git baseline cannot use a pending confirmation', async () => {
  const f = pinnedGitFixture();
  const command = createUpdaterCommand(f.updater), agent = {};
  assert.equal((await command.handler({ rawInput: 'update plugin --allow-pinned', agent })).kind, 'success');
  f.setRevision('c'.repeat(40));
  await command.handler({ rawInput: 'ok', agent });
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('batch authorization keeps mixed source targets exact and scoped to its confirmation', async () => {
  const baseline = 'a'.repeat(40), next = 'b'.repeat(40);
  let bundles = [
    { name: 'git-one', source: `github:owner/one#${baseline}` },
    { name: 'git-two', source: `github:owner/two#${baseline}` },
    { name: 'npm-plugin', source: 'npm-plugin@^1.0.0' },
  ].map(bundle => ({ ...bundle, version: '1.0.0', enabled: true, installed: true, removable: true, availability: 'profile' }));
  const calls = [];
  const manager = {
    async listBundles() { return structuredClone(bundles); },
    async registries() { return { resolved: 'https://registry.test/' }; },
    async removeBundle(name) { calls.push(['remove', name]); bundles = bundles.filter(bundle => bundle.name !== name); return { application: 'applied' }; },
    async installBundle(spec, settings) {
      calls.push(['install', spec]);
      const name = spec.includes('/one#') ? 'git-one' : spec.includes('/two#') ? 'git-two' : 'npm-plugin';
      bundles.push({ name, source: spec, version: name === 'npm-plugin' ? '2.0.0' : '1.0.0', enabled: settings.enabled, installed: true, removable: true, availability: 'profile' });
      return { application: 'applied', bundle: name };
    },
  };
  const client = { async get(url) {
    if (url.startsWith('https://registry.test/')) return { name: 'npm-plugin', 'dist-tags': { latest: '2.0.0' }, versions: { '2.0.0': { name: 'npm-plugin', version: '2.0.0', dsh: { bundle: {} } } } };
    return { sha: next, commit: { sha: next } };
  } };
  const updater = new Updater({ manager, client, providers: createProviders(), currentRevision: async bundle => bundle.source.split('#')[1] });
  const command = createUpdaterCommand(updater), owner = {}, other = {};
  const preview = await command.handler({ rawInput: 'update * --allow-pinned --git-branch main', agent: owner });
  assert.equal(preview.kind, 'success');
  for (const spec of [`github:owner/one#${next}`, `github:owner/two#${next}`, 'npm-plugin@2.0.0']) assert.ok(preview.text.includes(spec));
  assert.equal((await command.handler({ rawInput: 'ok', agent: other })).kind, 'error');
  assert.deepEqual(calls, []);
  assert.equal((await command.handler({ rawInput: 'confirm', agent: owner })).kind, 'success');
  assert.deepEqual(calls.filter(call => call[0] === 'install').map(call => call[1]).sort(), [`github:owner/one#${next}`, `github:owner/two#${next}`, 'npm-plugin@2.0.0'].sort());
  await updater.dispose();
});

test('pinned Git installation failure retains an exact recovery target', async () => {
  const f = pinnedGitFixture();
  const [checked] = await f.updater.check('plugin');
  const plan = f.updater.prepare(checked, true);
  f.manager.installBundle = async (spec, settings) => { f.calls.push(['install', spec, settings]); return { application: 'failed' }; };
  const result = await f.updater.apply(plan.id, true);
  assert.equal(result.status, 'failed');
  assert.equal(result.recovery.spec, `github:owner/repo#${f.baseline}`);
  assert.equal(f.calls[1][1], `github:owner/repo#${'b'.repeat(40)}`);
  await f.updater.dispose();
});

test('a different Git repository is never reported as the confirmed installation', async () => {
  const f = pinnedGitFixture();
  const original = f.bundles[0];
  const [checked] = await f.updater.check('plugin');
  const plan = f.updater.prepare(checked, true);
  f.manager.installBundle = async (_spec, settings) => {
    f.setRevision('b'.repeat(40));
    f.bundles = [{ ...original, source: `github:attacker/repo#${'b'.repeat(40)}`, enabled: settings.enabled }];
    return { application: 'applied', bundle: 'plugin' };
  };
  const result = await f.updater.apply(plan.id, true);
  assert.equal(result.status, 'failed');
  assert.equal(result.recovery.spec, `github:owner/repo#${f.baseline}`);
  await f.updater.dispose();
});

test('the read-only tool cannot authorize or apply a pinned Git update', async () => {
  const f = pinnedGitFixture();
  const tool = createUpdaterTool(f.updater), signal = new AbortController().signal;
  const checked = JSON.parse(await tool.execute({ action: 'check', target: 'plugin' }, { signal }));
  assert.equal(checked[0].status, 'pinned');
  for (const args of [
    { action: 'update', target: 'plugin' },
    { action: 'check', target: 'plugin', allowPinned: true },
    { action: 'check', target: 'plugin', gitBranch: 'main' },
  ]) await assert.rejects(tool.execute(args, { signal }));
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('protected, installation and official-target bundles are not checked', async () => {
  const f = fixture();
  const base = f.bundles[0];
  f.bundles = [
    { ...base, name: 'official', installTarget: { spec: 'official@2', version: '2' } },
    { ...base, name: 'shipped', availability: 'installation', installed: false },
    { ...base, name: 'protected', removable: false },
    { ...base, name: 'absent', installed: false, availability: 'missing' },
  ];
  const results = await f.updater.check();
  assert.equal(results.every(result => result.status === 'skipped'), true);
  await assert.rejects(prepare(f.updater, 'official'));
  await assert.rejects(f.updater.check('not-present'));
  assert.deepEqual(f.calls, []);
});

test('skip reasons distinguish shipped, catalog and uninstalled bundles', async () => {
  const f = fixture();
  const base = f.bundles[0];
  f.bundles = [
    { ...base, name: 'shipped', availability: 'installation', installed: false, installTarget: { spec: 'shipped@2', version: '2' } },
    { ...base, name: 'catalog', availability: 'missing', installed: false, installTarget: { spec: 'catalog@2', version: '2' } },
    { ...base, name: 'unreadable', availability: 'missing', installed: true },
    { ...base, name: 'undeclared', availability: 'profile', installed: false },
  ];
  const results = await f.updater.check();
  assert.deepEqual(results.map(result => result.detail?.key),
    ['msg.provided', 'msg.official', 'msg.filesUnavailable', 'msg.unavailable']);
  assert.deepEqual(f.calls, []);
});

test('self checks supported npm and GitHub sources without creating update plans', async () => {
  const name = 'dsh-better-plugin-updater';
  const next = 'a'.repeat(40);
  const requests = [];
  const client = { async get(url) {
    requests.push(url);
    if (url.startsWith('https://registry.test/')) return { name, 'dist-tags': { latest: '2.0.0' }, versions: { '2.0.0': { name, version: '2.0.0', dsh: { bundle: {} } } } };
    return { sha: next };
  } };
  const f = fixture({ providers: createProviders(), client, currentRevision: async () => 'b'.repeat(40) });
  const base = { ...f.bundles[0], name };
  for (const [source, kind, candidate] of [
    [`${name}@^1.0.0`, 'npm', '2.0.0'],
    ['github:owner/repo#main', 'github-source', next],
  ]) {
    f.bundles = [{ ...base, source }];
    const before = requests.length;
    const [result] = await f.updater.check(name);
    assert.equal(result.status, 'update-available');
    assert.equal(result.source.kind, kind);
    assert.equal(result.candidate.version ?? result.candidate.revision, candidate);
    assert.ok(requests.length > before);
    assert.throws(() => f.updater.prepare(result));
    assert.throws(() => f.updater.prepare(result, true));
    assert.deepEqual(f.calls, []);
  }
  f.bundles = [{ ...base, source: `${name}@1.0.0` }];
  const [pinned] = await f.updater.check(name);
  assert.equal(pinned.status, 'pinned');
  assert.equal(pinned.candidate.version, '2.0.0');
  assert.throws(() => f.updater.prepare(pinned, true));
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('self read-only command and tool expose provider check results', async () => {
  const name = 'dsh-better-plugin-updater';
  const client = { async get() { return { name, 'dist-tags': { latest: '2.0.0' }, versions: { '2.0.0': { name, version: '2.0.0', dsh: { bundle: {} } } } }; } };
  const f = fixture({ providers: createProviders(), client });
  f.bundles = [{ ...f.bundles[0], name, source: `${name}@^1.0.0` }];
  const command = await createUpdaterCommand(f.updater).handler({ rawInput: `check ${name}` });
  assert.equal(command.kind, 'success');
  assert.match(command.text, /2\.0\.0/);
  assert.match(command.text, /cannot update itself/);
  assert.doesNotMatch(command.text, new RegExp(`/plugin-updater update ${name}`));
  const chinese = await createUpdaterCommand(f.updater).handler({ rawInput: `check ${name} --lang zh` });
  assert.match(chinese.text, /不能自行更新/);
  assert.doesNotMatch(chinese.text, new RegExp(`/plugin-updater update ${name}`));
  const tool = createUpdaterTool(f.updater);
  const results = JSON.parse(await tool.execute({ action: 'check', target: name }, { signal: new AbortController().signal }));
  assert.equal(results[0].status, 'update-available');
  assert.equal(results[0].candidate.version, '2.0.0');
  assert.match(results[0].message, /cannot update itself/);
  f.bundles = [{ ...f.bundles[0], source: `${name}@1.0.0` }];
  const pinned = await createUpdaterCommand(f.updater).handler({ rawInput: `check ${name}` });
  assert.match(pinned.text, /cannot update itself/);
  assert.doesNotMatch(pinned.text, /--allow-pinned/);
  const pinnedTool = JSON.parse(await tool.execute({ action: 'check', target: name }, { signal: new AbortController().signal }));
  assert.equal(pinnedTool[0].status, 'pinned');
  assert.match(pinnedTool[0].message, /cannot update itself/);
  assert.doesNotMatch(pinnedTool[0].message, /--allow-pinned/);
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('self plans are rejected even when passed a forged actionable check', async () => {
  const f = fixture();
  const [result] = await f.updater.check('plugin');
  const name = 'dsh-better-plugin-updater';
  const forged = { ...result, bundle: { ...result.bundle, name }, source: { ...result.source, packageName: name }, candidate: { ...result.candidate, spec: `${name}@2.0.0` } };
  assert.throws(() => f.updater.prepare(forged));
  assert.throws(() => f.updater.prepare(forged, true));
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('self checks local links as unsupported without contacting a provider', async () => {
  const f = fixture({ providers: createProviders() });
  f.bundles = [{ ...f.bundles[0], name: 'dsh-better-plugin-updater', source: 'link:/tmp/updater' }];
  const [result] = await f.updater.check();
  assert.equal(result.status, 'unsupported');
  assert.equal(result.source.kind, 'unsupported');
  assert.throws(() => f.updater.prepare(result));
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('self update commands cannot prepare or apply, even with risk and pin flags', async () => {
  const name = 'dsh-better-plugin-updater';
  const client = { async get() { return { name, 'dist-tags': { latest: '2.0.0' }, versions: { '2.0.0': { name, version: '2.0.0', dsh: { bundle: {} } } } }; } };
  for (const source of [`${name}@^1.0.0`, `${name}@1.0.0`]) {
    const f = fixture({ providers: createProviders(), client });
    f.bundles = [{ ...f.bundles[0], name, source }];
    const command = createUpdaterCommand(f.updater);
    const agent = {};
    for (const rawInput of [`update ${name}`, `update ${name} --accept-removal-risk`, `update ${name} --allow-pinned`, 'ok', 'confirm']) {
      assert.equal((await command.handler({ rawInput, agent })).kind, 'error', rawInput);
      assert.deepEqual(f.calls, []);
    }
    await f.updater.dispose();
  }
});

test('batch update never prepares or applies a self target', async () => {
  const name = 'dsh-better-plugin-updater';
  const client = { async get(url) {
    const packageName = url.endsWith(name) ? name : 'plugin';
    return { name: packageName, 'dist-tags': { latest: '2.0.0' }, versions: { '2.0.0': { name: packageName, version: '2.0.0', dsh: { bundle: {} } } } };
  } };
  for (const accept of [false, true]) {
    const f = fixture({ providers: createProviders(), client });
    f.bundles = [{ ...f.bundles[0], name, source: `${name}@^1.0.0` }, f.bundles[0]];
    const prepared = [];
    const preparePlan = f.updater.prepare.bind(f.updater);
    f.updater.prepare = (result, ...args) => { prepared.push(result.bundle.name); return preparePlan(result, ...args); };
    const command = createUpdaterCommand(f.updater);
    const agent = {};
    await command.handler({ rawInput: `update *${accept ? ' --accept-removal-risk' : ''}`, agent });
    if (!accept) await command.handler({ rawInput: 'ok', agent });
    assert.equal(prepared.includes(name), false);
    assert.equal(f.calls.some(call => call[0] === 'remove' && call[1] === name), false);
    assert.equal(f.calls.some(call => call[0] === 'install' && call[1].startsWith(`${name}@`)), false);
    assert.deepEqual(f.calls.map(call => call[0]), ['remove', 'install']);
    await f.updater.dispose();
  }
});

test('a failed, cancelled or overridden removal never proceeds to installation', async () => {
  for (const application of ['failed', 'cancelled', 'overridden']) {
    const f = fixture();
    const plan = await prepare(f.updater, 'plugin');
    f.manager.removeBundle = async () => ({ application, ...(application === 'failed' ? { error: { code: 'bundle-in-use' } } : {}) });
    const result = await f.updater.apply(plan.id, true);
    assert.equal(result.status, 'failed');
    assert.equal(result.installation, undefined);
    assert.equal(result.remaining.version, '1.0.0');
    assert.deepEqual(f.calls, []);
    await f.updater.dispose();
  }
});

test('removal requiring restart still installs the target and retains the restart requirement', async () => {
  for (const installationState of ['applied', 'restart-required']) {
    for (const enabled of [false, true]) {
      const f = fixture();
      f.bundles = [{ ...f.bundles[0], enabled }];
      const plan = await prepare(f.updater, 'plugin');
      const remove = f.manager.removeBundle;
      f.manager.removeBundle = async (...args) => ({ ...await remove(...args), application: 'restart-required', changed: true, restartReason: 'module-comparison' });
      const install = f.manager.installBundle;
      f.manager.installBundle = async (...args) => ({ ...await install(...args), application: installationState });
      const result = await f.updater.apply(plan.id, true);
      assert.deepEqual(f.calls.map(call => call[0]), ['remove', 'install']);
      assert.equal(f.calls[1][1], 'plugin@2.0.0');
      assert.equal(f.calls[1][2].enabled, enabled);
      assert.equal(result.status, 'restart-required');
      assert.equal(result.removal.restartReason, 'module-comparison');
      assert.equal(result.installation.application, installationState);
      assert.equal(result.remaining.version, '2.0.0');
      assert.equal(result.remaining.enabled, enabled);
      await f.updater.dispose();
    }
  }
});

test('installation failure after removal requiring restart stays failed with recovery', async () => {
  for (const behavior of ['failed', 'cancelled', 'throw', 'wrong-version']) {
    const f = fixture();
    const plan = await prepare(f.updater, 'plugin');
    const remove = f.manager.removeBundle;
    f.manager.removeBundle = async (...args) => ({ ...await remove(...args), application: 'restart-required', restartReason: 'module-comparison' });
    f.manager.installBundle = async () => {
      if (behavior === 'throw') throw new Error('Fixture installation failed.');
      if (behavior === 'wrong-version') {
        f.bundles = [{ name: 'plugin', source: 'plugin@3.0.0', version: '3.0.0', enabled: false, installed: true, removable: true, availability: 'profile' }];
        return { application: 'applied' };
      }
      return { application: behavior };
    };
    const result = await f.updater.apply(plan.id, true);
    assert.equal(result.status, 'failed');
    assert.equal(result.removal.restartReason, 'module-comparison');
    assert.equal(result.recovery.spec, 'plugin@1.0.0');
    assert.equal(result.remaining?.version, behavior === 'wrong-version' ? '3.0.0' : undefined);
    await f.updater.dispose();
  }
});

test('stop-profile follows the official install-over path and reports restart', async () => {
  const f = fixture();
  const plan = await prepare(f.updater, 'plugin');
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
    const plan = await prepare(f.updater, 'plugin');
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
  const plan = await prepare(f.updater, 'plugin');
  f.manager.installBundle = async (_spec, settings) => {
    f.bundles = [{ name: 'plugin', source: 'plugin@3.0.0', version: '3.0.0', enabled: settings.enabled, installed: true, removable: true, availability: 'profile' }];
    return { application: 'applied' };
  };
  assert.equal((await f.updater.apply(plan.id, true)).status, 'failed');
});

test('a second update cannot run concurrently and disposal waits for recovery-critical install', async () => {
  const f = fixture();
  const first = await prepare(f.updater, 'plugin');
  const second = await prepare(f.updater, 'plugin');
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
  const plan = await prepare(f.updater, 'plugin');
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
  const plan = await prepare(f.updater, 'plugin');
  revision = 'c'.repeat(40);
  await assert.rejects(f.updater.apply(plan.id, true), /stale/);
  assert.deepEqual(f.calls, []);
});

test('a failed provider is isolated from other checks and cannot create a plan', async () => {
  const f = fixture();
  f.provider.check = async () => { throw new Error('Fixture error.'); };
  const result = await f.updater.check();
  assert.equal(result[0].status, 'error');
  await assert.rejects(prepare(f.updater, 'plugin'), /Fixture error/);
  assert.deepEqual(f.calls, []);
});
