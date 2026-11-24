import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createLaunchEnvironmentSnapshot, type LaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';

const [mode, entry, workspace = process.cwd()] = process.argv.slice(2);
assert.ok(mode === 'prepare' || mode === 'verify', 'Expected prepare or verify mode.');
assert.ok(entry, 'Expected the installed DSH profile boot module path.');
assert.ok(process.env.DSH_HOME, 'Expected an isolated DSH_HOME.');

interface ProfileBoot {
  initializeProfileFromDefault(profile: string, platform: string): void;
  runProfile(options: {
    environment: LaunchEnvironmentSnapshot;
    profile: string;
    patchFiles: string[];
    args: string[];
  }): Promise<{
    ctx: { get<T = unknown>(key: string): T };
    shutdown: { shutdown(exitCode: number): Promise<void> };
  }>;
}

const { initializeProfileFromDefault, runProfile } = await import(pathToFileURL(entry).href) as ProfileBoot;
const profile = 'ci-smoke';

if (mode === 'prepare') {
  initializeProfileFromDefault(profile, 'web');
} else {
  const { ctx, shutdown } = await runProfile({
    environment: createLaunchEnvironmentSnapshot([
      { source: 'process', values: Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)) },
    ]),
    profile,
    patchFiles: [],
    args: [],
  });

  let exitCode = 1;
  try {
    const profileContext = ctx.get<{ dir: string }>('profileContext');
    const linkedPackage = `${profileContext.dir}/node_modules/dsh-better-plugin-updater`;
    assert.equal(realpathSync(linkedPackage), realpathSync(workspace), 'The profile must load the repository through its local link.');

    const updater = ctx.get<{ list(): Promise<Array<{ name: string }>> }>('betterPluginUpdater');
    assert.ok(updater, 'The plugin must provide its Host updater service during DSH activation.');
    const bundles = await updater.list();
    assert.ok(bundles.some(bundle => bundle.name === 'dsh-better-plugin-updater'), 'The activated updater service must inventory its own installed bundle.');
    exitCode = 0;
  } finally {
    await shutdown.shutdown(exitCode);
  }
}
