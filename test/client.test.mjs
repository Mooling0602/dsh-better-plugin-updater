import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Context } from '@deepseek-ai/cordis';
import * as client from '../dist/client/index.js';
import { normalizeLanguage } from '../dist/language.js';
import { createUpdaterCommand } from '../dist/commands.js';
import { resolveLanguage } from '../dist/i18n.js';

function remote(handler) {
  const calls = [];
  const commands = { ctx: 'default' };
  // Same configurable, context-sensitive accessor contract as rc.4's RemoteNamespaceService.
  Object.defineProperty(commands, 'execute', { configurable: true, enumerable: true, get() {
    const context = this.ctx;
    return (...args) => {
      calls.push({ context, args });
      return handler ? handler(...args) : Promise.resolve({ ok: true, value: args });
    };
  } });
  return { commands, calls };
}

function host(choice = 'auto', preference = 'en') {
  const writes = [];
  const updater = {
    async list() { return []; }, async check() { return []; }, async plan() { throw new Error('No plan'); },
    async apply(...args) { writes.push(args); return { status: 'failed', message: 'Fixture failure.' }; },
  };
  const settings = { describe() { return [{ ns: 'locale', value: { preference } }]; } };
  const command = createUpdaterCommand(updater, { language: language => resolveLanguage(choice, settings, language) });
  return { command, writes };
}

test('browser-safe tags recognize supported languages without guessing from process or navigator', () => {
  for (const [input, expected] of [['zh', 'zh'], ['zh-Hans-CN', 'zh'], ['EN-us', 'en'], ['ja', undefined], ['zh_bad', undefined], [' zh', undefined], [123, undefined], ['zh\n', undefined], ['zh-CN\n', undefined], ['en-US\r', undefined]]) {
    assert.equal(normalizeLanguage(input), expected);
  }
});

test('bridge preserves the original command wire, caller context, signal, attachments and result', async () => {
  const f = remote();
  const dispose = client.installLanguageBridge(f.commands, () => 'zh-CN');
  const caller = Object.create(f.commands);
  caller.ctx = 'calling-client-context';
  const attachments = [];
  const signal = new AbortController().signal;
  const response = await caller.execute('session', '/plugin-updater check plugin', attachments, signal);
  assert.equal(response.ok, true);
  assert.equal(f.calls[0].context, caller.ctx);
  assert.deepEqual(f.calls[0].args.slice(0, 2), ['session', '/plugin-updater check plugin --client-lang zh']);
  assert.equal(f.calls[0].args[2], attachments);
  assert.equal(f.calls[0].args[3], signal);
  dispose();
});

test('only our exact command reads locale and receives metadata, without rewriting its original bytes', async () => {
  const f = remote();
  let reads = 0;
  const dispose = client.installLanguageBridge(f.commands, () => { reads++; return 'zh'; });
  for (const line of ['/model', '/plugin-updater-other check', '/Plugin-updater', ' /plugin-updater', 'plain text']) {
    await f.commands.execute('s', line);
    assert.equal(f.calls.at(-1).args[1], line);
  }
  assert.equal(reads, 0);
  const line = '/plugin-updater\tcheck  plugin\n';
  await f.commands.execute('s', line);
  assert.equal(f.calls.at(-1).args[1], `${line} --client-lang zh`);
  assert.equal(reads, 1);
  dispose();
});

test('actual current UI language wins over saved preference, changes next call and stays client-local', async () => {
  const h = host();
  const execute = async (_id, line) => ({ ok: true, value: await h.command.handler({ rawInput: line.slice('/plugin-updater'.length) }) });
  const a = remote(execute);
  const b = remote(execute);
  let language = 'zh';
  const da = client.installLanguageBridge(a.commands, () => language);
  const db = client.installLanguageBridge(b.commands, () => 'en');
  assert.match((await a.commands.execute('same-session', '/plugin-updater help')).value.text, /^插件更新助手/);
  assert.match((await b.commands.execute('same-session', '/plugin-updater help')).value.text, /^Plugin updater/);
  language = 'en';
  assert.match((await a.commands.execute('same-session', '/plugin-updater help')).value.text, /^Plugin updater/);
  language = 'zh';
  assert.match((await a.commands.execute('same-session', '/plugin-updater help')).value.text, /^插件更新助手/);
  assert.equal(h.writes.length, 0);
  da(); db();
});

