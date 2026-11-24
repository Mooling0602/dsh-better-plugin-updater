import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { Context } from '@deepseek-ai/cordis';
import * as client from '../dist/client/index.js';
import { en as pageEn, formLabels, zh as pageZh } from '../dist/client/locales.js';
import { normalizeLanguage } from '../dist/language.js';
import { createUpdaterCommand } from '../dist/commands.js';
import { resolveLanguage } from '../dist/i18n.js';
import type { UpdatePlan } from '../dist/types.js';

type RemoteCall = { context: string; args: [string, string, ...unknown[]] };
type Execute = (id: string, line: string, attachments?: unknown, signal?: AbortSignal) => Promise<{ ok: boolean; value: { text: string } }>;
type RemoteCommands = { ctx: string; execute: Execute };

function remote(handler?: (...args: unknown[]) => Promise<unknown>): { commands: RemoteCommands; calls: RemoteCall[] } {
  const calls: RemoteCall[] = [];
  const commands: RemoteCommands = { ctx: 'default', execute: async () => ({ ok: true, value: { text: '' } }) };
  // Same configurable, context-sensitive accessor contract as rc.4's RemoteNamespaceService.
  Object.defineProperty(commands, 'execute', { configurable: true, enumerable: true, get() {
    const context = this.ctx;
    return (...args: unknown[]) => {
      calls.push({ context, args: args as [string, string, ...unknown[]] });
      return handler ? handler(...args) as Promise<{ ok: boolean; value: { text: string } }> : Promise.resolve({ ok: true, value: { text: String(args[1]) } });
    };
  } });
  return { commands, calls };
}

function host(choice: 'auto' | 'en' | 'zh' = 'auto', preference: string = 'en') {
  const writes: unknown[][] = [];
  const updater = {
    async list() { return []; }, async check() { return []; },
    prepare(): UpdatePlan { throw new Error('Not used by this fixture.'); },
    async apply(...args: unknown[]) { writes.push(args); return { status: 'failed' as const, message: 'Fixture failure.' }; },
  };
  const settings = { describe() { return [{ ns: 'locale', value: { preference } }]; } };
  const command = createUpdaterCommand(updater, { language: (language: 'en' | 'zh' | undefined) => resolveLanguage(choice, settings, language) });
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
  const caller = Object.create(f.commands) as RemoteCommands;
  caller.ctx = 'calling-client-context';
  const attachments: unknown[] = [];
  const signal = new AbortController().signal;
  const response = await caller.execute('session', '/plugin-updater check plugin', attachments, signal);
  assert.equal(response.ok, true);
  assert.equal(f.calls[0]!.context, caller.ctx);
  assert.deepEqual(f.calls[0]!.args.slice(0, 2), ['session', '/plugin-updater check plugin --client-lang zh']);
  assert.equal(f.calls[0]!.args[2], attachments);
  assert.equal(f.calls[0]!.args[3], signal);
  dispose();
});

test('only our exact command reads locale and receives metadata, without rewriting its original bytes', async () => {
  const f = remote();
  let reads = 0;
  const dispose = client.installLanguageBridge(f.commands, () => { reads++; return 'zh'; });
  for (const line of ['/model', '/plugin-updater-other check', '/Plugin-updater', ' /plugin-updater', 'plain text']) {
    await f.commands.execute('s', line);
    assert.equal(f.calls.at(-1)!.args[1], line);
  }
  assert.equal(reads, 0);
  const line = '/plugin-updater\tcheck  plugin\n';
  await f.commands.execute('s', line);
  assert.equal(f.calls.at(-1)!.args[1], `${line} --client-lang zh`);
  assert.equal(reads, 1);
  dispose();
});

