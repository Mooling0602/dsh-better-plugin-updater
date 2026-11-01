import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdaterCommand } from '../dist/commands.js';
import { createUpdaterTool } from '../dist/tools.js';

function fixture() {
  const calls = [];
  const bundles = [{ name: 'plugin', version: '1.0.0', source: 'plugin@^1', installed: true, enabled: true, removable: true, availability: 'profile' }];
  const checked = [{ bundle: bundles[0], source: { kind: 'unsupported', reason: 'Fixture reason.' }, status: 'unsupported', message: 'Fixture reason.' }];
  const plan = { id: 'id', createdAt: '2026-11-01T00:00:00Z', expiresAt: '2026-11-01T00:10:00Z', command: '/plugin-updater update id --accept-removal-risk',
    bundle: bundles[0], source: { kind: 'npm' }, candidate: { spec: 'plugin@2.0.0', version: '2.0.0' }, warnings: ['Recovery is manual.'] };
  const updater = {
    async list() { calls.push(['list']); return bundles; },
    async check(name, signal) { calls.push(['check', name, signal]); return checked; },
    async plan(name, signal) { calls.push(['plan', name, signal]); return plan; },
    async apply(id, accepted) { calls.push(['apply', id, accepted]); return { status: 'failed', message: 'Fixture failure.' }; },
  };
  return { calls, bundles, checked, plan, updater, command: createUpdaterCommand(updater), tool: createUpdaterTool(updater) };
}

test('command and tool consume identical data but use different presentation', async () => {
  const f = fixture();
  const signal = new AbortController().signal;
  const human = await f.command.handler({ rawInput: ' check plugin', signal });
  const machine = await f.tool.execute({ action: 'check', target: 'plugin' }, { signal });
  assert.equal(human.kind, 'success');
  assert.match(human.text, /Unsupported source/);
  assert.match(human.text, /plugin/);
  assert.throws(() => JSON.parse(human.text));
  assert.deepEqual(JSON.parse(machine), f.checked);
  assert.deepEqual(f.calls, [['check', 'plugin', signal], ['check', 'plugin', signal]]);
  assert.deepEqual(f.tool.output.render({}, machine), [{ type: 'text', text: machine }]);
});

test('bare command and explicit list read inventory; help does not touch the service', async () => {
  const f = fixture();
  assert.equal((await f.command.handler({ rawInput: '' })).text, (await f.command.handler({ rawInput: ' list ' })).text);
  assert.equal((await f.command.handler({ rawInput: 'help' })).kind, 'success');
  assert.deepEqual(f.calls, [['list'], ['list']]);
  const machine = await f.tool.execute({ action: 'list' }, { signal: new AbortController().signal });
  assert.deepEqual(JSON.parse(machine), f.bundles);
});

test('plan output preserves all risks and does not execute; model plan stays JSON', async () => {
  const f = fixture();
  const signal = new AbortController().signal;
  const result = await f.command.handler({ rawInput: ' plan plugin', signal });
  assert.equal(result.kind, 'success');
  assert.ok(result.text.includes(f.plan.command));
  assert.match(result.text, /Recovery is manual/);
  assert.deepEqual(f.calls, [['plan', 'plugin', signal]]);
  assert.deepEqual(JSON.parse(await f.tool.execute({ action: 'plan', target: 'plugin' }, { signal })), f.plan);
});

test('malformed forms never dispatch writes and all thrown failures are readable', async () => {
  const f = fixture();
  for (const rawInput of ['update id', 'update id --accept-removal-risk extra', 'plan', 'check plugin extra', 'list extra', 'help extra', 'unknown']) {
    const result = await f.command.handler({ rawInput });
    assert.equal(result.kind, 'error');
    assert.match(result.text, /Plugin updater/);
  }
  assert.deepEqual(f.calls, []);
  f.updater.plan = async () => { throw new Error('Plan is expired.'); };
  const failure = await f.command.handler({ rawInput: 'plan plugin' });
  assert.equal(failure.kind, 'error');
  assert.match(failure.text, /Operation could not be completed/);
  assert.match(failure.text, /Plan is expired/);
});

test('explicit update preserves failed status; read-only tool cannot apply', async () => {
  const f = fixture();
  const result = await f.command.handler({ rawInput: 'update id --accept-removal-risk' });
  assert.equal(result.kind, 'error');
  assert.match(result.text, /Update did not complete/);
  assert.deepEqual(f.calls, [['apply', 'id', true]]);
  await assert.rejects(f.tool.execute({ action: 'update', target: 'id' }, { signal: new AbortController().signal }));
  assert.deepEqual(f.calls, [['apply', 'id', true]]);
});
