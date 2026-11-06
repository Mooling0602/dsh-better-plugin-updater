import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { Context } from '@deepseek-ai/cordis';

async function fixture() {
  const source = await readFile(new URL('../dist/client.js', import.meta.url), 'utf8');
  const opens = [];
  const button = function Button() {};
  const jsx = (type, props) => ({ type, props });
  const requireHost = specifier => {
    if (specifier === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return { Button: button };
    throw new Error(`Unexpected dependency: ${specifier}`);
  };
  let client;
  vm.runInNewContext(source, {
    window: {
      open: (...args) => opens.push(args),
      __ModuleLoader__: { load({ id, factory }) { assert.equal(id, 'dsh-better-plugin-updater'); client = factory(requireHost); } },
    },
  });
  assert.ok(client);

  let pending;
  let registration;
  let removed = 0;
  const slots = {
    inject(name, callback) {
      assert.equal(name, 'plugins.detail.actions');
      pending = callback;
    },
    register(options, component) {
      registration = { options, component };
      return () => { removed++; registration = undefined; };
    },
  };
  const ctx = {
    get() { return undefined; },
    inject(services, callback) {
      if (services.length === 1 && services[0] === 'slots') callback({ slots });
    },
  };
  client.apply(ctx);
  return { client, button, opens, declare: () => pending(), getRegistration: () => registration, removed: () => removed };
}

function subject(kind, name) {
  if (kind === 'item') return { kind, id: name };
  return { kind, pkg: { name }, ...(kind === 'row' ? { row: { rowId: 'entry' } } : {}) };
}

test('Repository link waits for the detail slot without requiring settings services and cleans up', async () => {
  const f = await fixture();
  assert.equal(f.getRegistration(), undefined);
  const dispose = f.declare();
  const { options } = f.getRegistration();
  assert.equal(options.name, 'plugins.detail.actions');
  assert.equal(options.id, 'dsh-better-plugin-updater.github');
  assert.equal(options.inject().bundleName, 'dsh-better-plugin-updater');
  dispose();
  assert.equal(f.removed(), 1);
  assert.equal(f.getRegistration(), undefined);
  const disposeAgain = f.declare();
  assert.ok(f.getRegistration());
  disposeAgain();
  assert.equal(f.removed(), 2);
});

test('Cordis lifecycle disposes the GitHub slot contribution', async () => {
  const { client } = await fixture();
  const ctx = new Context();
  let active = false;
  let removed = 0;
  ctx.provide('slots', {
    inject(name, callback) {
      assert.equal(name, 'plugins.detail.actions');
      const dispose = callback();
      return () => { dispose(); };
    },
    register(options) {
      assert.equal(options.name, 'plugins.detail.actions');
      active = true;
      return () => { active = false; removed++; };
    },
  });
  const fiber = ctx.plugin({ apply: client.mountRepositoryLink });
  await fiber.await();
  assert.equal(active, true);
  await fiber.dispose();
  assert.equal(active, false);
  assert.equal(removed, 1);
});

test('Repository link appears only for this bundle and opens its fixed repository safely', async () => {
  const f = await fixture();
  f.declare();
  const { component, options } = f.getRegistration();
  const injected = options.inject();
  for (const s of [subject('bundle', 'other'), subject('row', 'dsh-better-plugin-updater'), subject('item', 'dsh-better-plugin-updater')]) {
    assert.equal(component({ subject: s, ...injected }), null);
  }
  const action = component({ subject: subject('bundle', 'dsh-better-plugin-updater'), ...injected });
  assert.equal(action.type, f.button);
  assert.equal(action.props.children, 'GitHub');
  assert.equal(action.props.variant, 'outline');
  assert.equal(action.props.size, 'sm');
  assert.equal(f.opens.length, 0);
  action.props.onClick();
  assert.equal(f.opens.length, 1);
  assert.equal(f.opens[0][0], 'https://github.com/Mooling0602/dsh-better-plugin-updater');
  assert.equal(f.opens[0][1], '_blank');
  assert.equal(f.opens[0][2], 'noopener,noreferrer');
});