test('actual current UI language wins over saved preference, changes next call and stays client-local', async () => {
  const h = host();
  const execute = async (_id: unknown, line: unknown) => ({ ok: true, value: await h.command.handler({ rawInput: String(line).slice('/plugin-updater'.length) }) as { text: string } });
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
  assert.equal(f.calls.at(-1)!.args[1], '/plugin-updater help');
  language = 'throw';
  await f.commands.execute('s', '/plugin-updater help');
  assert.equal(f.calls.at(-1)!.args[1], '/plugin-updater help');
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
  assert.equal(f.calls.at(-1)!.args[1], '/plugin-updater help');

  dispose = client.installLanguageBridge(f.commands, () => 'zh');
  const bridge = Object.getOwnPropertyDescriptor(f.commands, 'execute')!.get!;
  const later = function(this: unknown) { return Reflect.apply(bridge, this, []); };
  Object.defineProperty(f.commands, 'execute', { configurable: true, get: later });
  dispose();
  assert.equal(Object.getOwnPropertyDescriptor(f.commands, 'execute')!.get, later);
  await f.commands.execute('s', '/plugin-updater help');
  assert.equal(f.calls.at(-1)!.args[1], '/plugin-updater help');
});

test('real Cordis Client lifecycle installs the bridge and unloads it cleanly', async () => {
  const ctx = new Context();
  const f = remote();
  ctx.provide('remote.commands', f.commands);
  ctx.provide('locale', { getSnapshot() { return { active: 'zh' }; } });
  const fiber = ctx.plugin(client);
  await fiber.await();
  await f.commands.execute('s', '/plugin-updater help');
  assert.match(f.calls.at(-1)!.args[1], /--client-lang zh$/);
  await fiber.dispose();
  await f.commands.execute('s', '/plugin-updater help');
  assert.equal(f.calls.at(-1)!.args[1], '/plugin-updater help');
});

test('packaged browser factory is self-contained and declares a discoverable Client entry', async () => {
  let loaded: { id: string; factory: (resolve: (specifier: string) => never) => { apply: unknown; inject: readonly string[] } } | undefined;
  vm.runInNewContext(await readFile(new URL('../dist/client.js', import.meta.url), 'utf8'), { window: { __ModuleLoader__: { load(value: NonNullable<typeof loaded>) { loaded = value; } } } });
  assert.ok(loaded);
  assert.equal(loaded.id, 'dsh-better-plugin-updater');
  const exported = loaded.factory(() => { throw new Error('Unexpected browser dependency'); });
  assert.equal(typeof exported.apply, 'function');
  assert.deepEqual(Array.from(exported.inject), ['locale', 'remote.commands']);
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { exports: Record<string, { browser: string }>; dsh: { client: { immediately: boolean; platform: string } }; scripts: Record<string, string | undefined>; files: string[] };
  assert.equal(pkg.exports['./client']!.browser, './dist/client.js');
  assert.equal(pkg.dsh.client.immediately, true);
  assert.equal(pkg.dsh.client.platform, 'web');
  // A Git dependency holds no built files, so the install builds them, while the published
  // tarball ships the same output and therefore runs no build on the user's device.
  assert.equal(pkg.scripts.prepare, 'npm run build');
  assert.equal(pkg.scripts.prepublishOnly, 'npm run check && npm run test');
  assert.equal(pkg.files.includes('dist'), true);
  for (const hook of ['prepack', 'preinstall', 'install', 'postinstall']) {
    assert.equal(pkg.scripts[hook], undefined, `${hook} must not trigger an install-time build`);
  }
});

test('settings page dictionaries cover the same keys and every one has copy', () => {
  assert.deepEqual(Object.keys(pageZh).sort(), Object.keys(pageEn).sort());
  for (const key of Object.keys(pageEn) as (keyof typeof pageEn)[]) {
    assert.ok(pageEn[key].length > 0, `${key} is blank in English`);
    assert.ok(pageZh[key].length > 0, `${key} is blank in Chinese`);
  }
  // The page label the maintainer asked for, so a future rename cannot drift back silently.
  assert.equal(pageZh.language, '插件语言');
  assert.equal(pageEn.language, 'Plugin language');
  // The frame copy must come from the dictionary rather than a second hardcoded set.
  const labels = formLabels((key: keyof typeof pageZh) => pageZh[key]);
  assert.equal(labels.save, pageZh.save);
  assert.equal(labels.unavailable, pageZh.unavailable);
});
