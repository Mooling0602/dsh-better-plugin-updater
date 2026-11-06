import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import * as plugin from '../dist/index.js';
import { dictionaries, message, resolveLanguage, t, translate } from '../dist/i18n.js';
import { UpdaterError } from '../dist/errors.js';
import { createUpdaterCommand } from '../dist/commands.js';
import { createUpdaterTool } from '../dist/tools.js';
import { formatApply, formatChecks, formatCommandError, formatInventory, formatUsage } from '../dist/format.js';
import { createJsonClient, createProviders, Updater } from '../dist/core.js';

const bundle = { name: 'plugin', version: '1.0.0', source: 'plugin@^1', installed: true, enabled: false, removable: true, availability: 'profile' };
const providerSource = { kind: 'npm', packageName: 'plugin', registry: 'https://registry.test/', channel: 'latest', pinned: false };
const candidate = { spec: 'plugin@2.0.0', version: '2.0.0', registry: providerSource.registry };
const placeholders = text => [...new Set([...text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map(match => match[1]))].sort();

test('English and Chinese dictionaries have identical keys and placeholder sets', () => {
  assert.deepEqual(Object.keys(dictionaries.zh).sort(), Object.keys(dictionaries.en).sort());
  for (const key of Object.keys(dictionaries.en)) {
    assert.ok(dictionaries.en[key].length && dictionaries.zh[key].length, key);
    assert.deepEqual(placeholders(dictionaries.zh[key]), placeholders(dictionaries.en[key]), key);
    const values = Object.fromEntries(placeholders(dictionaries.en[key]).map(name => [name, `literal-${name}`]));
    for (const language of ['en', 'zh']) assert.doesNotMatch(t(language, key, values), /\{[A-Za-z][A-Za-z0-9]*\}/, key);
  }
});

test('translation interpolates literal values once and never interprets arbitrary diagnostics', () => {
  const literal = 'plugin-{ref}-$&';
  assert.ok(t('zh', 'warning.gitPin', { name: literal, ref: 'main' }).includes(literal));
  assert.equal(translate(undefined, 'External diagnostic.', 'zh'), 'External diagnostic.');
  assert.equal(translate({ key: 'unknown.external' }, 'Keep this diagnostic.', 'zh'), 'Keep this diagnostic.');
  assert.match(formatCommandError(new UpdaterError('error.expired'), 'zh'), /确认不存在或已过期/);
  assert.ok(formatCommandError(new Error(dictionaries.en['error.expired']), 'zh').includes(dictionaries.en['error.expired']));
  assert.match(formatCommandError(new DOMException('Aborted', 'AbortError'), 'zh'), /操作已取消/);
});

test('auto reads only a saved locale preference, with redaction and safe English fallback', () => {
  let preference = 'zh-CN';
  let calls = 0;
  const settings = { describe(options) { calls++; assert.deepEqual(options, { redactSecrets: true }); return [{ ns: 'unrelated', value: { preference: 'en' } }, { ns: 'locale', value: { preference } }]; } };
  assert.equal(resolveLanguage('auto', settings), 'zh');
  preference = 'en-US'; assert.equal(resolveLanguage('auto', settings), 'en');
  preference = 'ZH-Hant'; assert.equal(resolveLanguage('auto', settings), 'zh');
  preference = 'ja'; assert.equal(resolveLanguage('auto', settings), 'en');
  const before = calls;
  assert.equal(resolveLanguage('zh', settings), 'zh');
  assert.equal(calls, before);
  assert.equal(resolveLanguage('auto'), 'en');
  assert.equal(resolveLanguage('auto', { describe() { throw new Error('Unavailable'); } }), 'en');
  assert.equal(resolveLanguage('auto', { describe() { return [{ ns: 'locale', value: {} }]; } }), 'en');
  assert.equal(resolveLanguage('auto', { describe() { return [{ ns: 'locale', value: { preference: 'zh' } }, { ns: 'locale', value: { preference: 'en' } }]; } }), 'en');
});

test('Chinese formatters translate headers, statuses, owned reasons, risks and outcomes', () => {
  const checked = { bundle, source: providerSource, candidate, status: 'update-available', ...message('msg.versionUpdate') };
  const inventory = formatInventory([bundle], 'zh');
  assert.match(inventory, /当前配置已安装 1 个/);
  assert.match(inventory, /已禁用/);
  const checks = formatChecks([checked], 'zh');
  assert.match(checks, /已检查 1 个插件包/);
  assert.match(checks, /可更新（1）/);
  assert.match(checks, /有更新的版本可用/);
  assert.match(checks, /v1\.0\.0 -> v2\.0\.0/);
  assert.match(checks, /\/plugin-updater update plugin/);
  assert.doesNotMatch(checks, /\/plugin-updater plan/);
  const pinned = formatChecks([{ bundle, source: { ...providerSource, pinned: true }, candidate, status: 'pinned', ...message('msg.npmPinnedUpdate', { name: bundle.name }) }], 'zh');
  assert.match(pinned, /候选版本 v2\.0\.0/);
  assert.match(pinned, /发现更新版本，但此插件已固定版本/);
  assert.ok(pinned.includes('sources[plugin].allowPinned'));
  assert.doesNotMatch(pinned, /\/plugin-updater update plugin/);
  const applied = formatApply({ status: 'failed', ...message('msg.removalFailed'), removal: { application: 'failed', error: { code: 'external-code', diagnostic: 'Original external diagnostic.' }, pendingBuilds: ['package-build'] }, recovery: candidate }, 'zh');
  assert.match(applied, /更新未完成/);
  assert.match(applied, /移除阶段: 失败/);
  assert.match(applied, /未开始安装/);
  assert.match(applied, /待审批的构建脚本：package-build/);
  assert.match(applied, /Original external diagnostic/);
  assert.match(applied, /人工恢复目标（尚未执行）/);
  assert.match(formatApply({ status: 'restart-required', ...message('msg.installed'), remaining: bundle }, 'zh'), /需要重启 DSH/);
  assert.match(formatUsage('zh'), /--lang zh/);
  assert.match(formatUsage('en'), /Plugin updater/);
});

function target() {
  const calls = [];
  const updater = {
    async list() { calls.push('list'); return []; },
    async check() { calls.push('check'); return [{ bundle, source: providerSource, status: 'current', ...message('msg.versionCurrent') }]; },
    async apply(id, accepted) { calls.push(['apply', id, accepted]); return { status: 'failed', ...message('msg.removalFailed') }; },
  };
  return { updater, calls };
}

test('language overrides work before or after actions and never weaken risk acknowledgement', async () => {
  const { updater, calls } = target();
  const command = createUpdaterCommand(updater);
  for (const rawInput of ['--lang zh help', 'help --lang zh']) assert.match((await command.handler({ rawInput })).text, /插件更新助手/);
  assert.match((await command.handler({ rawInput: 'check plugin --lang zh' })).text, /未发现更新的版本/);
  assert.equal((await command.handler({ rawInput: 'plan plugin --lang zh' })).kind, 'error');
  const count = calls.length;
  for (const rawInput of ['--lang', '--lang ja', '--lang zh --lang en help']) {
    assert.equal((await command.handler({ rawInput })).kind, 'error');
  }
  assert.equal(calls.length, count);
  const update = await command.handler({ rawInput: 'update id --accept-removal-risk --lang zh' });
  assert.equal(update.kind, 'error');
  assert.match(update.text, /没有已安装的插件匹配/);
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === 'apply'), false);
});

