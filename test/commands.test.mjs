import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdaterCommand } from '../dist/commands.js';
import { createUpdaterTool } from '../dist/tools.js';

function fixture() {
  const calls = [];
  let bundles = ['plugin-a', 'plugin-b', '@scope/plugin-c'].map(name => ({ name, version: '1.0.0', source: `${name}@^1`, installed: true, enabled: true, removable: true, availability: 'profile' }));
  let version = '2.0.0';
  const updater = {
    async list() { calls.push(['list']); return structuredClone(bundles); },
    async check(name, signal) { calls.push(['check', name, signal]); return bundles.filter(b => !name || b.name === name).map(bundle => ({ bundle, source: { kind: 'npm', packageName: bundle.name, registry: 'https://registry.test/', channel: 'latest', pinned: false }, status: 'update-available', message: 'Update available.', candidate: { spec: `${bundle.name}@${version}`, version } })); },
    prepare(result) { return { id: result.bundle.name, bundle: result.bundle, source: result.source, candidate: result.candidate, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(), command: `/plugin-updater update ${result.bundle.name}`, warnings: ['Recovery is manual.'] }; },
    async apply(id, accepted) { calls.push(['apply', id, accepted]); return { status: 'updated', message: 'Fixture success.' }; },
  };
  return { updater, calls, command: createUpdaterCommand(updater), tool: createUpdaterTool(updater), setVersion(v) { version = v; }, setBundles(v) { bundles = v; }, get bundles() { return bundles; } };
}

test('list, help, check and read-only tool remain available', async () => {
  const f = fixture();
  assert.match((await f.command.handler({ rawInput: 'help' })).text, /Plugin updater/);
  assert.match((await f.command.handler({ rawInput: 'check plugin-a' })).text, /plugin-a/);
  assert.equal(JSON.parse(await f.tool.execute({ action: 'check', target: 'plugin-a' }, { signal: new AbortController().signal }))[0].status, 'update-available');
  await assert.rejects(f.tool.execute({ action: 'update', target: 'plugin-a' }, { signal: new AbortController().signal }));
});

test('wildcards and multiple arguments deduplicate; confirmation is agent-scoped and single-use', async () => {
  const f = fixture(), a = {}, b = {};
  const preview = await f.command.handler({ rawInput: 'update plugin-* plugin-a', agent: a });
  assert.match(preview.text, /plugin-a@2\.0\.0/);
  assert.match(preview.text, /plugin-b@2\.0\.0/);
  assert.equal(f.calls.filter(c => c[0] === 'apply').length, 0);
  assert.equal((await f.command.handler({ rawInput: 'confirm', agent: b })).kind, 'error');
  assert.equal((await f.command.handler({ rawInput: 'ok', agent: a })).kind, 'success');
  assert.deepEqual(f.calls.filter(c => c[0] === 'apply').map(c => c[1]), ['plugin-a', 'plugin-b']);
  assert.equal((await f.command.handler({ rawInput: 'ok', agent: a })).kind, 'error');
});

test('changed target or changed match set requires renewed confirmation', async () => {
  const f = fixture(), agent = {};
  await f.command.handler({ rawInput: 'update plugin-*', agent });
  f.setVersion('3.0.0');
  assert.match((await f.command.handler({ rawInput: 'confirm', agent })).text, /plugin-a@3\.0\.0/);
  assert.equal(f.calls.filter(c => c[0] === 'apply').length, 0);
  f.setBundles(f.bundles.filter(b => b.name !== 'plugin-b'));
  await f.command.handler({ rawInput: 'update plugin-*', agent });
  assert.equal(f.calls.filter(c => c[0] === 'apply').length, 0);
  await f.command.handler({ rawInput: 'update plugin-*', agent });
  assert.deepEqual(f.calls.filter(c => c[0] === 'apply').map(c => c[1]), ['plugin-a']);
});

test('risk flag applies immediately; unmatched patterns are reported', async () => {
  const f = fixture();
  const result = await f.command.handler({ rawInput: 'update @scope/plugin-? missing* --accept-removal-risk' });
  assert.equal(result.kind, 'success');
  assert.match(result.text, /missing\*/);
  assert.deepEqual(f.calls.filter(c => c[0] === 'apply').map(c => c[1]), ['@scope/plugin-c']);
});

test('removed plan action is rejected by commands and the tool without writes', async () => {
  const f = fixture();
  const signal = new AbortController().signal;
  for (const rawInput of ['plan', 'plan plugin-a', 'plan cancel']) {
    const result = await f.command.handler({ rawInput });
    assert.equal(result.kind, 'error');
    assert.doesNotMatch(result.text, /\/plugin-updater plan/);
  }
  assert.deepEqual(f.tool.parameters.properties.action.enum, ['list', 'check']);
  await assert.rejects(f.tool.execute({ action: 'plan', target: 'plugin-a' }, { signal }));
  assert.equal(f.calls.filter(c => c[0] === 'apply').length, 0);
});

test('a second confirmation cannot race an in-flight update', async () => {
  const f = fixture(), agent = {};
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  f.updater.apply = async () => { entered(); await gate; return { status: 'updated', message: 'done' }; };
  await f.command.handler({ rawInput: 'update plugin-a', agent });
  const running = f.command.handler({ rawInput: 'ok', agent });
  await started;
  assert.equal((await f.command.handler({ rawInput: 'confirm', agent })).kind, 'error');
  release();
  assert.equal((await running).kind, 'success');
});

test('invalid forms do not apply updates', async () => {
  const f = fixture();
  for (const rawInput of ['update', 'update --other', 'update plugin-a --accept-removal-risk --accept-removal-risk', 'confirm extra', 'check x extra', 'list extra', 'unknown']) assert.equal((await f.command.handler({ rawInput })).kind, 'error');
  assert.equal(f.calls.filter(c => c[0] === 'apply').length, 0);
});
