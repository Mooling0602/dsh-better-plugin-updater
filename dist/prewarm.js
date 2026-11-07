/** Stage an npm target into the profile's package store before the old package is removed. */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { message } from './i18n.js';
const projectName = 'dsh-plugin-updater-prewarm';
/**
 * Decide whether a checked target can be staged for an offline install.
 *
 * Only a registry package qualifies. Its complete dependency closure becomes reusable once the
 * store holds it. A GitHub release attachment is a remote tarball URL that pnpm resolves over the
 * network on every run, and a Git source is fetched again, so neither can be served from a store.
 * @param source The checked source for one bundle.
 * @param candidate The exact target the pending plan recorded.
 * @returns True when staging can make the later installation work without a network.
 */
export function isPrewarmable(source, candidate) {
    return !!candidate && source.kind === 'npm' && candidate.registry !== undefined
        && candidate.version !== undefined && candidate.url === undefined && candidate.revision === undefined;
}
function defaultRunner(command, args, options) {
    return new Promise(resolve => {
        execFile(command, [...args], { cwd: options.cwd, env: { ...options.env }, timeout: options.timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => resolve({ exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0, output: `${stdout}${stderr}` }));
    });
}
function lastLine(text) {
    return text.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '').pop();
}
/**
 * Ask the package manager which store an install in the profile would use.
 *
 * pnpm derives the store from the file system of the working directory rather than from a global
 * setting, so the question is asked from inside the profile. The answer becomes an explicit flag:
 * a warm run in the temporary directory would otherwise fill a store of its own, and the later
 * installation would find nothing and go back to the network.
 */
async function storeDirectory(run, command, args, profileDir, env, timeoutMs) {
    const result = await run(command, [...args, 'store', 'path'], { cwd: profileDir, env, timeoutMs });
    if (result.exitCode !== 0)
        return undefined;
    const path = lastLine(result.output);
    return path !== undefined && path !== 'undefined' && path !== '' ? path : undefined;
}
/**
 * Give the warm run the profile's own registry configuration.
 *
 * A project outside the profile does not inherit the profile's `.npmrc`, so a scoped registry or
 * an authentication token would be missing and the warm run would fail on a package the real
 * installation could have fetched. The file is copied rather than referenced so the run reads the
 * exact text DSH would read, and the copy is removed with the project.
 */
async function userConfig(profileDir, scratch) {
    let text;
    try {
        text = await readFile(join(profileDir, '.npmrc'), 'utf8');
    }
    catch {
        return [];
    }
    if (text.trim() === '')
        return [];
    const path = join(scratch, '.npmrc');
    await writeFile(path, text, { mode: 0o600 });
    return [`--userconfig=${path}`];
}
/**
 * Populate the profile's package store with one exact npm target and its dependency closure.
 *
 * The package is installed into a throwaway project under the temporary directory, so no profile
 * manifest, lockfile or `node_modules` entry is touched and no bundle is activated. The store is
 * what outlives the run, and the project directory is removed once the run settles.
 * @param source The checked source of the bundle being updated.
 * @param candidate The exact install target the pending plan recorded.
 * @param profileDir Directory of the profile DSH will install into.
 * @param options Package-manager facts and the command runner.
 * @returns Whether the closure is staged, skipped as unsupported, or failed with a diagnostic.
 */
export async function prewarm(source, candidate, profileDir, options = {}) {
    if (!candidate || !isPrewarmable(source, candidate))
        return { status: 'skipped', detail: message('msg.prewarmUnsupported').detail };
    const command = options.command ?? 'pnpm';
    const args = options.args ?? [];
    const run = options.run ?? defaultRunner;
    const timeoutMs = options.timeoutMs ?? 5 * 60_000;
    const env = { ...process.env, ...(options.env ?? {}) };
    let scratch;
    try {
        const store = await storeDirectory(run, command, args, profileDir, env, Math.min(timeoutMs, 60_000));
        if (!store)
            return { status: 'failed', detail: message('msg.prewarmStore').detail };
        scratch = await mkdtemp(join(options.tempRoot ?? tmpdir(), `${projectName}-`));
        await writeFile(join(scratch, 'package.json'), `{"name":"${projectName}","version":"0.0.0","private":true}\n`, { mode: 0o600 });
        const config = await userConfig(profileDir, scratch);
        const result = await run(command, [...args, 'add', candidate.spec, '--save-exact', '--ignore-scripts', '--ignore-workspace',
            `--store-dir=${store}`, ...(candidate.registry === undefined ? [] : [`--registry=${candidate.registry}`]), ...config], { cwd: scratch, env, timeoutMs });
        if (result.exitCode !== 0)
            return { status: 'failed', detail: message('msg.prewarmFailed').detail, diagnostic: result.output };
        return { status: 'ready' };
    }
    catch (error) {
        return { status: 'failed', detail: message('msg.prewarmFailed').detail, diagnostic: error instanceof Error ? error.message : String(error) };
    }
    finally {
        if (scratch)
            await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
    }
}
//# sourceMappingURL=prewarm.js.map