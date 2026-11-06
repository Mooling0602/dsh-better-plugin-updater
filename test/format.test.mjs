import test from 'node:test';
import assert from 'node:assert/strict';
import { formatApply, formatChecks, formatCommandError, formatInventory, formatUsage } from '../dist/format.js';

const bundle = { name: 'example-plugin', version: '1.0.0', source: 'example-plugin@^1.0.0', enabled: true, installed: true, removable: true, availability: 'profile' };
const source = { kind: 'npm', packageName: bundle.name, channel: 'latest', registry: 'https://registry.test/', pinned: false };
const candidate = { spec: 'example-plugin@2.0.0', version: '2.0.0', registry: source.registry };
const result = { bundle, source, candidate, status: 'update-available', message: 'A newer stable package version is available.' };

function notJson(value) { assert.throws(() => JSON.parse(value)); }

test('inventory is a compact grouped list, including disabled, missing and DSH-provided bundles', () => {
  const text = formatInventory([bundle,
    { ...bundle, name: 'local-plugin', source: 'link:/tmp/local', enabled: false },
    { ...bundle, name: 'official-plugin', availability: 'installation', installed: false },
    { ...bundle, name: 'missing-plugin', availability: 'missing', error: { code: 'missing-files' } },
  ]);
  assert.match(text, /2 installed in this profile, 1 provided by DSH, 1 missing or not installed/);
  assert.match(text, /- example-plugin v1\.0\.0 \(enabled, npm\)/);
  assert.match(text, /- local-plugin v1\.0\.0 \(disabled, local\)/);
  assert.match(text, /Provided by DSH \(1\)/);
  assert.match(text, /Problem: missing-files/);
  assert.doesNotMatch(text, /"availability"|"installed"/);
  notJson(text);
  assert.match(formatInventory([]), /No plugin bundles/);
});

test('check output prioritizes available updates and groups every result without losing failures', () => {
  const statuses = ['current', 'skipped', 'error', 'unknown', 'pinned', 'unsupported'];
  const text = formatChecks([...statuses.map(status => ({ ...result, bundle: { ...bundle, name: `${status}-plugin` }, status })), result]);
  assert.match(text, /Checked 7 plugin bundle\(s\)/);
  assert.ok(text.indexOf('Update available (1):') < text.indexOf('Check failed (1):'));
  assert.match(text, /example-plugin: v1\.0\.0 -> v2\.0\.0/);
  assert.match(text, /Update: \/plugin-updater update example-plugin/);
  assert.doesNotMatch(text, /\/plugin-updater plan/);
  for (const status of statuses) assert.ok(text.includes(`${status}-plugin`));
  assert.match(text, /Checking does not install or remove anything/);
  notJson(text);
  assert.match(formatChecks([]), /No plugin bundles to check/);
});

test('offered older versions are not displayed as a proposed downgrade', () => {
  const text = formatChecks([{ ...result, bundle: { ...bundle, version: '3.0.0' }, status: 'current' }]);
  assert.match(text, /v3\.0\.0; offered v2\.0\.0/);
  assert.doesNotMatch(text, /->|Review a plan/);
});

test('Git displays compact commit comparisons even when the manifest version is unchanged', () => {
  const revision = 'a'.repeat(40);
  const old = 'b'.repeat(40);
  const git = { kind: 'github-source', repository: 'owner/repo', ref: 'main', baseSpec: 'github:owner/repo', currentRevision: old, pinned: false };
  const offered = { spec: `github:owner/repo#${revision}`, revision };
  const text = formatChecks([{ ...result, source: git, candidate: offered }]);
  assert.match(text, /commit bbbbbbbbbbbb -> aaaaaaaaaaaa/);
  const current = formatChecks([{ ...result, source: { ...git, currentRevision: revision }, candidate: offered, status: 'current' }]);
  assert.doesNotMatch(current, /->/);
  assert.match(current, /commit aaaaaaaaaaaa/);
});

test('partial update failures preserve stage diagnostics, pending builds and manual recovery', () => {
  const text = formatApply({ status: 'failed', message: 'Installation did not complete.',
    removal: { application: 'applied' },
    installation: { application: 'failed', error: { code: 'build-blocked', diagnostic: 'Build step blocked.\nNo permission was granted.' }, pendingBuilds: ['example-build'] },
    recovery: { spec: 'example-plugin@1.0.0', registry: source.registry } });
  assert.match(text, /^Update did not complete/);
  assert.match(text, /Removal: completed/);
  assert.match(text, /Installation: failed/);
  assert.match(text, /build-blocked/);
  assert.match(text, /No permission was granted/);
  assert.match(text, /Build scripts awaiting approval: example-build/);
  assert.match(text, /No remaining package was confirmed/);
  assert.match(text, /Manual recovery target \(not executed\)/);
  assert.match(text, /example-plugin@1\.0\.0/);
  assert.doesNotMatch(text, /^Update completed/m);
  notJson(text);
});

test('restart-required and successful updates remain distinct, and success is not given a recovery recipe', () => {
  const restart = formatApply({ status: 'restart-required', message: 'Target installed.', remaining: bundle,
    installation: { application: 'restart-required', restartReason: 'runtime-loaded' } });
  assert.match(restart, /^Package installed; a DSH restart is required/);
  assert.match(restart, /Restart DSH yourself/);
  assert.match(restart, /Observed package: example-plugin v1\.0\.0 \(enabled\)/);
  const complete = formatApply({ status: 'updated', message: 'Target installed.', remaining: bundle, recovery: candidate });
  assert.match(complete, /^Update completed/);
  assert.doesNotMatch(complete, /Manual recovery target/);
});

test('unknown package state and readable errors never invent an absence or a rollback', () => {
  const text = formatApply({ status: 'failed', message: 'Readback failed.' });
  assert.match(text, /No remaining package was confirmed/);
  assert.doesNotMatch(text, /was removed|rolled back|not installed/);
  assert.match(formatCommandError(new Error('Plan is stale.')), /Plan is stale/);
  assert.match(formatCommandError(null), /Plugin update operation failed/);
  assert.match(formatUsage(), /--accept-removal-risk/);
  assert.match(formatUsage(), /help/);
});

test('single-line fields cannot inject fake rows with control characters', () => {
  const text = formatInventory([{ ...bundle, name: 'plugin\nFAKE\u001b' }]);
  assert.doesNotMatch(text, /\nFAKE|\u001b/);
  assert.match(text, /plugin FAKE/);
});
