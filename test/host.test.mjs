import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ScheduledUpdates } from '../dist/scheduled.js';
import * as plugin from '../dist/index.js';

function host() {
  const ctx = new Context();
  const commands = new Map();
  const tools = new Map();
  let writes = 0;
  ctx.provide('pluginManager', {
    async listBundles() { return []; },
    async registries() { return { registry: 'https://registry.test/' }; },
    async removeBundle() { writes++; throw new Error('Unexpected real update.'); },
    async installBundle() { writes++; throw new Error('Unexpected real update.'); },
  });
  ctx.provide('profileContext', { dir: '/nonexistent-updater-fixture' });
  ctx.provide('commands', { register(definition) { commands.set(definition.name, definition); return () => commands.delete(definition.name); } });
  ctx.provide('tools', { register(definition) { tools.set(definition.name, definition); return () => tools.delete(definition.name); } });
  return { ctx, commands, tools, get writes() { return writes; } };
}

test('real Cordis activation registers the service, command and read-only tool, with teardown', async () => {
  const h = host();
  const fiber = h.ctx.plugin(plugin, {});
  await fiber.await();
  assert.ok(h.ctx.get('betterPluginUpdater'));
  assert.ok(h.commands.has('plugin-updater'));
  assert.ok(h.tools.has('plugin_updates'));
  const command = h.commands.get('plugin-updater');
  const result = await command.handler({ rawInput: ' list' });
  assert.equal(result.kind, 'success');
  assert.equal(result.text, 'No plugin bundles are listed in this profile.');
  assert.throws(() => JSON.parse(result.text));
  assert.equal((await command.handler({ rawInput: '' })).text, result.text);
  assert.equal((await command.handler({ rawInput: ' help' })).kind, 'success');
  assert.equal((await command.handler({ rawInput: ' update missing' })).kind, 'error');
  assert.equal((await command.handler({ rawInput: ' check x extra' })).kind, 'error');
  const tool = h.tools.get('plugin_updates');
  assert.equal(tool.parameters.type, 'object');
  assert.deepEqual(tool.parameters.required, ['action']);
  assert.equal(tool.parameters.additionalProperties, false);
  assert.deepEqual(tool.parameters.properties.action.enum, ['list', 'check', 'plan']);
  const execution = { signal: new AbortController().signal };
  assert.deepEqual(JSON.parse(await tool.execute({ action: 'list' }, execution)), []);
  await assert.rejects(tool.execute({ action: 'update', target: 'anything' }, execution));
  await assert.rejects(tool.execute({}, execution));
  await assert.rejects(tool.execute(null, execution));
  await assert.rejects(tool.execute({ action: 'check', target: 123 }, execution));
  await assert.rejects(tool.execute({ action: 'list', extra: true }, execution));
  assert.equal(h.writes, 0);
  h.ctx.get('betterPluginUpdater').apply = async () => ({ status: 'failed', message: 'Fixture failure.' });
  assert.equal((await command.handler({ rawInput: ' update fixture --accept-removal-risk' })).kind, 'error');
  await fiber.dispose();
  assert.equal(h.commands.size, 0);
  assert.equal(h.tools.size, 0);
  assert.equal(h.ctx.get('betterPluginUpdater'), undefined);
});

