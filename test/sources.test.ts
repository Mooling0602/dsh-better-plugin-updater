import test from 'node:test';
import assert from 'node:assert/strict';
import { inferSource, githubRepository, releaseAttachment, normalizeRegistry } from '../dist/core.js';
import type { InstalledBundle, SourceContext, UpdateSource } from '../dist/types.js';

const bundle = (source: string, name = 'example-plugin'): InstalledBundle => ({ name, source, version: '1.0.0', installed: true, enabled: true, removable: true, availability: 'profile' });
const context: SourceContext = { registry: 'https://registry.npmjs.org/' };

function expectKind<Kind extends UpdateSource['kind']>(source: UpdateSource, kind: Kind): Extract<UpdateSource, { kind: Kind }> {
  assert.equal(source.kind, kind);
  if (source.kind !== kind) throw new Error(`expected ${kind}, received ${source.kind}`);
  return source as Extract<UpdateSource, { kind: Kind }>;
}
const sha = 'a'.repeat(40);

test('npm identities, scoped names, ranges, and exact pins', () => {
  assert.equal(expectKind(inferSource(bundle('example-plugin@^1.0.0'), context), 'npm').pinned, false);
  assert.equal(expectKind(inferSource(bundle('example-plugin@1.0.0'), context), 'npm').pinned, true);
  assert.equal(expectKind(inferSource(bundle('example-plugin@=1.0.0'), context), 'npm').pinned, true);
  assert.equal(expectKind(inferSource(bundle('example-plugin@1.0.0'), { ...context, override: { kind: 'npm', allowPinned: true } }), 'npm').pinned, false);
  assert.equal(expectKind(inferSource(bundle('@scope/plugin@latest', '@scope/plugin'), context), 'npm').packageName, '@scope/plugin');
  assert.equal(inferSource(bundle('example-plugin@npm:another@1'), context).kind, 'unsupported');
});

test('registry URLs preserve prefixes and reject embedded secrets', () => {
  assert.equal(normalizeRegistry('https://example.test/npm'), 'https://example.test/npm/');
  for (const url of ['http://example.test', 'https://u:p@example.test', 'https://example.test/?token=secret', 'https://example.test/#x']) {
    assert.throws(() => normalizeRegistry(url));
  }
});

test('GitHub source transport and refs are preserved', () => {
  for (const base of ['github:owner/repo', 'git@github.com:owner/repo.git', 'git+https://github.com/owner/repo.git', 'git+ssh://git@github.com/owner/repo.git']) {
    const source = expectKind(inferSource(bundle(`${base}#main`), { ...context, currentRevision: sha }), 'github-source');
    assert.equal(source.baseSpec, base);
    assert.equal(source.currentRevision, sha);
    assert.equal(source.pinned, false);
  }
  assert.equal(expectKind(inferSource(bundle(`github:owner/repo#${sha}`), context), 'github-source').pinned, true);
  assert.equal(expectKind(inferSource(bundle('github:owner/repo#v1.0.0'), context), 'github-source').pinned, true);
  assert.equal(expectKind(inferSource(bundle('github:owner/repo'), context), 'github-source').ref, 'HEAD');
});

test('unsupported hosts, selectors, locals, and source switches are refused', () => {
  for (const spec of ['link:/tmp/plugin', 'file:/tmp/plugin', 'git+https://other.test/owner/repo.git', 'github:owner/repo#semver:^1', 'github:owner/repo#main&path:/sub']) {
    assert.equal(inferSource(bundle(spec), context).kind, 'unsupported', spec);
  }
  assert.equal(githubRepository('https://token@github.com/owner/repo.git'), undefined);
  assert.equal(inferSource(bundle('github:owner/repo'), { ...context, override: { kind: 'github-source', repository: 'attacker/repo' } }).kind, 'unsupported');
  assert.equal(inferSource(bundle('example-plugin@latest'), { ...context, override: { kind: 'github-source', repository: 'owner/repo' } }).kind, 'unsupported');
});

test('release attachments infer exact templates, not arbitrary source archives', () => {
  const url = 'https://github.com/owner/repo/releases/download/v1.0.0/plugin-v1.0.0.tgz';
  const source = expectKind(inferSource(bundle(url), context), 'github-release');
  assert.equal(source.assetTemplate, 'plugin-{tag}.tgz');
  assert.equal(source.pinned, false);
  assert.equal(releaseAttachment('https://github.com/owner/repo/archive/v1.0.0.tar.gz'), undefined);
  assert.equal(releaseAttachment('https://github.com/owner/repo/releases/download/v1.0.0/a%2fb.tgz'), undefined);
  assert.equal(inferSource(bundle(url), { ...context, override: { kind: 'github-release', repository: 'attacker/repo', assetTemplate: 'x.tgz' } }).kind, 'unsupported');
});

test('reserved custom index sources are explicit, inert unsupported results', () => {
  const source = expectKind(inferSource(bundle('example-plugin@latest'), { ...context, override: { kind: 'index', url: 'https://index.test' } }), 'unsupported');
  assert.match(source.reason, /not implemented/);
});
