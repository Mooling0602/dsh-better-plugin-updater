import test from 'node:test';
import assert from 'node:assert/strict';
import remote from '../dist/typert.remote-client.js';
import { GitHubRemote } from '../dist/github-remote.js';

function service(principal) {
  const calls = [];
  const instance = Object.create(GitHubRemote.prototype);
  instance.ctx = { invocation: principal === undefined ? undefined : { peer: { principal }, signal: new AbortController().signal } };
  instance.ui = {
    async describe(name) { calls.push(['describe', name]); return undefined; },
    async check(name) { calls.push(['check', name]); return undefined; },
    async apply(id, accepted) { calls.push(['apply', id, accepted]); return { status: 'failed', message: 'Failed.' }; },
  };
  return { instance, calls };
}

test('generated UI Remote requires typed exact argument envelopes', () => {
  const method = remote.methods['betterPluginUpdaterUi/apply'];
  const schema = method.input({ strict: true }).create();
  assert.equal(schema.safeParse({ id: 'id', acceptRemovalRisk: true, language: 'en' }).success, true);
  assert.equal(schema.safeParse({ id: 'id', acceptRemovalRisk: true, language: 'en', extra: true }).success, false);
  assert.equal(schema.safeParse({ id: 'id', acceptRemovalRisk: 'true', language: 'en' }).success, false);
});

test('Remote access rejects non-owner and missing invocation before backend calls', async () => {
  for (const principal of [undefined, { kind: 'guest' }]) {
    const f = service(principal);
    await assert.rejects(f.instance.describe('plugin'), /owner/);
    await assert.rejects(f.instance.check('plugin'), /owner/);
    await assert.rejects(f.instance.apply('e10150d5-a326-4fe2-9b26-cd514e55b5a5', true, 'en'), /owner/);
    assert.deepEqual(f.calls, []);
  }
});

test('owner Remote validates requests before delegating to the GitHub adapter', async () => {
  const f = service({ kind: 'owner' });
  assert.equal(await f.instance.describe('plugin'), 'null');
  assert.equal(await f.instance.check('plugin'), 'null');
  await assert.rejects(f.instance.check(''), /Invalid package/);
  await assert.rejects(f.instance.apply('bad', true, 'en'), /Invalid confirmation/);
  await assert.rejects(f.instance.apply('e10150d5-a326-4fe2-9b26-cd514e55b5a5', true, 'xx'), /Invalid presentation/);
  assert.deepEqual(f.calls, [['describe', 'plugin'], ['check', 'plugin']]);
});