test('Host lazily resolves current credentials, supports optional services, and never exposes token failures', async t => {
  const reference = 'DSH_UPDATER_TEST_GITHUB_TOKEN';
  const previous = process.env[reference];
  const h = host();
  const bundle = { name: 'plugin', version: '1.0.0', source: 'github:owner/repo#main', enabled: true, installed: true, removable: true, availability: 'profile' };
  h.ctx.get('pluginManager').listBundles = async () => [bundle];
  let credentialReads = 0;
  let stored = 'fixture-stored-token';
  let broken = false;
  const sent = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    sent.push({ url: String(url), authorization: init.headers.Authorization });
    return Response.json(new URL(url).origin === 'https://api.github.com' ? { sha: 'a'.repeat(40) }
      : { name: 'plugin', 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': { name: 'plugin', version: '1.0.0', dsh: { bundle: {} } } } });
  });
  process.env[reference] = 'fixture-environment-token';
  const fiber = h.ctx.plugin(plugin, { githubTokenEnv: reference });
  try {
    await fiber.await();
    assert.equal(sent.length, 0);
    const updater = h.ctx.get('betterPluginUpdater');
    await updater.check('plugin');
    assert.equal(sent.at(-1).authorization, 'Bearer fixture-environment-token');
    process.env[reference] = 'fixture-new-environment-token';
    await updater.check('plugin');
    assert.equal(sent.at(-1).authorization, 'Bearer fixture-new-environment-token');

    // The optional service may appear after activation; it owns all precedence after that point.
    h.ctx.provide('credentials', { async resolve(ref) {
      credentialReads++;
      assert.equal(ref, reference);
      if (broken) throw new Error('fixture-secret from provider diagnostic');
      return stored === undefined ? undefined : { value: stored, source: 'file' };
    } });
    assert.equal(credentialReads, 0);
    await updater.check('plugin');
    assert.equal(sent.at(-1).authorization, 'Bearer fixture-stored-token');
    stored = 'fixture-rotated-token';
    await updater.check('plugin');
    assert.equal(sent.at(-1).authorization, 'Bearer fixture-rotated-token');
    stored = undefined;
    await updater.check('plugin');
    assert.equal(sent.at(-1).authorization, undefined);

    broken = true;
    const before = sent.length;
    const result = JSON.parse(await h.tools.get('plugin_updates').execute({ action: 'check', target: 'plugin' }, { signal: new AbortController().signal }));
    assert.equal(result[0].status, 'error');
    assert.equal(result[0].detail.key, 'error.githubCredentials');
    assert.doesNotMatch(JSON.stringify(result), /fixture-secret|fixture-.*token/);
    const human = await h.commands.get('plugin-updater').handler({ rawInput: 'check plugin --lang zh' });
    assert.match(human.text, /GitHub API 令牌无法读取或格式无效/);
    assert.doesNotMatch(human.text, /fixture-secret/);
    assert.equal(sent.length, before);

    const reads = credentialReads;
    bundle.source = 'plugin@^1';
    assert.equal((await updater.check('plugin'))[0].status, 'current');
    assert.equal(sent.at(-1).authorization, undefined);
    assert.equal(credentialReads, reads);
    assert.equal(h.writes, 0);
  } finally {
    await fiber.dispose();
    if (previous === undefined) delete process.env[reference];
    else process.env[reference] = previous;
  }
});

test('Host startup applies persisted tasks through its plugin manager', { timeout: 5000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-updater-host-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const h = host();
  h.ctx.get('profileContext').dir = dir;
  let bundle = { name: 'plugin', version: '1.0.0', source: 'plugin@^1', enabled: true, installed: true, removable: true, availability: 'profile' };
  const manager = h.ctx.get('pluginManager');
  manager.listBundles = async () => bundle ? [bundle] : [];
  let resolveInstall;
  const installed = new Promise(resolve => { resolveInstall = resolve; });
  manager.removeBundle = async () => { bundle = undefined; return { application: 'applied' }; };
  manager.installBundle = async (spec) => { bundle = { name: 'plugin', version: '2.0.0', source: spec, enabled: true, installed: true, removable: true, availability: 'profile' }; resolveInstall(); return { application: 'applied' }; };
  const queue = new ScheduledUpdates(dir, { async applyDeferred() { throw new Error('unexpected'); } });
  await queue.schedule([{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), expiresAt: new Date().toISOString(), command: '/plugin-updater update plugin', bundle,
    source: { kind: 'npm', packageName: 'plugin', registry: 'https://registry.test/', channel: 'latest', pinned: false },
    candidate: { spec: 'plugin@2.0.0', version: '2.0.0', registry: 'https://registry.test/' }, warnings: [] }]);
  const file = join(dir, '.better-plugin-updater-queue.json');
  const saved = JSON.parse(await readFile(file, 'utf8'));
  saved.entries[0].creator = 'previous-process'; saved.entries[0].pid = 2147483647;
  await writeFile(file, JSON.stringify(saved));
  const fiber = h.ctx.plugin(plugin, {});
  try { await fiber.await(); await installed; assert.equal(bundle.version, '2.0.0'); }
  finally { await fiber.dispose(); }
});

test('configuration has no scheduled work and rejects invalid request bounds', () => {
  const defaults = plugin.Config.parse({});
  assert.deepEqual(defaults.sources, {});
  assert.deepEqual(defaults.indexes, []);
  assert.equal(defaults.githubTokenEnv, 'GITHUB_TOKEN');
  assert.throws(() => plugin.Config.parse({ githubTokenEnv: 'not a reference' }));
  assert.throws(() => plugin.Config.parse({ requestTimeoutMs: 0 }));
});
