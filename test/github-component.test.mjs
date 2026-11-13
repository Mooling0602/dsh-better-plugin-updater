import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import TestRenderer, { act } from 'react-test-renderer';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function component() {
  const source = await readFile(new URL('../dist/client.js', import.meta.url), 'utf8');
  let client;
  const Button = ({ children, icon, ...props }) => React.createElement('button', props, icon, children);
  const Modal = ({ children, footer, title, className, onClose }) => React.createElement('div', { role: 'dialog', 'data-class': className, onClose }, title, children, footer);
  const primitive = new Proxy({ Button, Modal }, { get(target, key) {
    return target[key] ?? (() => React.createElement('i', { 'data-icon': String(key) }));
  } });
  vm.runInNewContext(source, { window: { __ModuleLoader__: { load({ factory }) {
    client = factory(name => {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return jsxRuntime;
      if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitive;
      throw new Error(`Unexpected dependency: ${name}`);
    });
  } } } });
  const registrations = new Map();
  let notify = () => {};
  const locale = { getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} };
  const slots = {
    inject(_name, callback) { return callback(); },
    register(options, view) { registrations.set(options.name, { options, view }); return () => { registrations.delete(options.name); }; },
  };
  const gateway = {
    async $mount() { return async () => {}; },
    $on(_event, callback) { notify = callback; return () => {}; },
  };
  let remote;
  const inner = { slots, locale, get(name) { return name === 'remote' ? gateway : remote; }, effect(callback) { return callback(); } };
  client.mountGitHubUpdate({ inject(_deps, callback) { callback(inner); } });
  await new Promise(resolve => setImmediate(resolve));
  const detail = registrations.get('plugins.detail.section');
  const overlay = registrations.get('shell.overlay');
  return { view: detail.view, overlay: overlay.view, setRemote(value) { remote = value; }, getProps() { return detail.options.inject(); }, getOverlayProps() { return overlay.options.inject(); }, notify() { notify(); } };
}

function button(root, text) {
  return root.findAllByType('button').find(item => item.children.some(child => child === text));
}

const candidate = 'b'.repeat(40);
const installed = 'a'.repeat(40);
const check = { result: { status: 'pinned', bundle: { version: '1.0.0' }, source: { kind: 'github-source', pinned: true, currentRevision: installed }, message: 'changed' }, confirmation: { id: 'plan-id', plan: { candidate: { revision: candidate, spec: `github:owner/repo#${candidate}` }, warningDetails: [] } } };

test('GitHub detail checks automatically and needs explicit risk acknowledgement', async () => {
  const f = await component();
  const calls = [];
  f.setRemote({
    async describe(name) { calls.push(['describe', name]); return { ok: true, value: JSON.stringify({ name, repository: 'owner/repo', kind: 'github-source', installed, fixedPin: true }) }; },
    async check(name) { calls.push(['check', name]); return { ok: true, value: JSON.stringify(check) }; },
    async apply(id, accepted, language) { calls.push(['apply', id, accepted, language]); return { ok: true, value: JSON.stringify({ status: 'failed', text: 'Manual recovery required.' }) }; },
  });
  let root;
  await act(async () => { root = TestRenderer.create(React.createElement(React.Fragment, null,
    React.createElement(f.view, { ...f.getProps(), subject: { kind: 'bundle', pkg: { name: 'git-plugin' } } }),
    React.createElement(f.overlay, f.getOverlayProps()))); });
  assert.deepEqual(calls, [['describe', 'git-plugin'], ['check', 'git-plugin']]);
  const summary = root.root.findByProps({ 'aria-expanded': false });
  await act(async () => { summary.props.onClick(); });
  await act(async () => { button(root.root, '更新').props.onClick(); });
  assert.equal(root.root.findByProps({ role: 'dialog' }).props['data-class'], 'dsh-updater-github-dialog');
  const update = root.root.findAllByType('button').filter(item => item.children.some(child => child === '更新')).at(-1);
  assert.equal(update.props.disabled, true);
  assert.equal(calls.length, 2);
  await act(async () => { root.root.findByType('input').props.onChange({ currentTarget: { checked: true } }); });
  assert.equal(update.props.disabled, false);
  await act(async () => { update.props.onClick(); });
  assert.deepEqual(calls.at(-1), ['apply', 'plan-id', true, 'zh']);
  assert.match(JSON.stringify(root.toJSON()), /Manual recovery required/);
  await act(async () => { root.unmount(); });
});

