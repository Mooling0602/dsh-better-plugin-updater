import { createUpdaterCommand } from './commands.js';
import { createUpdaterTool } from './tools.js';
import { createJsonClient } from './http.js';
import { resolveGithubToken } from './credentials.js';
import { resolveLanguage } from './i18n.js';
import { readLockedRevision } from './lockfile.js';
import { createProviders } from './providers/index.js';
import { Updater } from './updater.js';
export { Config } from './config.js';
/** The host owns profile selection, package writes, compatibility checks, and command dispatch. */
export const inject = ['pluginManager', 'profileContext', 'commands'];
/** Register a profile-local service, a user command, and an optional read-only agent tool. */
export function apply(ctx, rawConfig = {}) {
    const config = rawConfig;
    const manager = ctx.get('pluginManager');
    const profile = ctx.get('profileContext');
    const commands = ctx.get('commands');
    if (!manager || !profile?.dir || !commands || typeof manager.listBundles !== 'function'
        || typeof manager.registries !== 'function' || typeof manager.removeBundle !== 'function'
        || typeof manager.installBundle !== 'function')
        throw new Error('A compatible managed DSH profile is required.');
    const updater = new Updater({ manager,
        client: createJsonClient({ timeoutMs: () => config.requestTimeoutMs.get(), maxBytes: () => config.maxMetadataBytes.get(),
            resolveGithubToken: () => resolveGithubToken(config.githubTokenEnv.get(), ctx.get('credentials')) }),
        providers: createProviders(), overrides: config.sources, planTtlMs: () => config.planTtlMs.get(),
        currentRevision: bundle => readLockedRevision(profile.dir, bundle),
        prewarm: { profileDir: profile.dir, ...(profile.packageManager === undefined ? {} : {
                command: profile.packageManager.command, args: profile.packageManager.args, env: profile.packageManager.env
            }) } });
    ctx.provide('betterPluginUpdater', updater);
    ctx.effect(() => () => updater.dispose());
    ctx.effect(() => commands.register(createUpdaterCommand(updater, {
        language: clientLanguage => resolveLanguage(config.language.get(), ctx.get('settings'), clientLanguage),
    })));
    ctx.inject(['tools'], toolsContext => {
        const tools = toolsContext.get('tools');
        toolsContext.effect(() => tools.register(createUpdaterTool(updater)));
    });
}
//# sourceMappingURL=index.js.map