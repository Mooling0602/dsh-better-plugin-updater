/** Cordis Host entry. Package writes require an explicitly confirmed user operation. */
import type { Context } from '@deepseek-ai/cordis';
import { Updater } from './updater.js';
export { Config } from './config.js';
export type { UpdaterConfig } from './config.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Read-only checking and confirmed updates for the current profile. Not a Remote service. */
        betterPluginUpdater: Updater;
    }
}
/** The host owns profile selection, package writes, compatibility checks, and command dispatch. */
export declare const inject: string[];
/** Register a profile-local service, a user command, and an optional read-only agent tool. */
export declare function apply(ctx: Context, rawConfig?: unknown): void;
