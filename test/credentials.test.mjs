import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGithubToken } from '../dist/credentials.js';
import { UpdaterError } from '../dist/errors.js';

const reference = 'FIXTURE_GITHUB_TOKEN';

test('without the optional Host service only the selected environment reference is read', async () => {
  const environment = { [reference]: 'fixture-environment-token', GITHUB_TOKEN: 'fixture-unrelated-token' };
  assert.equal(await resolveGithubToken(reference, undefined, environment), 'fixture-environment-token');
  assert.equal(await resolveGithubToken('MISSING', undefined, environment), undefined);
  assert.equal(await resolveGithubToken(reference, undefined, { [reference]: '' }), undefined);
  assert.equal(await resolveGithubToken('constructor', undefined, {}), undefined);
});

test('the Host provider is authoritative over the environment, including missing and removed values', async () => {
  const calls = [];
  let value = 'fixture-stored-token';
  const credentials = { async resolve(ref) { calls.push(ref); return value === undefined ? undefined : { value, source: 'file' }; } };
  const environment = { [reference]: 'fixture-stale-environment-token' };
  assert.equal(await resolveGithubToken(reference, credentials, environment), value);
  value = 'fixture-rotated-token';
  assert.equal(await resolveGithubToken(reference, credentials, environment), value);
  value = undefined;
  assert.equal(await resolveGithubToken(reference, credentials, environment), undefined);
  value = '';
  assert.equal(await resolveGithubToken(reference, credentials, environment), undefined);
  assert.deepEqual(calls, [reference, reference, reference, reference]);
});

test('provider failures and malformed values are sanitized and never fall back to the environment', async () => {
  for (const credentials of [
    { async resolve() { throw new Error('fixture-secret in YAML source'); } },
    { async resolve() { return { value: 123 }; } },
    {},
  ]) {
    await assert.rejects(resolveGithubToken(reference, credentials, { [reference]: 'fixture-environment-token' }), error => {
      assert.ok(error instanceof UpdaterError);
      assert.equal(error.detail.key, 'error.githubCredentials');
      assert.doesNotMatch(error.message, /fixture-|YAML source/);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
  let calls = 0;
  await assert.rejects(resolveGithubToken('not a reference', { async resolve() { calls++; } }), error => error.detail.key === 'error.githubCredentials');
  assert.equal(calls, 0);
});
