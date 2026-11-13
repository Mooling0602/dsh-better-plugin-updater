import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../.github/scripts/release-tag.mjs', import.meta.url));
const version = '1.2.3';
const ref = `refs/tags/${version}`;

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'release-tag-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = join(root, 'remote.git');
  const work = join(root, 'work');
  await mkdir(work);
  const env = {
    ...process.env,
    HOME: root,
    XDG_CONFIG_HOME: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ALLOW_PROTOCOL: 'file',
    GIT_AUTHOR_NAME: 'Release Test',
    GIT_AUTHOR_EMAIL: 'release@example.com',
    GIT_COMMITTER_NAME: 'Release Test',
    GIT_COMMITTER_EMAIL: 'release@example.com',
  };
  function git(cwd, ...args) {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
    return result.stdout.trim();
  }
  git(root, 'init', '--bare', remote);
  git(work, 'init');
  git(work, 'remote', 'add', 'origin', remote);
  git(work, 'commit', '--allow-empty', '-m', 'Initial commit');
  const previous = git(work, 'rev-parse', 'HEAD');
  git(work, 'commit', '--allow-empty', '-m', `release: v${version}`);
  const head = git(work, 'rev-parse', 'HEAD');
  function run(sha = head) {
    return spawnSync(process.execPath, [script], {
      cwd: work,
      env: { ...env, VERSION: version, GITHUB_SHA: sha },
      encoding: 'utf8',
    });
  }
  function remoteRef() {
    return git(root, '--git-dir', remote, 'for-each-ref', '--format=%(objectname)', ref);
  }
  function remoteObject(...args) {
    return git(root, '--git-dir', remote, ...args);
  }
  function publishTag(target, annotated) {
    if (annotated) git(work, 'tag', '-a', version, target, '-m', 'Existing release tag');
    else git(work, 'tag', version, target);
    git(work, 'push', 'origin', ref);
    git(work, 'tag', '-d', version);
  }
  return { work, head, previous, git, run, remoteRef, remoteObject, publishTag };
}

function assertSuccess(result) {
  assert.equal(result.status, 0, `script failed: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
}

function assertFailure(result) {
  assert.notEqual(result.status, null, `script did not exit: ${result.error ?? result.signal}`);
  assert.notEqual(result.status, 0, `script unexpectedly succeeded: ${result.stdout}\n${result.stderr}`);
}

test('creates and pushes an annotated tag for the release commit', async t => {
  const f = await fixture(t);
  assert.equal(f.remoteRef(), '');
  assertSuccess(f.run());
  assert.notEqual(f.remoteRef(), '');
  assert.equal(f.remoteObject('cat-file', '-t', ref), 'tag');
  assert.equal(f.remoteObject('rev-parse', `${ref}^{commit}`), f.head);
});

test('accepts an existing remote annotated tag for the same commit without changing it', async t => {
  const f = await fixture(t);
  f.publishTag(f.head, true);
  const before = f.remoteRef();
  assertSuccess(f.run());
  assert.equal(f.remoteRef(), before);
  assert.equal(f.remoteObject('cat-file', '-t', ref), 'tag');
  assert.equal(f.remoteObject('rev-parse', `${ref}^{commit}`), f.head);
});

test('accepts the same annotated tag in the checkout and on the remote', async t => {
  const f = await fixture(t);
  f.publishTag(f.head, true);
  const before = f.remoteRef();
  f.git(f.work, 'fetch', 'origin', `${ref}:${ref}`);
  assertSuccess(f.run());
  assert.equal(f.remoteRef(), before);
});

test('rejects a conflicting local tag even when the remote tag is valid', async t => {
  const f = await fixture(t);
  f.publishTag(f.head, true);
  const before = f.remoteRef();
  f.git(f.work, 'tag', '-a', version, f.previous, '-m', 'Conflicting local tag');
  assertFailure(f.run());
  assert.equal(f.remoteRef(), before);
});

test('rejects a remote tag pointing at another commit without changing it', async t => {
  const f = await fixture(t);
  f.publishTag(f.previous, true);
  const before = f.remoteRef();
  assertFailure(f.run());
  assert.equal(f.remoteRef(), before);
  assert.equal(f.remoteObject('rev-parse', `${ref}^{commit}`), f.previous);
});

test('rejects a remote lightweight tag without changing it', async t => {
  const f = await fixture(t);
  f.publishTag(f.head, false);
  const before = f.remoteRef();
  assertFailure(f.run());
  assert.equal(f.remoteRef(), before);
  assert.equal(f.remoteObject('cat-file', '-t', ref), 'commit');
});

test('rejects a mismatched HEAD without creating a remote tag', async t => {
  const f = await fixture(t);
  assert.equal(f.remoteRef(), '');
  assertFailure(f.run(f.previous));
  assert.equal(f.remoteRef(), '');
});
