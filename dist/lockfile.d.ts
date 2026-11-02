import type { InstalledBundle } from './types.js';
/** Resolve only the root importer's matching dependency, never a similarly named transitive package. */
export declare function lockedRevision(value: unknown, bundle: InstalledBundle): string | undefined;
/** Read at most 4 MiB plus one sentinel byte. Missing or unfamiliar lockfiles yield an unknown baseline. */
export declare function readLockedRevision(profileDir: string, bundle: InstalledBundle): Promise<string | undefined>;
