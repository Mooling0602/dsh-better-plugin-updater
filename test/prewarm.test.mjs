import test from 'node:test';
import assert from 'node:assert/strict';
import { Updater, createProviders } from '../dist/core.js';
import { isPrewarmable, prewarm } from '../dist/prewarm.js';

function fixture(options = {}) {
  let bundles = [{ name: 'plugin', version: '1.0.0', source: 'plugin@^1.0.0', enabled: true, installed: true, removable: true, availability: 'profile' }];
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
  const npmProvider = { kind: 'npm', async check() { return { status: 'update-available', message: 'fixture', candidate: { spec: 'plugin@2.0.0', version: '2.0.0', registry: 'https://registry.test/' } }; } };
  const updater = new Updater({ manager, client: { async get() { throw new Error('No real network in prewarm tests.'); } },
    providers: [npmProvider], ...options });
  return { updater, manager, calls };
}

function recordingRunner(script) {
  const seen = [];
  const run = async (command, args, options) => {
    seen.push({ command, args: [...args], cwd: options.cwd });
    return script(command, [...args], options);
  };
  return { run, seen };
}
const storeAnswer = async (command, args) => args.includes('store')
  ? { exitCode: 0, output: '/profile/store/v3\n' }
  : { exitCode: 0, output: 'done' };

async function plan(updater) {
  return updater.prepare((await updater.check('plugin'))[0]);
}

test('a registry target is staged before removal, in the store the profile itself uses', async () => {
  const { run, seen } = recordingRunner(storeAnswer);
  const f = fixture({ prewarm: { profileDir: '/profile', run } });
  const prepared = await plan(f.updater);
  assert.deepEqual(f.calls, []);
  const result = await f.updater.apply(prepared.id, true);
  assert.equal(result.status, 'updated');
  assert.equal(seen[0].args.at(-1), 'path', 'the store is resolved from inside the profile first');
  assert.equal(seen[0].cwd, '/profile');
  const add = seen.at(-1);
  assert.equal(add.args.includes('add'), true);
  assert.equal(add.args.includes('plugin@2.0.0'), true, 'the exact confirmed target is staged, never a range');
  assert.equal(add.args.includes('--store-dir=/profile/store/v3'), true, 'the profile store is named explicitly');
  assert.equal(add.args.includes('--ignore-scripts'), true, 'staging never runs dependency scripts');
  assert.equal(add.cwd === '/profile', false, 'the warm project lives outside the profile');
  assert.deepEqual(f.calls.map(call => call[0]), ['remove', 'install']);
});

test('a failed staging run stops the update before the installed package is removed', async () => {
  const run = async (command, args) => args.includes('store') ? { exitCode: 0, output: '/s\n' } : { exitCode: 1, output: 'ERR_PNPM_FETCH_404  plugin@2.0.0' };
  const f = fixture({ prewarm: { profileDir: '/profile', run } });
  const prepared = await plan(f.updater);
  const result = await f.updater.apply(prepared.id, true);
  assert.equal(result.status, 'failed');
  assert.equal(result.detail.key, 'msg.prewarmFailed');
  assert.match(result.diagnostic, /ERR_PNPM_FETCH_404/);
  assert.deepEqual(f.calls, [], 'nothing was removed and nothing was installed');
  assert.equal(result.remaining.version, '1.0.0', 'the previous version is still installed');
});

test('an unresolvable store stops the update instead of staging into a store of its own', async () => {
  const run = async (command, args) => args.includes('store') ? { exitCode: 1, output: 'no store' } : { exitCode: 0, output: 'done' };
  const f = fixture({ prewarm: { profileDir: '/profile', run } });
  const prepared = await plan(f.updater);
  const result = await f.updater.apply(prepared.id, true);
  assert.equal(result.status, 'failed');
  assert.equal(result.detail.key, 'msg.prewarmStore');
  assert.deepEqual(f.calls, []);
});

test('the profile registry configuration reaches the warm run', async () => {
  const { run, seen } = recordingRunner(storeAnswer);
  const f = fixture({ prewarm: { profileDir: '/profile', run } });
  const prepared = await plan(f.updater);
  await f.updater.apply(prepared.id, true);
  const add = seen.at(-1);
  assert.equal(add.args.some(arg => arg.startsWith('--registry=')), true);
  assert.equal(add.args.some(arg => arg.startsWith('--userconfig=')), false, 'no npmrc means no override is invented');
});

