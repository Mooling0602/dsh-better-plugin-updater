import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { ScheduledUpdates } from '../dist/scheduled.js';

const makePlan = (name = 'plugin', version = '2.0.0') => ({
  id: crypto.randomUUID(), createdAt: new Date().toISOString(), expiresAt: new Date().toISOString(), command: `/plugin-updater update ${name}`,
  bundle: { name, version: '1.0.0', source: `${name}@^1`, enabled: true, installed: true, removable: true, availability: 'profile' },
  source: { kind: 'npm', packageName: name, registry: 'https://registry.test/', channel: 'latest', pinned: false },
  candidate: { spec: `${name}@${version}`, version, registry: 'https://registry.test/' }, warnings: [],
});
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-updater-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const calls = [];
  const updater = { async applyDeferred(plan) { calls.push(plan); return { status: 'updated', message: 'ok' }; } };
  return { dir, file: join(dir, '.better-plugin-updater-queue.json'), updater, calls, queue: new ScheduledUpdates(dir, updater) };
}

test('same-process startup cannot execute queued plans and pending targets replace by name', async t => {
  const f = await fixture(t);
  await f.queue.schedule([makePlan(), makePlan('other')]);
  await f.queue.schedule([makePlan('plugin', '3.0.0')]);
  assert.deepEqual((await f.queue.list()).map(e => e.plan.candidate.version), ['3.0.0', '2.0.0']);
  await f.queue.startup();
  assert.equal(f.calls.length, 0);
  assert.equal(await f.queue.cancel(), 2);
  assert.deepEqual(await f.queue.list(), []);
});

test('next process starts each approved target once and retains result', async t => {
  const f = await fixture(t);
  await f.queue.schedule([makePlan()]);
  const saved = JSON.parse(await readFile(f.file, 'utf8'));
  saved.entries[0].creator = 'previous-process'; saved.entries[0].pid = 2147483647;
  await writeFile(f.file, JSON.stringify(saved));
  await f.queue.startup();
  assert.equal(f.calls.length, 1);
  assert.equal((await f.queue.list())[0].state, 'done');
  await new ScheduledUpdates(f.dir, f.updater).startup();
  assert.equal(f.calls.length, 1);
});

test('interrupted and failed tasks are retained and never automatically replayed', async t => {
  const f = await fixture(t);
  await f.queue.schedule([makePlan('broken'), makePlan('interrupted')]);
  const saved = JSON.parse(await readFile(f.file, 'utf8'));
  for (const e of saved.entries) { e.creator = 'previous-process'; e.pid = 2147483647; }
  saved.entries[1].state = 'running';
  await writeFile(f.file, JSON.stringify(saved));
  f.updater.applyDeferred = async plan => { f.calls.push(plan); throw new Error('stale baseline'); };
  await f.queue.startup();
  const entries = await f.queue.list();
  assert.equal(entries[0].state, 'failed'); assert.match(entries[0].outcome, /stale baseline/);
  assert.equal(entries[1].state, 'running');
  assert.equal(f.calls.length, 1);
  assert.equal(await f.queue.cancel(), 0);
});

test('a real new process executes a task from an exited process once', async t => {
  const f = await fixture(t);
  const run = promisify(execFile);
  const moduleUrl = pathToFileURL(join(process.cwd(), 'dist/scheduled.js')).href;
  const script = `import {ScheduledUpdates} from ${JSON.stringify(moduleUrl)}; const q = new ScheduledUpdates(process.argv[1], { async applyDeferred() { return {status:'updated', message:'child applied'}; } }); if (process.argv[2] === 'write') await q.schedule([JSON.parse(process.argv[3])]); else await q.startup();`;
  await run(process.execPath, ['--input-type=module', '-e', script, f.dir, 'write', JSON.stringify(makePlan())]);
  await run(process.execPath, ['--input-type=module', '-e', script, f.dir, 'run']);
  const entries = await f.queue.list();
  assert.equal(entries[0].state, 'done');
  assert.match(entries[0].outcome, /child applied/);
});

test('live creator and corrupt queues fail closed', async t => {
  const f = await fixture(t);
  await f.queue.schedule([makePlan()]);
  const saved = JSON.parse(await readFile(f.file, 'utf8'));
  saved.entries[0].creator = 'another-live-instance'; saved.entries[0].pid = process.pid;
  await writeFile(f.file, JSON.stringify(saved));
  await f.queue.startup();
  assert.equal(f.calls.length, 0);
  await writeFile(f.file, '{not json');
  await assert.rejects(f.queue.cancel());
});
