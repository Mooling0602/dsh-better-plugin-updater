/** Read-only extraction of a GitHub baseline from the current profile's pnpm lockfile. */
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { githubRepository } from './sources.js';
import type { InstalledBundle } from './types.js';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function revisionFrom(value: unknown, repository: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const spec = value.split('(')[0]!;
  const git = githubRepository(spec);
  if (git?.repository.toLowerCase() === repository.toLowerCase() && /^[a-f0-9]{40}$/i.test(git.ref)) return git.ref.toLowerCase();
  const match = /^(?:https:\/\/)?(?:codeload\.github\.com\/([^/]+\/[^/]+)\/tar\.gz\/|github\.com\/([^/]+\/[^/]+)\/)([a-f0-9]{40})$/i.exec(spec);
  return match && (match[1] ?? match[2])?.toLowerCase() === repository.toLowerCase() ? match[3]!.toLowerCase() : undefined;
}

/** Resolve only the root importer's matching dependency, never a similarly named transitive package. */
export function lockedRevision(value: unknown, bundle: InstalledBundle): string | undefined {
  const source = bundle.source && githubRepository(bundle.source);
  if (!source) return undefined;
  const root = record(value);
  const importer = record(record(root?.importers)?.['.']);
  const entry = record(record(importer?.dependencies)?.[bundle.name]);
  const specifier = typeof entry?.specifier === 'string' ? githubRepository(entry.specifier) : undefined;
  if (!specifier || specifier.repository.toLowerCase() !== source.repository.toLowerCase() || specifier.ref !== source.ref) return undefined;
  const direct = revisionFrom(entry?.version, source.repository);
  if (direct) return direct;
  if (typeof entry?.version !== 'string') return undefined;
  const packages = record(root?.packages);
  const installed = record(packages?.[entry.version] ?? packages?.[`${bundle.name}@${entry.version}`]);
  const resolution = record(installed?.resolution);
  const tarball = revisionFrom(resolution?.tarball, source.repository);
  if (tarball) return tarball;
  const repo = typeof resolution?.repo === 'string' ? githubRepository(resolution.repo) : undefined;
  return repo?.repository.toLowerCase() === source.repository.toLowerCase() && typeof resolution?.commit === 'string'
    && /^[a-f0-9]{40}$/i.test(resolution.commit) ? resolution.commit.toLowerCase() : undefined;
}

/** Read at most 4 MiB plus one sentinel byte. Missing or unfamiliar lockfiles yield an unknown baseline. */
export async function readLockedRevision(profileDir: string, bundle: InstalledBundle): Promise<string | undefined> {
  let handle;
  try {
    handle = await open(join(profileDir, 'pnpm-lock.yaml'), 'r');
    const maximum = 4 * 1024 * 1024;
    const buffer = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > maximum) return undefined;
    return lockedRevision(parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)), { maxAliasCount: 0 }), bundle);
  } catch { return undefined; }
  finally { await handle?.close(); }
}
