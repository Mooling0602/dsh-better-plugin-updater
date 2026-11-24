import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../.github/scripts/dsh-link-smoke.ts', import.meta.url));
const markerName = 'DSH_LINK_SMOKE_MARKER';

test('verify uses a launch environment snapshot and shuts down after checking the local link', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-link-smoke-'));
  try {
    const workspace = join(root, 'workspace');
    const profile = join(root, 'profile');
    await mkdir(workspace);
    const profileBoot = join(root, 'profile-boot.mjs');
    const events = join(root, 'events.json');
    await mkdir(join(profile, 'node_modules'), { recursive: true });
    await symlink(workspace, join(profile, 'node_modules', 'dsh-better-plugin-updater'), 'dir');
    await writeFile(profileBoot, `
      import assert from 'node:assert/strict';
      import { appendFile } from 'node:fs/promises';
      export async function runProfile(options) {
        assert.equal(options.profile, 'ci-smoke');
        assert.deepEqual(options.patchFiles, []);
        assert.deepEqual(options.args, []);
        assert.equal(typeof options.environment.get, 'function');
        assert.equal(typeof options.environment.getFrom, 'function');
        assert.deepEqual(options.environment.get(${JSON.stringify(markerName)}), { value: 'smoke-marker', source: 'process' });
        assert.equal(options.environment.getFrom(${JSON.stringify(markerName)}, ['process'])?.value, 'smoke-marker');
        const events = {
          profile: options.profile,
          marker: options.environment.get(${JSON.stringify(markerName)})?.value,
          fromMarker: options.environment.getFrom(${JSON.stringify(markerName)}, ['process'])?.value,
        };
        const updater = {
          async list() {
            events.listCalled = true;
            return [{ name: 'dsh-better-plugin-updater' }];
          },
        };
        const context = {
          get(key) {
            if (key === 'profileContext') return { dir: ${JSON.stringify(profile)} };
            if (key === 'betterPluginUpdater') return updater;
            throw new Error('Unexpected context key: ' + key);
          },
        };
        return {
          ctx: context,
          shutdown: { async shutdown(exitCode) {
            events.exitCode = exitCode;
            await appendFile(${JSON.stringify(events)}, JSON.stringify(events));
          } },
        };
      }
    `);

    const result = spawnSync(process.execPath, [script, 'verify', profileBoot, workspace], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: join(root, 'dsh-home'), [markerName]: 'smoke-marker' },
    });

    assert.equal(result.status, 0, `script failed: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
    assert.deepEqual(JSON.parse(await readFile(events, 'utf8')), {
      profile: 'ci-smoke',
      marker: 'smoke-marker',
      fromMarker: 'smoke-marker',
      listCalled: true,
      exitCode: 0,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
