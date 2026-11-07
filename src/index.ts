/** Cordis Host entry. Package writes require an explicitly confirmed user operation. */
import type { Context } from '@deepseek-ai/cordis';
import type { UpdaterConfig } from './config.js';
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
import { GitHubUi } from './github-ui.js';
import { GitHubRemote } from './github-remote.js';
import type { PluginManager } from './types.js';

export { Config } from './config.js';
export type { UpdaterConfig } from './config.js';

interface Commands { register(definition: UpdaterCommand): () => void }
interface Tools { register(definition: UpdaterTool): () => void }

/** Application-owned package manager invocation; environment applies only to package operations. */
interface ProfileContextFacts {
  readonly dir?: string;
  readonly packageManager?: { readonly command: string; readonly args: readonly string[]; readonly env: Readonly<Record<string, string>> };
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Read-only checking and confirmed updates for the current profile. Not a Remote service. */
    betterPluginUpdater: Updater;
  }
}

/** The host owns profile selection, package writes, compatibility checks, and command dispatch. */
export const inject = ['pluginManager', 'profileContext', 'commands'];

/** Register a profile-local service, a user command, and an optional read-only agent tool. */
export function apply(ctx: Context, rawConfig: unknown = {}): void {
  const config = rawConfig as UpdaterConfig;
  const manager = ctx.get('pluginManager') as PluginManager | undefined;
  const profile = ctx.get('profileContext') as ProfileContextFacts | undefined;
  const commands = ctx.get('commands') as Commands | undefined;
  if (!manager || !profile?.dir || !commands || typeof manager.listBundles !== 'function'
    || typeof manager.registries !== 'function' || typeof manager.removeBundle !== 'function'
    || typeof manager.installBundle !== 'function') throw new Error('A compatible managed DSH profile is required.');
  const updater = new Updater({ manager,
    client: createJsonClient({ timeoutMs: () => config.requestTimeoutMs.get(), maxBytes: () => config.maxMetadataBytes.get(),
      resolveGithubToken: () => resolveGithubToken(config.githubTokenEnv.get(), ctx.get('credentials') as CredentialReferences | undefined) }),
    providers: createProviders(), overrides: config.sources, planTtlMs: () => config.planTtlMs.get(),
    currentRevision: bundle => readLockedRevision(profile.dir!, bundle),
    prewarm: { profileDir: profile.dir, ...(profile.packageManager === undefined ? {} : {
      command: profile.packageManager.command, args: profile.packageManager.args, env: profile.packageManager.env }) } });
  ctx.provide('betterPluginUpdater', updater);
  new GitHubRemote(ctx, new GitHubUi(updater));
  ctx.effect(() => () => updater.dispose());
  ctx.effect(() => commands.register(createUpdaterCommand(updater, {
    language: clientLanguage => resolveLanguage(config.language.get(), ctx.get('settings') as LocaleSettings | undefined, clientLanguage),
  })));
  ctx.inject(['tools'], toolsContext => {
    const tools = toolsContext.get('tools') as Tools;
    toolsContext.effect(() => tools.register(createUpdaterTool(updater)));
  });
}
