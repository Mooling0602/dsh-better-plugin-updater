import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviders } from '../dist/core.js';
import type { GithubSource, InstalledBundle, JsonClient, UpdateProvider } from '../dist/core.js';

const providers = Object.fromEntries(createProviders().map(provider => [provider.kind, provider])) as Record<UpdateProvider['kind'], UpdateProvider>;
const bundle: InstalledBundle = { name: 'plugin', version: '1.0.0', enabled: true, installed: true, removable: true, availability: 'profile' };
const client = (data: unknown): JsonClient => ({ async get() { return data; } });
interface NpmManifest { name: string; version: string; dsh?: { bundle: { patch: string } }; }
interface NpmMetadata { name: string; 'dist-tags': Record<string, string>; versions: Record<string, NpmManifest>; }
const manifest = (version: string): NpmManifest => ({ name: 'plugin', version, dsh: { bundle: { patch: 'cordis.patch.yml' } } });
const npmData = (version: string): NpmMetadata => ({ name: 'plugin', 'dist-tags': { latest: version }, versions: { [version]: manifest(version) } });
const npm = { kind: 'npm', packageName: 'plugin', channel: 'latest', registry: 'https://registry.test/', pinned: false } as const;
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

test('pinned npm versions report newer, current and unknown baselines without becoming actionable', async () => {
  const source = { ...npm, pinned: true };
  const newer = await providers.npm.check(bundle, source, client(npmData('2.0.0')));
  assert.equal(newer.status, 'pinned');
  assert.equal(newer.detail!.key, 'msg.npmPinnedUpdate');
  assert.equal(newer.detail!.params!.name, 'plugin');
  assert.equal(newer.candidate!.version, '2.0.0');
  for (const offered of ['1.0.0', '0.9.0']) {
    const current = await providers.npm.check(bundle, source, client(npmData(offered)));
    assert.equal(current.status, 'current');
    assert.equal(current.detail!.key, 'msg.npmPinnedCurrent');
    assert.equal(current.candidate!.version, offered);
  }
  const unknown = await providers.npm.check({ ...bundle, version: 'dev' }, source, client(npmData('2.0.0')));
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.detail!.key, 'msg.versionUnknown');
});

test('npm rejects wrong package identity, missing bundle and malformed metadata', async () => {
  const wrong = npmData('2.0.0');
  wrong.versions['2.0.0']!.name = 'other';
  await assert.rejects(providers.npm.check(bundle, npm, client(wrong)), /match/);
  const plain = npmData('2.0.0');
  delete plain.versions['2.0.0']!.dsh;
  await assert.rejects(providers.npm.check(bundle, npm, client(plain)));
  await assert.rejects(providers.npm.check(bundle, npm, client([])));
});

test('npm registry prefixes and scoped package encoding are preserved', async () => {
  let asked: string | undefined;
  await providers.npm.check({ ...bundle, name: '@scope/plugin' }, { ...npm, packageName: '@scope/plugin', registry: 'https://registry.test/prefix/' }, {
    async get(url) { asked = url; return { name: '@scope/plugin', 'dist-tags': { latest: '2.0.0' }, versions: { '2.0.0': { ...manifest('2.0.0'), name: '@scope/plugin' } } }; },
  });
  assert.equal(asked!, 'https://registry.test/prefix/%40scope%2Fplugin');
});

test('GitHub compares commits, not package versions, and preserves Git transport', async () => {
  const source: GithubSource = { kind: 'github-source', repository: 'owner/repo', ref: 'main', baseSpec: 'git@github.com:owner/repo.git', currentRevision: 'b'.repeat(40), pinned: false };
  const result = await providers['github-source'].check(bundle, source, client({ sha }));
  assert.equal(result.status, 'update-available');
  assert.equal(result.candidate!.spec, `${source.baseSpec}#${sha}`);
  assert.equal(result.candidate!.version, undefined);
  assert.equal((await providers['github-source'].check(bundle, { ...source, currentRevision: sha }, client({ sha }))).status, 'current');
  assert.equal((await providers['github-source'].check(bundle, { kind: source.kind, repository: source.repository, ref: source.ref, baseSpec: source.baseSpec, pinned: source.pinned }, client({ sha }))).status, 'unknown');
  assert.equal((await providers['github-source'].check(bundle, { ...source, pinned: true }, client({ sha }))).status, 'pinned');
  await assert.rejects(providers['github-source'].check(bundle, source, client({ sha: 'short' })));
  await assert.rejects(providers['github-source'].check(bundle, { ...source, ref: sha }, client({ sha: 'c'.repeat(40) })));
  const branch = await providers['github-source'].check(bundle, { ...source, ref: 'main' }, client({ sha: 'c'.repeat(40), commit: { sha } }), undefined, 'main');
  assert.equal(branch.candidate!.revision, sha);
});

