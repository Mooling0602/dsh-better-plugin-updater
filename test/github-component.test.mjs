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
  const Modal = ({ children, footer, title, className }) => React.createElement('div', { role: 'dialog', 'data-class': className }, title, children, footer);
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
  let registration;
  let notify = () => {};
  const locale = { getSnapshot: () => ({ active: 'zh' }), subscribe: () => () => {} };
  const slots = {
    inject(_name, callback) { return callback(); },
    register(options, view) { registration = { options, view }; return () => {}; },
  };
  const gateway = {
    async $mount() { return async () => {}; },
    $on(_event, callback) { notify = callback; return () => {}; },
  };
  let remote;
  const inner = { slots, locale, get(name) { return name === 'remote' ? gateway : remote; }, effect(callback) { return callback(); } };
  client.mountGitHubUpdate({ inject(_deps, callback) { callback(inner); } });
  await new Promise(resolve => setImmediate(resolve));
  return { view: registration.view, setRemote(value) { remote = value; }, getProps() { return registration.options.inject(); }, notify() { notify(); } };
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
  await act(async () => { root = TestRenderer.create(React.createElement(f.view, { ...f.getProps(), subject: { kind: 'bundle', pkg: { name: 'git-plugin' } } })); });
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
