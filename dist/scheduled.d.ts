import type { UpdatePlan } from './types.js';
import type { Updater } from './updater.js';
type Entry = {
    plan: UpdatePlan;
    state: 'pending' | 'running' | 'done' | 'failed';
    creator: string;
    pid: number;
    outcome?: string;
};
/** Atomic file replacement plus an exclusive lock: a stale lock fails closed, never silently replays writes. */
export declare class ScheduledUpdates {
    private readonly directory;
    private readonly updater;
    private readonly file;
    private readonly lock;
    constructor(directory: string, updater: Pick<Updater, 'applyDeferred'>);
    private transaction;
    schedule(plans: readonly UpdatePlan[]): Promise<void>;
    list(): Promise<Entry[]>;
    cancel(): Promise<number>;
    /** Run once per process/profile, never during same-process HMR or while creator is still alive. */
    startup(): Promise<void>;
}
export {};
