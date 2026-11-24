import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../.github/scripts/release-notes.ts', import.meta.url));

test('release notes use the explicitly selected changelog', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-updater-notes-test-'));
  try {
    const changelog = join(directory, 'CHANGELOG.md');
    await writeFile(changelog, '## Header\nSelected header\n\n## 1.2.3\nSelected release\n\n## Endfix\nSelected endfix\n');
    const result = spawnSync(process.execPath, [script, '1.2.3', '--repo', 'owner/repo', '--changelog', changelog], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Selected header\n\nSelected release\n\nSelected endfix\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
