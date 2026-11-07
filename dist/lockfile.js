/** Read-only extraction of a GitHub baseline from the current profile's pnpm lockfile. */
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { githubRepository } from './sources.js';
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}
function revisionFrom(value, repository) {
    if (typeof value !== 'string')
        return undefined;
    const spec = value.split('(')[0];
    const git = githubRepository(spec);
    if (git?.repository.toLowerCase() === repository.toLowerCase() && /^[a-f0-9]{40}$/i.test(git.ref))
        return git.ref.toLowerCase();
    const match = /^(?:https:\/\/)?(?:codeload\.github\.com\/([^/]+\/[^/]+)\/tar\.gz\/|github\.com\/([^/]+\/[^/]+)\/)([a-f0-9]{40})$/i.exec(spec);
    return match && (match[1] ?? match[2])?.toLowerCase() === repository.toLowerCase() ? match[3].toLowerCase() : undefined;
}
/** Resolve only the root importer's matching dependency, never a similarly named transitive package. */
export function lockedRevision(value, bundle) {
    const source = bundle.source && githubRepository(bundle.source);
    if (!source)
        return undefined;
    const root = record(value);
    const importer = record(record(root?.importers)?.['.']);
    const entry = record(record(importer?.dependencies)?.[bundle.name]);
    const specifier = typeof entry?.specifier === 'string' ? githubRepository(entry.specifier) : undefined;
    if (!specifier || specifier.repository.toLowerCase() !== source.repository.toLowerCase() || specifier.ref !== source.ref)
        return undefined;
    const direct = revisionFrom(entry?.version, source.repository);
    if (direct)
        return direct;
    if (typeof entry?.version !== 'string')
        return undefined;
    const packages = record(root?.packages);
    const installed = record(packages?.[entry.version] ?? packages?.[`${bundle.name}@${entry.version}`]);
    const resolution = record(installed?.resolution);
    const tarball = revisionFrom(resolution?.tarball, source.repository);
    if (tarball)
        return tarball;
    const repo = typeof resolution?.repo === 'string' ? githubRepository(resolution.repo) : undefined;
    return repo?.repository.toLowerCase() === source.repository.toLowerCase() && typeof resolution?.commit === 'string'
        && /^[a-f0-9]{40}$/i.test(resolution.commit) ? resolution.commit.toLowerCase() : undefined;
}
/**
 * Read the root lock entry, at most 4 MiB plus one sentinel byte.
 *
 * The three outcomes are distinct on purpose. undefined means no lockfile, so an exact source SHA may still establish the baseline. null means a file that exists but is unreadable, oversized or conflicting, which leaves the baseline unknown and blocks the update. A commit string is the resolved baseline.
 */
export async function readLockedRevision(profileDir, bundle) {
    let handle;
    try {
        handle = await open(join(profileDir, 'pnpm-lock.yaml'), 'r');
        const maximum = 4 * 1024 * 1024;
        const buffer = Buffer.alloc(maximum + 1);
        let length = 0;
        while (length < buffer.length) {
            const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
            if (bytesRead === 0)
                break;
            length += bytesRead;
        }
        if (length > maximum)
            return null;
        return lockedRevision(parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)), { maxAliasCount: 0 }), bundle) ?? null;
    }
    catch (error) {
        return error?.code === 'ENOENT' ? undefined : null;
    }
    finally {
        await handle?.close();
    }
}
//# sourceMappingURL=lockfile.js.map