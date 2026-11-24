import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
import * as plugin from '../dist/index.js';

function createHost() {
  const ctx = new Context();
  const commands = new Map();
  const tools = new Map();
  ctx.provide('pluginManager', {
    async listBundles() { return []; },
    async registries() { return { registry: 'https://registry.test/' }; },
    async removeBundle() { throw new Error('Unexpected package removal.'); },
    async installBundle() { throw new Error('Unexpected package installation.'); },
  });
  ctx.provide('profileContext', { dir: '/nonexistent-github-remote-fixture' });
  ctx.provide('commands', { register(definition) { commands.set(definition.name, definition); return () => commands.delete(definition.name); } });
  ctx.provide('tools', { register(definition) { tools.set(definition.name, definition); return () => tools.delete(definition.name); } });
  return { ctx, commands, tools };
}

test('GitHub Remote registers through the Cordis plugin lifecycle and rejects calls without an invocation', async () => {
  const host = createHost();
  const fiber = host.ctx.plugin(plugin, {});
  try {
    await fiber.await();
    const service = host.ctx.get('betterPluginUpdaterUi');
    assert.ok(service);
    assert.equal(service.typertRemote.serviceKey, 'betterPluginUpdaterUi');
    assert.equal(service.typertRemote.namespace, 'betterPluginUpdaterUi');
    assert.deepEqual(remoteMethods(service).map(marker => marker.method), ['describe', 'check', 'apply']);

    await assert.rejects(service.describe('fixture-plugin'), /Only the Host owner/);
  } finally {
    await fiber.dispose();
  }
  assert.equal(host.ctx.get('betterPluginUpdaterUi'), undefined);
  assert.equal(host.commands.size, 0);
  assert.equal(host.tools.size, 0);
});
