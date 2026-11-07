import type { InstalledBundle } from './types.js';
/** Resolve only the root importer's matching dependency, never a similarly named transitive package. */
export declare function lockedRevision(value: unknown, bundle: InstalledBundle): string | undefined;
/**
 * Read the root lock entry, at most 4 MiB plus one sentinel byte.
 *
 * The three outcomes are distinct on purpose. undefined means no lockfile, so an exact source SHA may still establish the baseline. null means a file that exists but is unreadable, oversized or conflicting, which leaves the baseline unknown and blocks the update. A commit string is the resolved baseline.
 */
export declare function readLockedRevision(profileDir: string, bundle: InstalledBundle): Promise<string | null | undefined>;
