/** Host-independent entry for consumers, tests, and future UI or index adapters. */
export * from './types.js';
export { Updater } from './updater.js';
export { createProviders } from './providers/index.js';
export { createJsonClient } from './http.js';
export { inferSource, githubRepository, releaseAttachment, normalizeRegistry } from './sources.js';
export { lockedRevision, readLockedRevision } from './lockfile.js';
//# sourceMappingURL=core.js.map