test('language follows the next invocation but is captured for the whole current operation', async () => {
  const { updater } = target();
  let language = 'zh';
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  updater.list = async () => { await gate; return []; };
  const command = createUpdaterCommand(updater, { language: () => language });
  const pending = command.handler({ rawInput: 'list' });
  language = 'en'; release();
  assert.equal((await pending).text, '当前配置中没有插件包。');
  assert.match((await command.handler({ rawInput: 'list' })).text, /No plugin bundles/);
  assert.match((await command.handler({ rawInput: 'list --lang zh' })).text, /当前配置/);
  assert.match((await command.handler({ rawInput: 'list' })).text, /No plugin bundles/);
});

test('localized commands never localize tool JSON keys, statuses or English message fields', async () => {
  const { updater } = target();
  const human = await createUpdaterCommand(updater, { language: 'zh' }).handler({ rawInput: 'check' });
  assert.match(human.text, /已是最新/);
  const result = JSON.parse(await createUpdaterTool(updater).execute({ action: 'check' }, { signal: new AbortController().signal }));
  assert.equal(result[0].status, 'current');
  assert.equal(result[0].message, dictionaries.en['msg.versionCurrent']);
  assert.equal(result[0].detail.key, 'msg.versionCurrent');
});

test('provider and coordinator reasons and caught errors carry owned translation identities', async () => {
  const manager = { async listBundles() { return [bundle]; }, async registries() { return { registry: providerSource.registry }; } };
  const client = { async get() { return { name: 'plugin', 'dist-tags': { latest: '2.0.0' }, versions: { '2.0.0': { name: 'plugin', version: '2.0.0', dsh: { bundle: {} } } } }; } };
  const updater = new Updater({ manager, client, providers: createProviders() });
  const plan = updater.prepare((await updater.check('plugin'))[0]);
  assert.match(translate(plan.warningDetails.at(-1), '', 'zh'), /固定到明确版本/);
  manager.listBundles = async () => [{ ...bundle, source: 'link:/tmp/local' }];
  assert.match(formatChecks(await updater.check(), 'zh'), /安装来源为本地目录或无法识别/);
  manager.listBundles = async () => [bundle];
  client.get = async () => ({});
  assert.match(formatChecks(await updater.check(), 'zh'), /仓库元数据中的包标识不一致/);
  manager.listBundles = async () => [{ ...bundle, name: 'dsh-better-plugin-updater' }];
  assert.match(formatChecks(await updater.check(), 'zh'), /暂不支持自更新/);
  await updater.dispose();
});

