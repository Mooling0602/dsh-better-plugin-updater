import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubUi } from '../dist/github-ui.js';
import { Updater } from '../dist/updater.js';

const sha = '1'.repeat(40);
const next = '2'.repeat(40);
const gitBundle = { name: 'git-plugin', source: `github:owner/repo#${sha}`, version: '1.0.0', enabled: true, installed: true, removable: true, availability: 'profile' };
const npmBundle = { ...gitBundle, name: 'npm-plugin', source: 'npm-plugin@^1.0.0' };
const releaseBundle = { ...gitBundle, name: 'release-plugin', source: 'https://github.com/owner/repo/releases/download/v1.0.0/plugin-v1.0.0.tgz' };

function fixture() {
  let bundles = [gitBundle, npmBundle, releaseBundle];
  let checks = 0;
  const calls = [];
  const updater = new Updater({
    manager: {
      async listBundles() { return structuredClone(bundles); },
      async registries() { return { registry: 'https://registry.test/' }; },
      async removeBundle(name) { calls.push(['remove', name]); bundles = bundles.filter(bundle => bundle.name !== name); return { application: 'applied' }; },
      async installBundle(spec) { calls.push(['install', spec]); return { application: 'failed' }; },
    },
    client: { async get() { throw new Error('Unexpected network'); } },
    providers: [
      { kind: 'npm', async check() { throw new Error('npm must stay with the native UI'); } },
      { kind: 'github-release', async check() { return { status: 'update-available', message: 'new release', candidate: { spec: 'https://github.com/owner/repo/releases/download/v2.0.0/plugin-v2.0.0.tgz', url: 'https://github.com/owner/repo/releases/download/v2.0.0/plugin-v2.0.0.tgz', version: '2.0.0' } }; } },
      { kind: 'github-source', async check(bundle, source) {
        checks++;
        return { status: 'pinned', message: 'new revision', detail: { key: 'msg.gitPinnedUpdate', params: { name: bundle.name } }, candidate: { spec: `${source.baseSpec}#${next}`, revision: next } };
      } },
    ],
  });
  return { updater, ui: new GitHubUi(updater), calls, get checks() { return checks; }, set bundles(value) { bundles = value; } };
}

test('detail checks ignore npm and share the coordinator GitHub provider', async () => {
  const f = fixture();
  assert.equal(await f.ui.describe('npm-plugin'), undefined);
  assert.equal(await f.ui.check('npm-plugin'), undefined);
  assert.equal(f.checks, 0);
  assert.equal((await f.ui.describe('git-plugin')).repository, 'owner/repo');
  const checked = await f.ui.check('git-plugin');
  assert.equal(checked.result.status, 'pinned');
  assert.equal(checked.confirmation.plan.candidate.revision, next);
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('release attachments use the shared release provider and exact target plan', async () => {
  const f = fixture();
  assert.equal((await f.ui.describe('release-plugin')).kind, 'github-release');
  const checked = await f.ui.check('release-plugin');
  assert.equal(checked.result.status, 'update-available');
  assert.equal(checked.confirmation.plan.candidate.spec, 'https://github.com/owner/repo/releases/download/v2.0.0/plugin-v2.0.0.tgz');
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('rechecking a package invalidates its preceding confirmation', async () => {
  const f = fixture();
  const first = await f.ui.check('git-plugin');
  const second = await f.ui.check('git-plugin');
  assert.notEqual(first.confirmation.id, second.confirmation.id);
  await assert.rejects(f.ui.apply(first.confirmation.id, true), /missing or expired/);
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('a stale detail confirmation never removes a changed bundle', async () => {
  const f = fixture();
  const checked = await f.ui.check('git-plugin');
  f.bundles = [{ ...gitBundle, version: '1.0.1' }];
  await assert.rejects(f.ui.apply(checked.confirmation.id, true));
  assert.deepEqual(f.calls, []);
  await f.updater.dispose();
});

test('detail confirmation requires acknowledgement and is single use', async () => {
  const f = fixture();
  const checked = await f.ui.check('git-plugin');
  const id = checked.confirmation.id;
  await assert.rejects(f.ui.apply(id, false), /acknowledged/);
  assert.deepEqual(f.calls, []);
  const result = await f.ui.apply(id, true);
  assert.equal(result.status, 'failed');
  assert.deepEqual(f.calls, [['remove', 'git-plugin'], ['install', `github:owner/repo#${next}`]]);
  await assert.rejects(f.ui.apply(id, true), /missing or expired/);
  await f.updater.dispose();
});
