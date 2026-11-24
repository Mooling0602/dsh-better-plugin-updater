import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';

const registryUrl = 'https://registry.npmjs.org/@deepseek-ai%2fdsh';
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** Selects registry versions admitted by the manifest as a GitHub Actions matrix. */
export function discoverDshVersions(manifest: unknown, packument: unknown): string[] {
  if (!isRecord(manifest) || !isRecord(manifest.engines) || typeof manifest.engines.dsh !== 'string' || !manifest.engines.dsh.trim() || !semver.validRange(manifest.engines.dsh)) {
    throw new Error('The manifest must contain a valid, nonempty engines.dsh range.');
  }
  if (!isRecord(packument) || !isRecord(packument.versions)) {
    throw new Error('The registry response must contain a versions object.');
  }
  const range = manifest.engines.dsh;
  const versions = Object.keys(packument.versions);
  if (versions.length === 0 || versions.some(version => !versionPattern.test(version) || !semver.valid(version))) {
    throw new Error('The registry response must contain valid semantic versions.');
  }
  const matches = versions.filter(version => semver.satisfies(version, range, { includePrerelease: true })).sort(semver.compare);
  if (matches.length === 0) throw new Error('No DSH versions match engines.dsh.');
  if (matches.length > 256) throw new Error('The DSH version matrix exceeds the GitHub Actions limit of 256 jobs.');
  return matches;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a manifest and the npm registry, then returns the matrix for compatible DSH versions. */
export async function loadDshMatrix(manifestPath: string, fetchRegistry: typeof fetch = fetch): Promise<string[]> {
  const manifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  const response = await fetchRegistry(registryUrl, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`The npm registry returned HTTP ${response.status}.`);
  const packument: unknown = await response.json();
  return discoverDshVersions(manifest, packument);
}

// The optional argument is a manifest path. stdout contains one compact JSON array for a matrix axis.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: node discover-dsh-versions.ts [manifest-path]');
    const matrix = await loadDshMatrix(process.argv[2] ?? 'package.json');
    process.stdout.write(`${JSON.stringify(matrix)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
