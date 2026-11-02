import { Config } from './config.js';
import { createUpdaterCommand } from './commands.js';
import { createUpdaterTool } from './tools.js';
import { createJsonClient } from './http.js';
import { resolveGithubToken } from './credentials.js';
import { resolveLanguage } from './i18n.js';
import { readLockedRevision } from './lockfile.js';
import { createProviders } from './providers/index.js';
import { Updater } from './updater.js';
import { ScheduledUpdates } from './scheduled.js';
export { Config } from './config.js';
/** The host owns profile selection, package writes, compatibility checks, and command dispatch. */
export const inject = ['pluginManager', 'profileContext', 'commands'];
/** Register a profile-local service, a user command, and an optional read-only agent tool. */
export function apply(ctx, rawConfig = {}) {
    const config = Config.parse(rawConfig);
    const manager = ctx.get('pluginManager');
    const profile = ctx.get('profileContext');
    const commands = ctx.get('commands');
    if (!manager || !profile?.dir || !commands || typeof manager.listBundles !== 'function'
        || typeof manager.registries !== 'function' || typeof manager.removeBundle !== 'function'
        || typeof manager.installBundle !== 'function')
        throw new Error('A compatible managed DSH profile is required.');
    const updater = new Updater({ manager,
        client: createJsonClient({ timeoutMs: config.requestTimeoutMs, maxBytes: config.maxMetadataBytes,
            resolveGithubToken: () => resolveGithubToken(config.githubTokenEnv, ctx.get('credentials')) }),
        providers: createProviders(), overrides: config.sources, planTtlMs: config.planTtlMs,
        currentRevision: bundle => readLockedRevision(profile.dir, bundle) });
    const scheduled = new ScheduledUpdates(profile.dir, updater);
    ctx.provide('betterPluginUpdater', updater);
    ctx.effect(() => () => updater.dispose());
    ctx.effect(() => {
        let startup;
        const timer = setImmediate(() => { startup = scheduled.startup().catch(error => console.error('[better-plugin-updater] Scheduled update queue:', error instanceof Error ? error.message : 'failed')); });
        return async () => { clearImmediate(timer); await startup; };
    });
    ctx.effect(() => commands.register(createUpdaterCommand(updater, {
        scheduled,
        language: clientLanguage => resolveLanguage(config.language, ctx.get('settings'), clientLanguage),
    })));
    ctx.inject(['tools'], toolsContext => {
        const tools = toolsContext.get('tools');
        toolsContext.effect(() => tools.register(createUpdaterTool(updater)));
    });
}
//# sourceMappingURL=index.js.map