test('a scoped registry and token from the profile npmrc reach the warm run', async () => {
  const { mkdtemp, readFile, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const profile = await mkdtemp(join(tmpdir(), 'prewarm-profile-'));
  await writeFile(join(profile, '.npmrc'), '@scope:registry=https://registry.test/\n//registry.test/:_authToken=fixture\n');
  let copied;
  const run = async (command, args, options) => {
    if (args.includes('store')) return { exitCode: 0, output: '/s\n' };
    const index = args.findIndex(arg => arg.startsWith('--userconfig='));
    if (index !== -1) copied = await readFile(args[index].slice('--userconfig='.length), 'utf8');
    return { exitCode: 0, output: 'done' };
  };
  const f = fixture({ prewarm: { profileDir: profile, run } });
  const prepared = await plan(f.updater);
  assert.equal((await f.updater.apply(prepared.id, true)).status, 'updated');
  assert.match(copied, /_authToken=fixture/, 'the warm run reads the same configuration the real install would read');
  assert.match(copied, /@scope:registry/, 'a scoped registry survives the move out of the profile');
  await rm(profile, { recursive: true, force: true });
});

test('the throwaway project is created under the temporary root that is supplied', async () => {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const tempRoot = await mkdtemp(join(tmpdir(), 'prewarm-root-'));
  const { run, seen } = recordingRunner(storeAnswer);
  const f = fixture({ prewarm: { profileDir: '/profile', tempRoot, run } });
  const prepared = await plan(f.updater);
  assert.equal((await f.updater.apply(prepared.id, true)).status, 'updated');
  assert.equal(seen.at(-1).cwd.startsWith(tempRoot), true, 'the caller decides where the throwaway project lives');
  await import('node:fs/promises').then(fs => fs.rm(tempRoot, { recursive: true, force: true }));
});

test('a github release target is reported as unsupported and never blocks removal', async () => {
  const provider = { kind: 'github-release', async check() { return { status: 'update-available', message: 'fixture',
    candidate: { spec: 'https://example.test/plugin.tgz', url: 'https://example.test/plugin.tgz', version: '2.0.0' } }; } };
  let bundles = [{ name: 'plugin', version: '1.0.0', source: 'https://github.com/Mooling0602/plugin/releases/download/v1.0.0/plugin-v1.0.0.tgz', enabled: true, installed: true, removable: true, availability: 'profile' }];
  const calls = [];
  const manager = {
    async listBundles() { return structuredClone(bundles); },
    async registries() { return { registry: null, resolved: 'https://registry.test/' }; },
    async removeBundle(name) { calls.push(['remove', name]); bundles = []; return { application: 'applied' }; },
    async installBundle(spec, settings) { calls.push(['install', spec]); bundles = [{ name: 'plugin', version: '2.0.0', source: spec, enabled: settings.enabled, installed: true, removable: true, availability: 'profile' }]; return { application: 'applied' }; },
  };
  const { run, seen } = recordingRunner(storeAnswer);
  const updater = new Updater({ manager, client: { async get() { throw new Error('no network'); } }, providers: [provider],
    prewarm: { profileDir: '/profile', run } });
  const prepared = await updater.prepare((await updater.check('plugin'))[0]);
  const result = await updater.apply(prepared.id, true);
  assert.equal(result.status, 'updated');
  assert.deepEqual(seen, [], 'a remote tarball is never staged, because a store cannot serve it');
  assert.deepEqual(calls.map(call => call[0]), ['remove', 'install']);
});

test('omitting staging keeps the update flow unchanged', async () => {
  const f = fixture();
  const prepared = await plan(f.updater);
  assert.equal((await f.updater.apply(prepared.id, true)).status, 'updated');
  assert.deepEqual(f.calls.map(call => call[0]), ['remove', 'install']);
});

test('only an exact registry target is prewarmable', () => {
  const registry = { kind: 'npm', packageName: 'plugin', registry: 'https://registry.test/', channel: 'latest', pinned: false };
  assert.equal(isPrewarmable(registry, { spec: 'plugin@2.0.0', version: '2.0.0', registry: 'https://registry.test/' }), true);
  assert.equal(isPrewarmable(registry, { spec: 'plugin@2.0.0', version: '2.0.0' }), false, 'a missing registry is not a reproducible install');
  assert.equal(isPrewarmable(registry, { spec: 'plugin@next', registry: 'https://registry.test/' }), false, 'a floating tag has no fixed bytes');
  assert.equal(isPrewarmable({ kind: 'github-source', baseSpec: 'github:a/b', repository: 'a/b', ref: 'HEAD' }, { spec: 'github:a/b#abc', revision: 'a'.repeat(40) }), false);
});

test('staging happens outside the profile and leaves no directory behind', async () => {
  const { run, seen } = recordingRunner(async (command, args, options) => {
    if (args.includes('store')) return { exitCode: 0, output: '/s\n' };
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(options.cwd);
    return { exitCode: entries.includes('package.json') ? 0 : 1, output: 'ok' };
  });
  const f = fixture({ prewarm: { profileDir: '/profile', run } });
  const prepared = await plan(f.updater);
  assert.equal((await f.updater.apply(prepared.id, true)).status, 'updated');
  const cwd = seen.at(-1).cwd;
  const { stat } = await import('node:fs/promises');
  await assert.rejects(() => stat(cwd), 'the throwaway project is removed after the run');
});

test('a staging failure reports the reason without pretending the update happened', async () => {
  const source = { kind: 'npm', packageName: 'plugin', registry: 'https://registry.test/', channel: 'latest', pinned: false };
  const result = await prewarm(source, { spec: 'plugin@2.0.0', version: '2.0.0', registry: 'https://registry.test/' }, '/profile',
    { run: async () => { throw new Error('spawn pnpm ENOENT'); } });
  assert.equal(result.status, 'failed');
  assert.match(result.diagnostic, /ENOENT/);
  assert.equal(result.detail.key, 'msg.prewarmFailed');
});

test('the plugin still loads without package-manager facts', async () => {
  const f = fixture();
  assert.equal((await f.updater.check('plugin'))[0].status, 'update-available');
  assert.equal(createProviders().length > 0, true);
});
