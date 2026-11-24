import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import semver from 'semver';

test('DSH compatibility starts at 0.2.3-alpha.1 and excludes all 0.3.0 versions', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { engines: { dsh: string } };
  const range = manifest.engines.dsh;
  for (const version of ['0.2.3-alpha.1', '0.2.3-alpha.2', '0.2.3', '0.2.4-alpha.1', '0.2.4', '0.2.99']) {
    assert.ok(semver.satisfies(version, range, { includePrerelease: true }), `${version} must be admitted`);
  }
  for (const version of ['0.2.2', '0.2.3-0', '0.2.3-alpha.0', '0.3.0-0', '0.3.0-alpha.1', '0.3.0']) {
    assert.equal(semver.satisfies(version, range, { includePrerelease: true }), false, `${version} must not be admitted`);
  }
});