test('explicit command language wins over fixed plugin language, which wins over UI language', async () => {
  const h = host('en');
  assert.match((await h.command.handler({ rawInput: 'help --client-lang zh' })).text, /^Plugin updater/);
  assert.match((await h.command.handler({ rawInput: 'help --client-lang en --lang zh' })).text, /^插件更新助手/);
  const automatic = host('auto', 'zh');
  assert.match((await automatic.command.handler({ rawInput: 'help --client-lang en' })).text, /^Plugin updater/);
  assert.match((await automatic.command.handler({ rawInput: 'help' })).text, /^插件更新助手/);
});

test('malformed or duplicate metadata cannot dispatch a write or replace removal-risk acceptance', async () => {
  const h = host();
  for (const rawInput of [
    'update id --client-lang zh',
    'update id --accept-removal-risk --client-lang',
    'update id --accept-removal-risk --client-lang bad',
    'update id --accept-removal-risk --client-lang zh --client-lang en',
    'update id --accept-removal-risk extra --client-lang zh',
    'update id --client-lang --accept-removal-risk',
  ]) assert.equal((await h.command.handler({ rawInput })).kind, 'error');
  assert.deepEqual(h.writes, []);
  await h.command.handler({ rawInput: 'update id --accept-removal-risk --client-lang zh' });
  assert.deepEqual(h.writes, []);
});

test('unsupported or unavailable UI locale leaves the Host fallback intact', async () => {
  const f = remote();
  let language = 'ja';
  const dispose = client.installLanguageBridge(f.commands, () => {
    if (language === 'throw') throw new Error('Locale unavailable');
    return language;
  });
  await f.commands.execute('s', '/plugin-updater help');
  assert.equal(f.calls.at(-1).args[1], '/plugin-updater help');
  language = 'throw';
  await f.commands.execute('s', '/plugin-updater help');
  assert.equal(f.calls.at(-1).args[1], '/plugin-updater help');
  dispose();
});

test('teardown restores accessors and cached wrappers become inert without undoing a later adapter', async () => {
  const f = remote();
  const before = Object.getOwnPropertyDescriptor(f.commands, 'execute');
  let dispose = client.installLanguageBridge(f.commands, () => 'zh');
  const cached = f.commands.execute;
  dispose(); dispose();
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.commands, 'execute'), before);
  await cached('s', '/plugin-updater help');
  assert.equal(f.calls.at(-1).args[1], '/plugin-updater help');

  dispose = client.installLanguageBridge(f.commands, () => 'zh');
  const bridge = Object.getOwnPropertyDescriptor(f.commands, 'execute').get;
  const later = function() { return Reflect.apply(bridge, this, []); };
  Object.defineProperty(f.commands, 'execute', { configurable: true, get: later });
  dispose();
  assert.equal(Object.getOwnPropertyDescriptor(f.commands, 'execute').get, later);
  await f.commands.execute('s', '/plugin-updater help');
  assert.equal(f.calls.at(-1).args[1], '/plugin-updater help');
});

test('real Cordis Client lifecycle installs the bridge and unloads it cleanly', async () => {
  const ctx = new Context();
  const f = remote();
  ctx.provide('remote.commands', f.commands);
  ctx.provide('locale', { getSnapshot() { return { active: 'zh' }; } });
  const fiber = ctx.plugin(client);
  await fiber.await();
  await f.commands.execute('s', '/plugin-updater help');
  assert.match(f.calls.at(-1).args[1], /--client-lang zh$/);
  await fiber.dispose();
  await f.commands.execute('s', '/plugin-updater help');
  assert.equal(f.calls.at(-1).args[1], '/plugin-updater help');
});

test('packaged browser factory is self-contained and declares a discoverable Client entry', async () => {
  let loaded;
  vm.runInNewContext(await readFile(new URL('../dist/client.js', import.meta.url), 'utf8'), { window: { __ModuleLoader__: { load(value) { loaded = value; } } } });
  assert.equal(loaded.id, 'dsh-better-plugin-updater');
  const exported = loaded.factory(() => { throw new Error('Unexpected browser dependency'); });
  assert.equal(typeof exported.apply, 'function');
  assert.deepEqual(Array.from(exported.inject), ['locale', 'remote.commands']);
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.exports['./client'].browser, './dist/client.js');
  assert.equal(pkg.dsh.client.immediately, true);
  assert.equal(pkg.dsh.client.platform, 'web');
});
