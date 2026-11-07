import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function fixture(mount) {
  const source = await readFile(new URL('../dist/client.js', import.meta.url), 'utf8');
  let client;
  const jsx = (type, props) => ({ type, props });
  const styles = [];
  const document = {
    head: { appendChild(node) { styles.push(node); } },
    getElementById(id) { return styles.find(node => node.id === id) ?? null; },
    createElement(tag) { return { tag, id: '', textContent: '', remove() { const index = styles.indexOf(this); if (index !== -1) styles.splice(index, 1); } }; },
  };
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load({ factory }) {
    client = factory(specifier => {
      if (specifier === 'react') return {};
      if (specifier === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return {};
      throw new Error(`Unexpected dependency: ${specifier}`);
    });
  } } }, document });
  let disposeEffect;
  let registration;
  let disposedSlot = 0;
  const service = { describe() {}, check() {}, apply() {} };
  const locale = { getSnapshot() { return { active: 'en' }; }, subscribe() { return () => {}; } };
  const slots = {
    inject(name, callback) { assert.equal(name, 'plugins.detail.section'); return callback(); },
    register(options, component) { registration = { options, component }; return () => { disposedSlot++; }; },
  };
  const inner = {
    slots, locale,
    get(name) { if (name === 'remote') return { $mount: mount, $on() { return () => {}; } }; if (name === 'remote.betterPluginUpdaterUi') return service; },
    effect(callback) { disposeEffect = callback(); return disposeEffect; },
  };
  client.mountGitHubUpdate({ inject(_dependencies, callback) { callback(inner); } });
  return { get registration() { return registration; }, get disposedSlot() { return disposedSlot; }, get styles() { return styles; }, dispose() { disposeEffect(); }, service, locale };
}

test('GitHub detail waits for the remote and withdraws both contributions', async () => {
  let unmounted = 0;
  let descriptors;
  const f = await fixture(async contribution => { descriptors = contribution.descriptors; return async () => { unmounted++; }; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(descriptors.some(item => item.namespace === 'betterPluginUpdaterUi'), true);
  assert.equal(f.registration.options.name, 'plugins.detail.section');
  assert.equal(f.registration.options.inject().remote, f.service);
  assert.equal(f.registration.options.inject().locale, f.locale);
  assert.equal(f.registration.component({ subject: { kind: 'item', id: 'other' } }), null);
  assert.equal(f.styles.length, 1);
  assert.equal(f.styles[0].id, 'dsh-updater-github-dialog-styles');
  assert.equal(f.styles[0].textContent, '.dsh-updater-github-dialog{width:min(560px,100%)}');
  f.dispose();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.styles.length, 0);
  assert.equal(f.disposedSlot, 1);
  assert.equal(unmounted, 1);
});

test('a late remote mount is withdrawn without installing a stale section', async () => {
  let finish;
  let unmounted = 0;
  const f = await fixture(() => new Promise(resolve => { finish = resolve; }));
  f.dispose();
  finish(async () => { unmounted++; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.registration, undefined);
  assert.equal(unmounted, 1);
});
