import { execFileSync, spawnSync } from 'node:child_process';

const version = process.env.VERSION;
const expected = process.env.GITHUB_SHA;
if (!version || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid release version.');
if (!expected || !/^[0-9a-f]{40}$/.test(expected)) throw new Error('Invalid release commit.');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const ref = `refs/tags/${version}`;
if (git('rev-parse', 'HEAD') !== expected) throw new Error('The checkout does not match the release commit.');

const local = spawnSync('git', ['show-ref', '--verify', '--quiet', ref]);
if (local.error || (local.status !== 0 && local.status !== 1)) throw new Error('Cannot inspect the local release tag.');
if (local.status === 0 && (git('cat-file', '-t', ref) !== 'tag' || git('rev-parse', `${ref}^{commit}`) !== expected)) {
  throw new Error('The local release tag is not an annotated tag for the release commit.');
}

function remoteTag() {
  const lines = git('ls-remote', '--tags', 'origin', ref, `${ref}^{}`);
  const refs = new Map(lines ? lines.split('\n').map(line => { const [sha, name] = line.split('\t'); return [name, sha]; }) : []);
  if (refs.has(ref) && refs.get(`${ref}^{}`) !== expected) throw new Error('The remote release tag is not an annotated tag for the release commit.');
  return refs.has(ref);
}

if (!remoteTag()) {
  if (local.status !== 0) {
    git('config', 'user.name', 'github-actions[bot]');
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
    git('tag', '-a', version, '-m', `commit ${git('rev-parse', '--short=7', 'HEAD')}`);
  }
  git('push', 'origin', ref);
  if (!remoteTag()) throw new Error('The remote release tag was not found after pushing.');
}
