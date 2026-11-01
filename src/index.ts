/** Cordis Host entry. All package writes originate from an explicit user slash command. */
import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.js';
import { createUpdaterCommand } from './commands.js';
import type { UpdaterCommand } from './commands.js';
import { createUpdaterTool } from './tools.js';
import type { UpdaterTool } from './tools.js';
import { createJsonClient } from './http.js';
import { resolveGithubToken } from './credentials.js';
import type { CredentialReferences } from './credentials.js';
import { resolveLanguage } from './i18n.js';
import type { LocaleSettings } from './i18n.js';
import { readLockedRevision } from './lockfile.js';
import { createProviders } from './providers/index.js';
import { Updater } from './updater.js';
import type { PluginManager } from './types.js';

export { Config } from './config.js';
export type { UpdaterConfig } from './config.js';

interface Commands { register(definition: UpdaterCommand): () => void }
interface Tools { register(definition: UpdaterTool): () => void }

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Read-only checking and explicit plan execution for the current profile. Not a Remote service. */
    betterPluginUpdater: Updater;
  }
}

/** The host owns profile selection, package writes, compatibility checks, and command dispatch. */
export const inject = ['pluginManager', 'profileContext', 'commands'];

/** Register a profile-local service, a user command, and an optional read-only agent tool. */
export function apply(ctx: Context, rawConfig: unknown = {}): void {
  const config = Config.parse(rawConfig);
  const manager = ctx.get('pluginManager') as PluginManager | undefined;
  const profile = ctx.get('profileContext') as { dir?: string } | undefined;
  const commands = ctx.get('commands') as Commands | undefined;
  if (!manager || !profile?.dir || !commands || typeof manager.listBundles !== 'function'
    || typeof manager.registries !== 'function' || typeof manager.removeBundle !== 'function'
    || typeof manager.installBundle !== 'function') throw new Error('A compatible managed DSH profile is required.');
  const updater = new Updater({ manager,
    client: createJsonClient({ timeoutMs: config.requestTimeoutMs, maxBytes: config.maxMetadataBytes,
      resolveGithubToken: () => resolveGithubToken(config.githubTokenEnv, ctx.get('credentials') as CredentialReferences | undefined) }),
    providers: createProviders(), overrides: config.sources, planTtlMs: config.planTtlMs,
    currentRevision: bundle => readLockedRevision(profile.dir!, bundle) });
  ctx.provide('betterPluginUpdater', updater);
  ctx.effect(() => () => updater.dispose());
  ctx.effect(() => commands.register(createUpdaterCommand(updater, {
    language: clientLanguage => resolveLanguage(config.language, ctx.get('settings') as LocaleSettings | undefined, clientLanguage),
  })));
  ctx.inject(['tools'], toolsContext => {
    const tools = toolsContext.get('tools') as Tools;
    toolsContext.effect(() => tools.register(createUpdaterTool(updater)));
  });
}