for (const [kind, status] of [['github-source', 'updated'], ['github-release', 'failed'], ['github-release', 'restart-required'], ['github-source', 'disconnect']]) {
  test(`${kind} keeps the update dialog and ${status} result when the detail unmounts`, async () => {
    const f = await component();
    let resolveApply, rejectApply;
    let applyCalls = 0;
    f.setRemote({
      async describe(name) { return { ok: true, value: JSON.stringify({ name, repository: 'owner/repo', kind, installed, fixedPin: kind === 'github-source' }) }; },
      async check() { return { ok: true, value: JSON.stringify(check) }; },
      async apply() { applyCalls++; return new Promise((resolve, reject) => { resolveApply = resolve; rejectApply = reject; }); },
    });
    const subject = { kind: 'bundle', pkg: { name: 'git-plugin' } };
    const render = showDetail => React.createElement(React.Fragment, null,
      showDetail ? React.createElement(f.view, { ...f.getProps(), subject }) : null,
      React.createElement(f.overlay, f.getOverlayProps()));
    let root;
    await act(async () => { root = TestRenderer.create(render(true)); });
    await act(async () => { root.root.findByProps({ 'aria-expanded': false }).props.onClick(); });
    await act(async () => { button(root.root, '更新').props.onClick(); });
    await act(async () => { root.root.findByType('input').props.onChange({ currentTarget: { checked: true } }); });
    const dialog = root.root.findByProps({ role: 'dialog' });
    const update = root.root.findAllByType('button').filter(item => item.children.some(child => child === '更新')).at(-1);
    await act(async () => { update.props.onClick(); update.props.onClick(); dialog.props.onClose(); f.notify(); root.update(render(false)); });
    assert.equal(applyCalls, 1);
    assert.equal(root.root.findByProps({ 'data-github-update': 'running' }).props['data-github-update'], 'running');
    await act(async () => { root.root.findByProps({ role: 'dialog' }).props.onClose(); });
    assert.equal(root.root.findAllByProps({ role: 'dialog' }).length, 1);
    await act(async () => {
      if (status === 'disconnect') rejectApply(new Error('Connection lost.'));
      else resolveApply({ ok: true, value: JSON.stringify({ status, text: status === 'updated' ? 'Installed successfully.' : status === 'restart-required' ? 'Restart required.' : 'Manual recovery required.' }) });
    });
    assert.equal(root.root.findAllByProps({ 'data-github-update': 'done' }).length, 1);
    assert.match(JSON.stringify(root.toJSON()), status === 'updated' ? /Installed successfully/ : status === 'failed' ? /Manual recovery required/ : status === 'restart-required' ? /Restart required/ : /Connection lost/);
    await act(async () => { button(root.root, '完成').props.onClick(); });
    assert.equal(root.root.findAllByProps({ role: 'dialog' }).length, 0);
    await act(async () => { root.unmount(); });
  });
}

test('an inventory change removes a stale section when the source becomes npm', async () => {
  const f = await component();
  let github = true;
  let checks = 0;
  f.setRemote({
    async describe(name) { return { ok: true, value: JSON.stringify(github ? { name, repository: 'owner/repo', kind: 'github-source', installed, fixedPin: true } : null) }; },
    async check() { checks++; return { ok: true, value: JSON.stringify(check) }; },
    async apply() { throw new Error('Unexpected update'); },
  });
  let root;
  await act(async () => { root = TestRenderer.create(React.createElement(f.view, { ...f.getProps(), subject: { kind: 'bundle', pkg: { name: 'plugin' } } })); });
  assert.equal(checks, 1);
  assert.notEqual(root.toJSON(), null);
  github = false;
  await act(async () => { f.notify(); });
  assert.equal(root.toJSON(), null);
  assert.equal(checks, 1);
  await act(async () => { root.unmount(); });
});

test('npm details do not mount a GitHub section or start a source check', async () => {
  const f = await component();
  let checks = 0;
  f.setRemote({ async describe() { return { ok: true, value: 'null' }; }, async check() { checks++; }, async apply() { throw new Error('Unexpected update'); } });
  let root;
  await act(async () => { root = TestRenderer.create(React.createElement(f.view, { ...f.getProps(), subject: { kind: 'bundle', pkg: { name: 'npm-plugin' } } })); });
  assert.equal(root.toJSON(), null);
  assert.equal(checks, 0);
  await act(async () => { root.unmount(); });
});
