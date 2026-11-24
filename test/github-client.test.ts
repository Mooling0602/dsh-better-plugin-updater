import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

type Descriptor = { namespace: string };
type Contribution = { descriptors: Descriptor[] };
type RegistrationOptions = { name: string; inject: () => Record<string, unknown> };
type Component = (props: { subject: { kind: string; id: string } }) => unknown;
type Registration = { options: RegistrationOptions; component: Component };
type StyleElement = { tag: string; id: string; textContent: string; remove(): void };
type HostInner = {
  slots: {
    inject<T>(name: string, callback: () => T): T;
    register(options: RegistrationOptions, component: Component): () => void;
  };
  locale: { getSnapshot(): { active: string }; subscribe(): () => void };
  get(name: string): unknown;
  effect(callback: () => () => void): () => void;
};
type ClientBridge = { mountGitHubUpdate(context: { inject(dependencies: readonly string[], callback: (inner: HostInner) => void): void }): void };

async function fixture(mount: (contribution: Contribution) => Promise<() => Promise<void>>) {
  const source = await readFile(new URL('../dist/client.js', import.meta.url), 'utf8');
  let client: ClientBridge | undefined;
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const styles: StyleElement[] = [];
  const document = {
    head: { appendChild(node: StyleElement) { styles.push(node); } },
    getElementById(id: string) { return styles.find(node => node.id === id) ?? null; },
    createElement(tag: string): StyleElement { return { tag, id: '', textContent: '', remove() { const index = styles.indexOf(this); if (index !== -1) styles.splice(index, 1); } }; },
  };
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load({ factory }: { factory: (resolve: (specifier: string) => unknown) => ClientBridge }) {
    client = factory((specifier: string) => {
      if (specifier === 'react') return {};
      if (specifier === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return {};
      throw new Error(`Unexpected dependency: ${specifier}`);
    });
  } } }, document });
  let disposeEffect!: () => void;
  const registrations = new Map<string, Registration>();
  let disposedSlot = 0;
  const service = { describe() {}, check() {}, apply() {} };
  const locale = { getSnapshot() { return { active: 'en' }; }, subscribe() { return () => {}; } };
  const slots = {
    inject<T>(name: string, callback: () => T): T { assert.ok(['plugins.detail.section', 'shell.overlay'].includes(name)); return callback(); },
    register(options: RegistrationOptions, component: Component) { registrations.set(options.name, { options, component }); return () => { disposedSlot++; }; },
  };
  const inner = {
    slots, locale,
    get(name: string) { if (name === 'remote') return { $mount: mount, $on() { return () => {}; } }; if (name === 'remote.betterPluginUpdaterUi') return service; return undefined; },
    effect(callback: () => () => void) { disposeEffect = callback(); return disposeEffect; },
  };
  if (!client) throw new Error('The client factory did not run.');
  client.mountGitHubUpdate({ inject(_dependencies, callback) { callback(inner); } });
  return { get registration() { return registrations.get('plugins.detail.section'); }, get overlay() { return registrations.get('shell.overlay'); }, get disposedSlot() { return disposedSlot; }, get styles() { return styles; }, dispose() { disposeEffect(); }, service, locale };
}

test('GitHub detail waits for the remote and withdraws both contributions', async () => {
  let unmounted = 0;
  let descriptors!: Descriptor[];
  const f = await fixture(async (contribution: Contribution) => { descriptors = contribution.descriptors; return async () => { unmounted++; }; });
  await new Promise(resolve => setImmediate(resolve));
  const registration = f.registration;
  const overlay = f.overlay;
  assert.ok(registration);
  assert.ok(overlay);
  assert.equal(descriptors.some(item => item.namespace === 'betterPluginUpdaterUi'), true);
  assert.equal(registration.options.name, 'plugins.detail.section');
  assert.equal(registration.options.inject().remote, f.service);
  assert.equal(registration.options.inject().locale, f.locale);
  assert.equal(overlay.options.name, 'shell.overlay');
  assert.equal(overlay.options.inject().dialog, registration.options.inject().dialog);
  assert.equal(registration.component({ subject: { kind: 'item', id: 'other' } }), null);
  assert.equal(f.styles.length, 1);
  assert.equal(f.styles[0]?.id, 'dsh-updater-github-dialog-styles');
  assert.equal(f.styles[0]?.textContent, '.dsh-updater-github-dialog{width:min(560px,100%)}.dsh-updater-github-dialog.running > div:first-child > div:first-child > button{visibility:hidden}');
  f.dispose();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.styles.length, 0);
  assert.equal(f.disposedSlot, 2);
  assert.equal(unmounted, 1);
});

test('a late remote mount is withdrawn without installing a stale section', async () => {
  let finish!: (release: () => Promise<void>) => void;
  let unmounted = 0;
  const f = await fixture(() => new Promise(resolve => { finish = resolve; }));
  f.dispose();
  finish(async () => { unmounted++; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.registration, undefined);
  assert.equal(unmounted, 1);
});
