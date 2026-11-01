import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviders } from '../dist/core.js';
const providers = Object.fromEntries(createProviders().map(provider => [provider.kind, provider]));
const bundle = { name: 'plugin', version: '1.0.0' };
const client = data => ({ async get() { return data; } });
const manifest = version => ({ name: 'plugin', version, dsh: { bundle: { patch: 'cordis.patch.yml' } } });
const npmData = version => ({ name: 'plugin', 'dist-tags': { latest: version }, versions: { [version]: manifest(version) } });
const npm = { kind: 'npm', packageName: 'plugin', channel: 'latest', registry: 'https://registry.test/', pinned: false };
const sha = 'a'.repeat(40);

test('npm uses SemVer, exact targets and the selected registry', async () => {
  const result = await providers.npm.check({ ...bundle, version: '1.9.0' }, npm, client(npmData('1.10.0')));
  assert.equal(result.status, 'update-available');
  assert.deepEqual(result.candidate, { spec: 'plugin@1.10.0', version: '1.10.0', registry: npm.registry });
  assert.equal((await providers.npm.check(bundle, npm, client(npmData('0.9.0')))).status, 'current');
  assert.equal((await providers.npm.check(bundle, { ...npm, pinned: true }, client(npmData('2.0.0')))).status, 'pinned');
  assert.equal((await providers.npm.check({ ...bundle, version: 'dev' }, npm, client(npmData('2.0.0')))).status, 'unknown');
  assert.equal((await providers.npm.check(bundle, npm, client(npmData('2.0.0-beta.1')))).status, 'unsupported');
});

test('npm rejects wrong package identity, missing bundle and malformed metadata', async () => {
  const wrong = npmData('2.0.0');
  wrong.versions['2.0.0'].name = 'other';
  await assert.rejects(providers.npm.check(bundle, npm, client(wrong)), /match/);
  const plain = npmData('2.0.0');
  delete plain.versions['2.0.0'].dsh;
  await assert.rejects(providers.npm.check(bundle, npm, client(plain)));
  await assert.rejects(providers.npm.check(bundle, npm, client([])));
});

test('npm registry prefixes and scoped package encoding are preserved', async () => {
  let asked;
  await providers.npm.check({ ...bundle, name: '@scope/plugin' }, { ...npm, packageName: '@scope/plugin', registry: 'https://registry.test/prefix/' }, {
    async get(url) { asked = url; return { name: '@scope/plugin', 'dist-tags': { latest: '2.0.0' }, versions: { '2.0.0': { ...manifest('2.0.0'), name: '@scope/plugin' } } }; },
  });
  assert.equal(asked, 'https://registry.test/prefix/%40scope%2Fplugin');
});

test('GitHub compares commits, not package versions, and preserves Git transport', async () => {
  const source = { kind: 'github-source', repository: 'owner/repo', ref: 'main', baseSpec: 'git@github.com:owner/repo.git', currentRevision: 'b'.repeat(40), pinned: false };
  const result = await providers['github-source'].check(bundle, source, client({ sha }));
  assert.equal(result.status, 'update-available');
  assert.equal(result.candidate.spec, `${source.baseSpec}#${sha}`);
  assert.equal(result.candidate.version, undefined);
  assert.equal((await providers['github-source'].check(bundle, { ...source, currentRevision: sha }, client({ sha }))).status, 'current');
  assert.equal((await providers['github-source'].check(bundle, { ...source, currentRevision: undefined }, client({ sha }))).status, 'unknown');
  assert.equal((await providers['github-source'].check(bundle, { ...source, pinned: true }, client({ sha }))).status, 'pinned');
  await assert.rejects(providers['github-source'].check(bundle, source, client({ sha: 'short' })));
});

const releaseSource = { kind: 'github-release', repository: 'owner/repo', assetTemplate: 'plugin-{tag}.tgz', pinned: false };
function release() { return { tag_name: 'v2.0.0', draft: false, prerelease: false, assets: [{ name: 'plugin-v2.0.0.tgz', state: 'uploaded', browser_download_url: 'https://github.com/owner/repo/releases/download/v2.0.0/plugin-v2.0.0.tgz' }] }; }

test('GitHub release selects one exact uploaded tarball and does not downgrade', async () => {
  const result = await providers['github-release'].check(bundle, releaseSource, client(release()));
  assert.equal(result.status, 'update-available');
  assert.equal(result.candidate.version, '2.0.0');
  assert.equal((await providers['github-release'].check({ ...bundle, version: '3.0.0' }, releaseSource, client(release()))).status, 'current');
  assert.equal((await providers['github-release'].check(bundle, { ...releaseSource, assetTemplate: 'missing.tgz' }, client(release()))).status, 'unsupported');
  const duplicate = release(); duplicate.assets.push(duplicate.assets[0]);
  assert.equal((await providers['github-release'].check(bundle, releaseSource, client(duplicate))).status, 'unsupported');
});

test('release data cannot redirect installation to another host, repo or tag', async () => {
  for (const url of ['https://attacker.test/plugin.tgz', 'https://github.com/attacker/repo/releases/download/v2.0.0/plugin-v2.0.0.tgz', 'https://github.com/owner/repo/releases/download/v9.0.0/plugin-v2.0.0.tgz']) {
    const data = release(); data.assets[0].browser_download_url = url;
    await assert.rejects(providers['github-release'].check(bundle, releaseSource, client(data)), /origin/);
  }
  const draft = release(); draft.draft = true;
  await assert.rejects(providers['github-release'].check(bundle, releaseSource, client(draft)), /stable/);
});
