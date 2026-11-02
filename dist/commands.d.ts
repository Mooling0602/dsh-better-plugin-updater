import type { Language } from './i18n.js';
import type { Updater } from './updater.js';
import type { ScheduledUpdates } from './scheduled.js';
export interface CommandResult {
    readonly kind: 'success' | 'error';
    readonly text: string;
}
export interface UpdaterCommand {
    readonly name: string;
    readonly description: string;
    readonly input: {
        readonly hint: string;
    };
    handler(invocation: {
        readonly rawInput: string;
        readonly signal?: AbortSignal;
        readonly agent?: object;
    }): Promise<CommandResult>;
}
export interface CommandOptions {
    readonly language?: Language | ((clientLanguage?: Language) => Language);
    readonly scheduled?: Pick<ScheduledUpdates, 'schedule' | 'list' | 'cancel'>;
}
export declare function createUpdaterCommand(updater: Pick<Updater, 'list' | 'check' | 'prepare' | 'apply'>, options?: CommandOptions): UpdaterCommand;
