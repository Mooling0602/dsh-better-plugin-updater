/** Model-facing, read-only JSON adapter. Human command formatting is deliberately separate. */
import type { Updater } from './updater.js';
/** Canonical tool definition accepted directly by the DSH registry. */
export interface UpdaterTool {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
    readonly output: {
        readonly schema: {
            readonly type: 'string';
        };
        render(args: unknown, value: string): {
            type: 'text';
            text: string;
        }[];
    };
    execute(args: unknown, exec: {
        readonly signal: AbortSignal;
    }): Promise<string>;
}
/** Build a read-only tool without registering resources, fetching metadata, or executing updates. */
export declare function createUpdaterTool(updater: Pick<Updater, 'list' | 'check'>): UpdaterTool;