test('GitHub rate-limit details survive real transport, providers, tools, plans and Chinese commands', async () => {
  const retryAt = '2099-01-01T00:00:00.000Z';
  const bundles = [
    { ...bundle, source: 'github:owner/repo#main' },
    { ...bundle, name: 'release-plugin', source: 'https://github.com/owner/repo/releases/download/v1.0.0/release-plugin-1.0.0.tgz' },
  ];
  let requests = 0;
  let writes = 0;
  const manager = {
    async listBundles() { return bundles; },
    async registries() { return { registry: providerSource.registry }; },
    async removeBundle() { writes++; throw new Error('No writes'); },
    async installBundle() { writes++; throw new Error('No writes'); },
  };
  const client = createJsonClient({ fetch: async () => {
    requests++;
    return new Response('fixture-secret', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Date.parse(retryAt) / 1000) } });
  } });
  const updater = new Updater({ manager, client, providers: createProviders(), currentRevision: async () => 'a'.repeat(40) });
  const detail = { key: 'error.githubRateLimitedUntil', params: { status: 403, retryAt } };
  try {
    const checks = await updater.check();
    for (const result of checks) {
      assert.equal(result.status, 'error');
      assert.deepEqual(result.detail, detail);
      assert.match(result.message, /GitHub API rate limit reached \(HTTP 403\)/);
      assert.doesNotMatch(result.message, /fixture-secret/);
    }
    const result = JSON.parse(await createUpdaterTool(updater).execute({ action: 'check', target: bundle.name }, { signal: new AbortController().signal }));
    assert.deepEqual(result[0].detail, detail);
    assert.equal(result[0].message, checks[0].message);
    const command = createUpdaterCommand(updater, { language: 'zh' });
    const human = await command.handler({ rawInput: 'check release-plugin' });
    assert.match(human.text, /GitHub API 请求已达限额（HTTP 403）/);
    assert.ok(human.text.includes(retryAt));
    assert.doesNotMatch(human.text, /fixture-secret|Metadata request failed/);
    assert.throws(() => updater.prepare(checks[0]), error => {
      assert.deepEqual(error.detail, detail);
      return true;
    });
    const update = await command.handler({ rawInput: 'update release-plugin' });
    assert.equal(update.kind, 'error');
    assert.match(update.text, /GitHub API 请求已达限额（HTTP 403）/);
    assert.ok(update.text.includes(retryAt));
    assert.equal(requests, 5);
    assert.equal(writes, 0);
  } finally { await updater.dispose(); }
});

test('Host auto language reads live settings, explicit configuration wins, and no setting is written', async () => {
  const ctx = new Context();
  const commands = new Map();
  let preference = 'zh';
  ctx.provide('pluginManager', { async listBundles() { return []; }, async registries() { return { registry: providerSource.registry }; }, async removeBundle() { throw new Error('No writes'); }, async installBundle() { throw new Error('No writes'); } });
  ctx.provide('profileContext', { dir: '/nonexistent-i18n-fixture' });
  ctx.provide('commands', { register(value) { commands.set(value.name, value); return () => commands.delete(value.name); } });
  ctx.provide('settings', { describe(options) { assert.deepEqual(options, { redactSecrets: true }); return [{ ns: 'locale', value: { preference } }]; } });
  let fiber = ctx.plugin(plugin, {}); await fiber.await();
  assert.match(commands.get('plugin-updater').description, /检查插件包/);
  assert.equal((await commands.get('plugin-updater').handler({ rawInput: '' })).text, '当前配置中没有插件包。');
  preference = 'en';
  assert.match((await commands.get('plugin-updater').handler({ rawInput: '' })).text, /No plugin bundles/);
  await fiber.dispose();
  fiber = ctx.plugin(plugin, { language: 'zh' }); await fiber.await();
  assert.equal((await commands.get('plugin-updater').handler({ rawInput: '' })).text, '当前配置中没有插件包。');
  assert.equal(preference, 'en');
  await fiber.dispose();
  assert.equal(plugin.Config({}).language.get(), 'auto');
  assert.throws(() => plugin.Config({ language: 'ja' }));
});
