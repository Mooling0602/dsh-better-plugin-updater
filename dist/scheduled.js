/** Durable, at-most-once deferred updates for one managed profile. */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
const globals = globalThis;
const processState = globals.__betterUpdaterProcess ??= { id: randomUUID(), started: new Set() };
const planSchema = z.object({
    id: z.string().uuid(), createdAt: z.string(), expiresAt: z.string(), command: z.string(),
    bundle: z.object({ name: z.string().min(1), version: z.string().optional(), source: z.string().optional(), enabled: z.boolean(), installed: z.boolean(), removable: z.boolean(), availability: z.enum(['profile', 'installation', 'missing']), readOnlyReason: z.string().optional(), error: z.object({ code: z.string(), diagnostic: z.string().optional() }).optional(), installTarget: z.object({ spec: z.string(), version: z.string() }).optional() }),
    source: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('npm'), packageName: z.string(), registry: z.string(), channel: z.string(), pinned: z.boolean() }),
        z.object({ kind: z.literal('github-source'), repository: z.string(), ref: z.string(), baseSpec: z.string(), currentRevision: z.string().optional(), pinned: z.boolean() }),
        z.object({ kind: z.literal('github-release'), repository: z.string(), assetTemplate: z.string(), currentTag: z.string().optional(), pinned: z.boolean() }),
    ]),
    candidate: z.object({ spec: z.string().min(1), version: z.string().optional(), revision: z.string().optional(), registry: z.string().optional(), url: z.string().optional() }),
    warnings: z.array(z.string()), warningDetails: z.array(z.object({ key: z.string(), params: z.record(z.string(), z.union([z.string(), z.number()])).optional() })).optional(),
});
const entrySchema = z.object({ plan: planSchema, state: z.enum(['pending', 'running', 'done', 'failed']), creator: z.string(), pid: z.number().int().positive(), outcome: z.string().optional() });
const fileSchema = z.object({ version: z.literal(1), entries: z.array(entrySchema).max(1000) });
/** Atomic file replacement plus an exclusive lock: a stale lock fails closed, never silently replays writes. */
export class ScheduledUpdates {
    directory;
    updater;
    file;
    lock;
    constructor(directory, updater) {
        this.directory = directory;
        this.updater = updater;
        this.file = join(directory, '.better-plugin-updater-queue.json');
        this.lock = `${this.file}.lock`;
    }
    async transaction(fn) {
        let handle;
        try {
            handle = await fs.open(this.lock, 'wx', 0o600);
        }
        catch (error) {
            if (error.code === 'EEXIST')
                throw new Error('Scheduled update queue is locked; another operation or interrupted process may need attention.');
            throw error;
        }
        try {
            let raw;
            try {
                raw = JSON.parse(await fs.readFile(this.file, 'utf8'));
            }
            catch (error) {
                if (error.code !== 'ENOENT')
                    throw error;
                raw = { version: 1, entries: [] };
            }
            const parsed = fileSchema.parse(raw);
            const entries = parsed.entries;
            const result = await fn(entries);
            const temp = `${this.file}.${randomUUID()}.tmp`;
            try {
                await fs.writeFile(temp, JSON.stringify({ version: 1, entries }, null, 2), { mode: 0o600, flag: 'wx' });
                await fs.rename(temp, this.file);
            }
            finally {
                await fs.unlink(temp).catch(() => { });
            }
            return result;
        }
        finally {
            await handle.close();
            await fs.unlink(this.lock).catch(() => { });
        }
    }
    async schedule(plans) {
        if (!plans.length)
            return;
        await this.transaction(entries => {
            for (const plan of plans) {
                const index = entries.findIndex(entry => entry.state === 'pending' && entry.plan.bundle.name === plan.bundle.name);
                const entry = { plan: structuredClone(plan), state: 'pending', creator: processState.id, pid: process.pid };
                if (index >= 0)
                    entries[index] = entry;
                else
                    entries.push(entry);
            }
            if (entries.length > 1000)
                throw new Error('Scheduled update queue is full; no changes were saved.');
        });
    }
    async list() { return this.transaction(entries => structuredClone(entries)); }
    async cancel() {
        return this.transaction(entries => { const before = entries.length; for (let i = entries.length - 1; i >= 0; i--)
            if (entries[i].state === 'pending')
                entries.splice(i, 1); return before - entries.length; });
    }
    /** Run once per process/profile, never during same-process HMR or while creator is still alive. */
    async startup() {
        if (processState.started.has(this.directory))
            return;
        processState.started.add(this.directory);
        try {
            await fs.access(this.file);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return;
            throw error;
        }
        const runnerFile = `${this.file}.runner`;
        let runner;
        try {
            runner = await fs.open(runnerFile, 'wx', 0o600);
        }
        catch (error) {
            if (error.code === 'EEXIST')
                return;
            throw error;
        }
        try {
            for (;;) {
                const plan = await this.transaction(entries => {
                    const item = entries.find(entry => entry.state === 'pending' && entry.creator !== processState.id && !processAlive(entry.pid));
                    if (!item)
                        return undefined;
                    item.state = 'running';
                    return structuredClone(item.plan);
                });
                if (!plan)
                    return;
                let outcome;
                let state;
                try {
                    const result = await this.updater.applyDeferred(plan);
                    state = result.status === 'failed' ? 'failed' : 'done';
                    outcome = JSON.stringify(result);
                }
                catch (error) {
                    state = 'failed';
                    outcome = error instanceof Error ? error.message : 'Scheduled update failed.';
                }
                await this.transaction(entries => { const item = entries.find(entry => entry.plan.id === plan.id && entry.state === 'running'); if (item) {
                    item.state = state;
                    item.outcome = outcome;
                } });
            }
        }
        finally {
            await runner.close();
            await fs.unlink(runnerFile).catch(() => { });
        }
    }
}
function processAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code !== 'ESRCH';
    }
}
//# sourceMappingURL=scheduled.js.map