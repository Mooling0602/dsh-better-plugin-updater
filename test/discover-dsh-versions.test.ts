import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { discoverDshVersions, loadDshMatrix } from '../.github/scripts/discover-dsh-versions.ts';

const manifest = { engines: { dsh: '>=0.2.3-alpha.1 <0.3.0' } };
const packument = (versions: string[]) => ({ versions: Object.fromEntries(versions.map(version => [version, {}])) });

test('returns every compatible version in semver order using DSH prerelease rules', () => {
  assert.deepEqual(discoverDshVersions(manifest, packument(['0.2.4-alpha.1', '0.2.3', '0.2.3-alpha.2', '0.3.0', '0.3.0-alpha.1', '0.2.3-alpha.1', '0.2.4', '0.2.3-alpha.0'])), ['0.2.3-alpha.1', '0.2.3-alpha.2', '0.2.3', '0.2.4-alpha.1', '0.2.4', '0.3.0-alpha.1']);
});

test('rejects invalid manifests, registry responses, unsafe versions and empty matches', () => {
  for (const input of [null, {}, { engines: { dsh: '' } }, { engines: { dsh: 'invalid' } }]) {
    assert.throws(() => discoverDshVersions(input, packument(['0.2.3'])));
  }
  for (const input of [null, {}, { versions: [] }, packument([]), packument(['0.2.3', '0.2.4;echo injected']), packument(['v0.2.3']), packument(['0.2.3-01']), packument(['0.3.0'])]) {
    assert.throws(() => discoverDshVersions(manifest, input));
  }
});

test('fails instead of truncating a matrix exceeding the GitHub Actions limit', () => {
  const versions = Array.from({ length: 257 }, (_, index) => `0.2.${index + 3}`);
  assert.throws(() => discoverDshVersions(manifest, packument(versions)), /limit of 256 jobs/);
});

test('loads a manifest and requests the npm packument without network access in the test', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-discovery-'));
  try {
    const path = join(directory, 'package.json');
    await writeFile(path, JSON.stringify(manifest));
    const mockFetch: typeof fetch = async (input, init) => {
      assert.equal(input, 'https://registry.npmjs.org/@deepseek-ai%2fdsh');
      assert.equal(new Headers(init?.headers).get('accept'), 'application/vnd.npm.install-v1+json');
      return new Response(JSON.stringify(packument(['0.2.3-alpha.2', '0.2.4'])));
    };
    assert.deepEqual(await loadDshMatrix(path, mockFetch), ['0.2.3-alpha.2', '0.2.4']);
    await assert.rejects(loadDshMatrix(path, async () => new Response('', { status: 503 })));
    await assert.rejects(loadDshMatrix(path, async () => { throw new Error('network failure'); }));
    await assert.rejects(loadDshMatrix(path, async () => new Response('invalid JSON')));
    await writeFile(path, 'invalid JSON');
    await assert.rejects(loadDshMatrix(path, mockFetch));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI writes only matrix JSON on success and exits nonzero on malformed input', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const directory = await mkdtemp(join(tmpdir(), 'dsh-discovery-cli-'));
  try {
    const path = join(directory, 'package.json');
    const preload = join(directory, 'fetch.mjs');
    await writeFile(path, JSON.stringify(manifest));
    await writeFile(preload, `globalThis.fetch = async () => new Response(${JSON.stringify(JSON.stringify(packument(['0.2.3-alpha.2'])))});`);
    const script = fileURLToPath(new URL('../.github/scripts/discover-dsh-versions.ts', import.meta.url));
    const run = promisify(execFile);
    const result = await run(process.execPath, ['--import', preload, script, path]);
    assert.equal(result.stdout, '["0.2.3-alpha.2"]\n');
    assert.equal(result.stderr, '');
    await writeFile(path, 'invalid JSON');
    await assert.rejects(run(process.execPath, ['--import', preload, script, path]), error => {
      assert.ok(error instanceof Error && 'code' in error && 'stdout' in error && 'stderr' in error);
      assert.equal(error.code, 1);
      assert.equal(error.stdout, '');
      assert.notEqual(error.stderr, '');
      return true;
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