interface ReleaseAsset { name: string; state: string; browser_download_url: string; }
interface ReleaseData { tag_name: string; draft: boolean; prerelease: boolean; assets: ReleaseAsset[]; }
const releaseSource = { kind: 'github-release', repository: 'owner/repo', assetTemplate: 'plugin-{tag}.tgz', pinned: false } as const;
function release(): ReleaseData { return { tag_name: 'v2.0.0', draft: false, prerelease: false, assets: [{ name: 'plugin-v2.0.0.tgz', state: 'uploaded', browser_download_url: 'https://github.com/owner/repo/releases/download/v2.0.0/plugin-v2.0.0.tgz' }] }; }

test('GitHub release selects one exact uploaded tarball and does not downgrade', async () => {
  const result = await providers['github-release'].check(bundle, releaseSource, client([release()]));
  assert.equal(result.status, 'update-available');
  assert.equal(result.candidate!.version, '2.0.0');
  assert.equal((await providers['github-release'].check({ ...bundle, version: '3.0.0' }, releaseSource, client([release()]))).status, 'current');
  assert.equal((await providers['github-release'].check(bundle, { ...releaseSource, assetTemplate: 'missing.tgz' }, client([release()]))).status, 'unsupported');
  const duplicate = release(); duplicate.assets.push(duplicate.assets[0]!);
  assert.equal((await providers['github-release'].check(bundle, releaseSource, client([duplicate]))).status, 'unsupported');
});

test('release data cannot redirect installation to another host, repo or tag', async () => {
  for (const url of ['https://attacker.test/plugin.tgz', 'https://github.com/attacker/repo/releases/download/v2.0.0/plugin-v2.0.0.tgz', 'https://github.com/owner/repo/releases/download/v9.0.0/plugin-v2.0.0.tgz']) {
    const data = release(); data.assets[0]!.browser_download_url = url;
    await assert.rejects(providers['github-release'].check(bundle, releaseSource, client([data])), /origin/);
  }
  const draft = release(); draft.draft = true;
  assert.equal((await providers['github-release'].check(bundle, releaseSource, client([draft]))).status, 'unsupported');
});

test('release scans pages and selects highest SemVer including prereleases, ignoring drafts and latest marker', async () => {
  const make = (tag: string, draft = false): ReleaseData => ({ tag_name: tag, draft, prerelease: tag.includes('-'), assets: [{ name: `plugin-${tag}.tgz`, state: 'uploaded', browser_download_url: `https://github.com/owner/repo/releases/download/${tag}/plugin-${tag}.tgz` }] });
  const asked: string[] = [];
  const result = await providers['github-release'].check({ ...bundle, version: '1.0.0-rc.1' }, releaseSource, {
    async get(url) { asked.push(url); return asked.length === 1 ? [make('v0.4.3'), make('v9.0.0', true), ...Array(98).fill(make('v0.1.0'))] : [make('v1.0.0-rc.2'), make('not-semver')]; },
  });
  assert.equal(result.status, 'update-available');
  assert.equal(result.candidate!.version, '1.0.0-rc.2');
  assert.equal(asked.length, 2);
  assert.match(asked[1]!, /page=2$/);
  const stable = await providers['github-release'].check(bundle, releaseSource, client([make('v2.0.0-rc.1'), make('v1.9.0')]));
  assert.equal(stable.candidate!.version, '2.0.0-rc.1');
  await assert.rejects(providers['github-release'].check(bundle, releaseSource, client(Array(100).fill(make('v1.0.0')))), /1,000/);
});
