import test from 'node:test';
import assert from 'node:assert/strict';
import { lockedRevision, readLockedRevision } from '../dist/core.js';

const sha = 'b'.repeat(40);
const bundle = { name: 'plugin', source: 'github:owner/repo#main' };
const lock = version => ({ importers: { '.': { dependencies: { plugin: { specifier: bundle.source, version } } } } });

test('lockfile reads only the matching root dependency revision', () => {
  for (const value of [`https://codeload.github.com/owner/repo/tar.gz/${sha}`, `github.com/owner/repo/${sha}`, `git+https://github.com/owner/repo.git#${sha}`]) {
    assert.equal(lockedRevision(lock(value), bundle), sha);
  }
  assert.equal(lockedRevision(lock(`github.com/other/repo/${sha}`), bundle), undefined);
  const stale = lock(`github.com/owner/repo/${sha}`);
  stale.importers['.'].dependencies.plugin.specifier = 'github:owner/repo#other';
  assert.equal(lockedRevision(stale, bundle), undefined);
  assert.equal(lockedRevision({ importers: { sub: lock(`github.com/owner/repo/${sha}`).importers['.'] } }, bundle), undefined);
});

test('matching resolution entries can carry a commit for the expected repository', () => {
  const value = lock('opaque-resolution');
  value.packages = { 'plugin@opaque-resolution': { resolution: { repo: 'git+https://github.com/owner/repo.git', commit: sha } } };
  assert.equal(lockedRevision(value, bundle), sha);
  value.packages['plugin@opaque-resolution'].resolution.repo = 'https://github.com/other/repo.git';
  assert.equal(lockedRevision(value, bundle), undefined);
});

test('missing lockfiles and arbitrary strings do not invent a baseline', async () => {
  assert.equal(await readLockedRevision('/nonexistent-dsh-updater-fixture', bundle), undefined);
  assert.equal(lockedRevision(lock(`some text ${sha}`), bundle), undefined);
  assert.equal(lockedRevision(null, bundle), undefined);
});
