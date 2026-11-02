/** Human commands: batch selection, scoped confirmation and durable scheduled updates. */
import { formatApply, formatChecks, formatCommandError, formatInventory, formatUsage } from './format.js';
import { t } from './i18n.js';
/** Match package names only, not filesystem paths. */
function patternExpression(pattern) {
    if (!/^[a-zA-Z0-9@._~/*?+-]+$/.test(pattern) || pattern.startsWith('-'))
        throw new Error(`Invalid package pattern: ${pattern}`);
    return new RegExp('^' + [...pattern].map(c => c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')).join('') + '$');
}
function snapshot(results, unmatched) {
    return JSON.stringify({ unmatched, results: results.map(r => ({ bundle: r.bundle, source: r.source, status: r.status, candidate: r.candidate })) });
}
function phrase(lang, en, zh) { return lang === 'zh' ? zh : en; }
export function createUpdaterCommand(updater, options = {}) {
    const fallbackAgent = {};
    const pending = new WeakMap();
    let busy = false;
    const defaultLanguage = (clientLanguage) => {
        try {
            return (typeof options.language === 'function' ? options.language(clientLanguage) : options.language ?? clientLanguage) === 'zh' ? 'zh' : 'en';
        }
        catch {
            return 'en';
        }
    };
    const initialLanguage = defaultLanguage();
    async function inspect(patterns, signal) {
        const bundles = (await updater.list()).filter(b => b.installed);
        const matches = new Map();
        const unmatched = [];
        for (const pattern of patterns) {
            const expression = patternExpression(pattern);
            const found = bundles.filter(b => expression.test(b.name));
            if (!found.length)
                unmatched.push(pattern);
            for (const bundle of found)
                matches.set(bundle.name, bundle);
        }
        const results = [];
        for (const name of [...matches.keys()].sort())
            results.push(...await updater.check(name, signal));
        return { results, unmatched };
    }
    function describe(results, unmatched, language) {
        return formatChecks(results, language) + (unmatched.length ? '\n\n' + phrase(language, 'No installed packages matched: ', '没有已安装的插件匹配：') + unmatched.join(', ') : '');
    }
    function exactTargets(plans, language) {
        return phrase(language, 'Exact targets:', '精确安装目标：') + '\n' + plans.map(p => `- ${p.bundle.name}: ${p.candidate.spec}${p.candidate.registry ? ` (${p.candidate.registry})` : ''}`).join('\n');
    }
    async function execute(plans, language) {
        let failed = false;
        const text = [];
        for (const plan of plans) {
            try {
                const result = await updater.apply(plan.id, true);
                failed ||= result.status === 'failed';
                text.push(`${plan.bundle.name}\n${formatApply(result, language)}`);
            }
            catch (error) {
                failed = true;
                text.push(`${plan.bundle.name}\n${formatCommandError(error, language)}`);
            }
        }
        return { kind: failed ? 'error' : 'success', text: text.join('\n\n') };
    }
    return {
        name: 'plugin-updater', description: t(initialLanguage, 'ui.command.description'), input: { hint: t(initialLanguage, 'ui.command.hint') },
        async handler({ rawInput, signal, agent }) {
            const tokens = rawInput.trim().split(/\s+/).filter(Boolean);
            const clientFlags = tokens.flatMap((token, index) => token === '--client-lang' ? [index] : []);
            let clientLanguage;
            if (clientFlags.length) {
                const index = clientFlags[0];
                const value = tokens[index + 1];
                if (clientFlags.length !== 1 || (value !== 'en' && value !== 'zh'))
                    return { kind: 'error', text: formatUsage(defaultLanguage()) };
                clientLanguage = value;
                tokens.splice(index, 2);
            }
            const flags = tokens.flatMap((token, index) => token === '--lang' ? [index] : []);
            let language;
            if (flags.length) {
                const index = flags[0];
                const value = tokens[index + 1];
                if (flags.length !== 1 || (value !== 'en' && value !== 'zh'))
                    return { kind: 'error', text: formatUsage(defaultLanguage(clientLanguage)) };
                language = value;
                tokens.splice(index, 2);
            }
            else
                language = defaultLanguage(clientLanguage);
            const [action = 'list', ...args] = tokens;
            const owner = agent ?? fallbackAgent;
            try {
                if (action === 'list' && !args.length)
                    return { kind: 'success', text: formatInventory(await updater.list(), language) };
                if (action === 'help' && !args.length)
                    return { kind: 'success', text: formatUsage(language) };
                if (action === 'check' && args.length <= 1)
                    return { kind: 'success', text: formatChecks(await updater.check(args[0], signal), language) };
                if (!['update', 'ok', 'confirm', 'plan'].includes(action))
                    return { kind: 'error', text: formatUsage(language) };
                if (busy)
                    throw new Error(phrase(language, 'Another update operation is running.', '另一个更新操作正在进行。'));
                busy = true;
                try {
                    if (action === 'plan') {
                        if (!options.scheduled)
                            throw new Error(phrase(language, 'Scheduled updates are unavailable.', '延迟更新不可用。'));
                        if (!args.length) {
                            const entries = await options.scheduled.list();
                            return { kind: 'success', text: entries.length ? entries.map(e => `${e.plan.bundle.name}: ${e.plan.candidate.spec} [${e.state}]${e.outcome ? `\n${e.outcome}` : ''}`).join('\n') : phrase(language, 'No scheduled updates.', '没有延迟更新任务。') };
                        }
                        if (args.length === 1 && args[0] === 'cancel') {
                            const count = await options.scheduled.cancel();
                            return { kind: 'success', text: phrase(language, `Cancelled ${count} pending scheduled updates. Running updates were not interrupted.`, `已取消 ${count} 个待执行任务；正在执行的任务不会被中断。`) };
                        }
                        if (args.some(arg => arg.startsWith('--')))
                            return { kind: 'error', text: formatUsage(language) };
                        const { results, unmatched } = await inspect(args, signal);
                        const plans = results.filter(r => r.status === 'update-available' && r.candidate).map(r => updater.prepare(r));
                        await options.scheduled.schedule(plans);
                        return { kind: plans.length ? 'success' : 'error', text: describe(results, unmatched, language) + '\n\n' + (plans.length ? exactTargets(plans, language) + '\n\n' : '') + phrase(language, `${plans.length} update(s) scheduled for the next DSH startup. Cancellation: /plugin-updater plan cancel. Updates are non-atomic; failures may require manual recovery.`, `已安排 ${plans.length} 个更新在下次 DSH 启动时尝试执行。取消：/plugin-updater plan cancel。更新非原子操作，失败可能需要人工恢复。`) };
                    }
                    const confirming = action === 'ok' || action === 'confirm';
                    if (confirming && args.length)
                        return { kind: 'error', text: formatUsage(language) };
                    const accept = args.includes('--accept-removal-risk');
                    if (args.filter(a => a === '--accept-removal-risk').length > 1 || args.some(a => a.startsWith('--') && a !== '--accept-removal-risk'))
                        return { kind: 'error', text: formatUsage(language) };
                    const previous = pending.get(owner);
                    const patterns = confirming ? previous?.patterns : args.filter(a => a !== '--accept-removal-risk');
                    if (!patterns?.length)
                        throw new Error(phrase(language, confirming ? 'No pending confirmation.' : 'Specify at least one package.', confirming ? '没有待确认的更新。' : '请至少指定一个插件包。'));
                    const { results, unmatched } = await inspect(patterns, signal);
                    const current = snapshot(results, unmatched);
                    const available = results.filter(r => r.status === 'update-available' && r.candidate);
                    if (!available.length) {
                        pending.delete(owner);
                        return { kind: 'error', text: describe(results, unmatched, language) };
                    }
                    const same = previous && previous.expires > Date.now() && JSON.stringify(previous.patterns) === JSON.stringify(patterns) && previous.snapshot === current;
                    if (accept || (same && (confirming || action === 'update'))) {
                        pending.delete(owner);
                        const plans = same && !accept ? previous.plans : available.map(r => updater.prepare(r));
                        const outcome = await execute(plans, language);
                        return { kind: outcome.kind, text: describe(results, unmatched, language) + '\n\n' + outcome.text };
                    }
                    const plans = available.map(r => updater.prepare(r));
                    pending.set(owner, { patterns: [...patterns], snapshot: current, plans, expires: Math.min(...plans.map(p => Date.parse(p.expiresAt))) });
                    return { kind: 'success', text: describe(results, unmatched, language) + '\n\n' + exactTargets(plans, language) + '\n\n' + phrase(language, 'Update is non-atomic; the old package may be removed and manual recovery may be needed. Repeat the same update command or run /plugin-updater ok or /plugin-updater confirm to proceed.', '更新不是原子操作，旧插件可能被移除，失败时可能需要人工恢复。请再次执行相同的 update 命令，或执行 /plugin-updater ok 或 /plugin-updater confirm 以确认。') };
                }
                finally {
                    busy = false;
                }
            }
            catch (error) {
                return { kind: 'error', text: formatCommandError(error, language) };
            }
        },
    };
}
//# sourceMappingURL=commands.js.map