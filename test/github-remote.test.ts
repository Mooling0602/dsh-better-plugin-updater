import test from 'node:test';
import assert from 'node:assert/strict';
import remote from '../dist/typert.remote-client.js';
import { GitHubRemote } from '../dist/github-remote.js';

type UiCall = readonly ['describe' | 'check', string] | readonly ['apply', string, boolean];

function service(principal: unknown): { instance: GitHubRemote; calls: UiCall[] } {
  const calls: UiCall[] = [];
  const instance = Object.assign(Object.create(GitHubRemote.prototype), {
    ctx: { invocation: principal === undefined ? undefined : { peer: { principal }, signal: new AbortController().signal } },
    ui: {
      async describe(name: string) { calls.push(['describe', name]); return undefined; },
      async check(name: string) { calls.push(['check', name]); return undefined; },
      async apply(id: string, accepted: boolean) { calls.push(['apply', id, accepted]); return { status: 'failed', message: 'Failed.' }; },
    },
  }) as GitHubRemote;
  return { instance, calls };
}

test('generated UI Remote requires typed exact argument envelopes', () => {
  const method = remote.methods['betterPluginUpdaterUi/apply'];
  const schema = method.input({ strict: true }).create();
  assert.doesNotThrow(() => schema.parse({ id: 'id', acceptRemovalRisk: true, language: 'en' }));
  assert.throws(() => schema.parse({ id: 'id', acceptRemovalRisk: true, language: 'en', extra: true }));
  assert.throws(() => schema.parse({ id: 'id', acceptRemovalRisk: 'true', language: 'en' }));
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
