/** Human commands: batch selection and scoped confirmation. */
import { formatApply, formatChecks, formatCommandError, formatInventory, formatUsage } from './format.js';
import { t } from './i18n.js';
import type { Language } from './i18n.js';
import { isActionable, type Updater } from './updater.js';
import type { CheckResult, UpdatePlan } from './types.js';

export interface CommandResult { readonly kind: 'success' | 'error'; readonly text: string }
export interface UpdaterCommand {
  readonly name: string;
  readonly description: string;
  readonly input: { readonly hint: string };
  handler(invocation: { readonly rawInput: string; readonly signal?: AbortSignal; readonly agent?: object }): Promise<CommandResult>;
}
export interface CommandOptions { readonly language?: Language | ((clientLanguage?: Language) => Language) }
type Pending = { patterns: string[]; allowPinned: boolean; gitBranch?: string; snapshot: string; plans: UpdatePlan[]; expires: number };

/** Match package names only, not filesystem paths. */
function patternExpression(pattern: string): RegExp {
  if (!/^[a-zA-Z0-9@._~/*?+-]+$/.test(pattern) || pattern.startsWith('-')) throw new Error(`Invalid package pattern: ${pattern}`);
  return new RegExp('^' + [...pattern].map(c => c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')).join('') + '$');
}
function isGitBranch(value: string): boolean {
  return value.length <= 255 && value !== '@' && !value.startsWith('-') && !value.startsWith('/')
    && !value.endsWith('/') && !value.endsWith('.') && !value.includes('..') && !value.includes('//')
    && !value.includes('@{') && !/[\x00-\x20\x7f~^:?*\[\\]/.test(value)
    && value.split('/').every(part => part !== '' && !part.startsWith('.') && !part.endsWith('.lock'));
}
function snapshot(results: CheckResult[], unmatched: string[]): string {
  return JSON.stringify({ unmatched, results: results.map(r => ({ bundle: r.bundle, source: r.source, status: r.status, candidate: r.candidate })) });
}
function phrase(lang: Language, en: string, zh: string): string { return lang === 'zh' ? zh : en; }

export function createUpdaterCommand(updater: Pick<Updater, 'list' | 'check' | 'prepare' | 'apply'>, options: CommandOptions = {}): UpdaterCommand {
  const fallbackAgent = {};
  const pending = new WeakMap<object, Pending>();
  let busy = false;
  const defaultLanguage = (clientLanguage?: Language): Language => {
    try { return (typeof options.language === 'function' ? options.language(clientLanguage) : options.language ?? clientLanguage) === 'zh' ? 'zh' : 'en'; }
    catch { return 'en'; }
  };
  const initialLanguage = defaultLanguage();
  async function inspect(patterns: string[], signal?: AbortSignal, gitBranch?: string): Promise<{ results: CheckResult[]; unmatched: string[] }> {
    const bundles = (await updater.list()).filter(b => b.installed);
    const matches = new Map<string, typeof bundles[number]>();
    const unmatched: string[] = [];
    for (const pattern of patterns) {
      const expression = patternExpression(pattern);
      const found = bundles.filter(b => expression.test(b.name));
      if (!found.length) unmatched.push(pattern);
      for (const bundle of found) matches.set(bundle.name, bundle);
    }
    const results: CheckResult[] = [];
    for (const name of [...matches.keys()].sort()) results.push(...await updater.check(name, signal, gitBranch));
    return { results, unmatched };
  }
  function describeUnmatched(unmatched: string[], language: Language): string {
    return unmatched.length ? phrase(language, 'No installed packages matched: ', '没有已安装的插件匹配：') + unmatched.join(', ') : '';
  }
  function describe(results: CheckResult[], unmatched: string[], language: Language): string {
    return [formatChecks(results, language), describeUnmatched(unmatched, language)].filter(Boolean).join('\n\n');
  }
  function exactTargets(plans: UpdatePlan[], language: Language): string {
    return phrase(language, 'Exact targets:', '精确安装目标：') + '\n' + plans.map(p => `- ${p.bundle.name}: ${p.candidate.spec}${p.candidate.registry ? ` (${p.candidate.registry})` : ''}`).join('\n');
  }
  async function execute(plans: UpdatePlan[], language: Language): Promise<CommandResult> {
    let failed = false;
    const text: string[] = [];
    for (const plan of plans) {
      try { const result = await updater.apply(plan.id, true); failed ||= result.status === 'failed'; text.push(`${plan.bundle.name}\n${formatApply(result, language)}`); }
      catch (error) { failed = true; text.push(`${plan.bundle.name}\n${formatCommandError(error, language)}`); }
    }
    return { kind: failed ? 'error' : 'success', text: text.join('\n\n') };
  }
  return {
    name: 'plugin-updater', description: t(initialLanguage, 'ui.command.description'), input: { hint: t(initialLanguage, 'ui.command.hint') },
    async handler({ rawInput, signal, agent }) {
      const tokens = rawInput.trim().split(/\s+/).filter(Boolean);
      const clientFlags = tokens.flatMap((token, index) => token === '--client-lang' ? [index] : []);
      let clientLanguage: Language | undefined;
      if (clientFlags.length) {
        const index = clientFlags[0]!; const value = tokens[index + 1];
        if (clientFlags.length !== 1 || (value !== 'en' && value !== 'zh')) return { kind: 'error', text: formatUsage(defaultLanguage()) };
        clientLanguage = value; tokens.splice(index, 2);
      }
      const flags = tokens.flatMap((token, index) => token === '--lang' ? [index] : []);
      let language: Language;
      if (flags.length) {
        const index = flags[0]!; const value = tokens[index + 1];
        if (flags.length !== 1 || (value !== 'en' && value !== 'zh')) return { kind: 'error', text: formatUsage(defaultLanguage(clientLanguage)) };
        language = value; tokens.splice(index, 2);
      } else language = defaultLanguage(clientLanguage);
      const [action = 'list', ...args] = tokens;
      const branchFlags = args.flatMap((token, index) => token === '--git-branch' ? [index] : []);
      let requestedBranch: string | undefined;
      if (branchFlags.length) {
        const index = branchFlags[0]!;
        const value = args[index + 1];
        if (branchFlags.length !== 1 || (action !== 'check' && action !== 'update') || !value || !isGitBranch(value)) {
          return { kind: 'error', text: formatUsage(language) };
        }
        requestedBranch = value;
        args.splice(index, 2);
      }
      const owner = agent ?? fallbackAgent;
      try {
        if (action === 'list' && !args.length) return { kind: 'success', text: formatInventory(await updater.list(), language) };
        if (action === 'help' && !args.length) return { kind: 'success', text: formatUsage(language) };
        if (action === 'check' && args.length <= 1 && !args.some(arg => arg.startsWith('--'))) return { kind: 'success', text: formatChecks(await updater.check(args[0], signal, requestedBranch), language) };
        if (!['update', 'ok', 'confirm'].includes(action)) return { kind: 'error', text: formatUsage(language) };
        if (busy) throw new Error(phrase(language, 'Another update operation is running.', '另一个更新操作正在进行。'));
        busy = true;
        try {
          const confirming = action === 'ok' || action === 'confirm';
          if (confirming && args.length) return { kind: 'error', text: formatUsage(language) };
          const accept = args.includes('--accept-removal-risk');
          const explicitAllowPinned = args.includes('--allow-pinned');
          if (args.filter(a => a === '--accept-removal-risk').length > 1 || args.filter(a => a === '--allow-pinned').length > 1
            || args.some(a => a.startsWith('--') && a !== '--accept-removal-risk' && a !== '--allow-pinned')) return { kind: 'error', text: formatUsage(language) };
          if (accept && (explicitAllowPinned || requestedBranch !== undefined)) return { kind: 'error', text: phrase(language,
            '--allow-pinned and --git-branch require confirmation and cannot be combined with --accept-removal-risk.',
            '--allow-pinned 和 --git-branch 需要二次确认，不能与 --accept-removal-risk 同时使用。') };
          const previous = pending.get(owner);
          const allowPinned = confirming ? previous?.allowPinned ?? false : explicitAllowPinned;
          const gitBranch = confirming ? previous?.gitBranch : requestedBranch;
          const patterns = confirming ? previous?.patterns : args.filter(a => a !== '--accept-removal-risk' && a !== '--allow-pinned');
          if (!patterns?.length) throw new Error(phrase(language, confirming ? 'No pending confirmation.' : 'Specify at least one package.', confirming ? '没有待确认的更新。' : '请至少指定一个插件包。'));
          const { results, unmatched } = await inspect(patterns, signal, gitBranch);
          const current = snapshot(results, unmatched);
          const available = results.filter(result => isActionable(result, allowPinned));
          if (!available.length) { pending.delete(owner); return { kind: 'error', text: describe(results, unmatched, language) }; }
          const same = previous && previous.expires > Date.now() && previous.allowPinned === allowPinned
            && previous.gitBranch === gitBranch && JSON.stringify(previous.patterns) === JSON.stringify(patterns) && previous.snapshot === current;
          if (accept || (same && (confirming || action === 'update'))) {
            pending.delete(owner);
            const plans = same && !accept ? previous.plans : available.map(r => updater.prepare(r, allowPinned, gitBranch));
            const outcome = await execute(plans, language);
            const notAttempted = results.filter(result => !isActionable(result, allowPinned)).map(result => result.bundle.name);
            const notice = notAttempted.length ? phrase(language,
              'Not updated: ', '未执行更新：') + notAttempted.join(', ') + phrase(language,
              '. Run /plugin-updater check for details.', '。可运行 /plugin-updater check 查看详情。') : '';
            return { kind: outcome.kind, text: [describeUnmatched(unmatched, language), notice, outcome.text].filter(Boolean).join('\n\n') };
          }
          const plans = available.map(r => updater.prepare(r, allowPinned, gitBranch));
          pending.set(owner, { patterns: [...patterns], allowPinned, ...(gitBranch === undefined ? {} : { gitBranch }), snapshot: current, plans, expires: Math.min(...plans.map(p => Date.parse(p.expiresAt))) });
          const pinnedNotice = available.some(result => result.status === 'pinned') ? '\n\n' + phrase(language,
            'Pinned packages are authorized for this update only; the installed target remains pinned.',
            '已固定的插件仅获准本次更新；安装后的目标仍会固定。') : '';
          const gitNotice = available.some(result => result.source.kind === 'github-source') ? '\n\n' + phrase(language,
            'A different Git commit is not necessarily newer and may not contain the installed commit. Review the tracked ref and exact target.',
            '不同的 Git 提交不一定更新，也可能不包含已安装的提交。请核对跟踪引用和精确目标。') : '';
          return { kind: 'success', text: describe(results, unmatched, language) + '\n\n' + exactTargets(plans, language) + pinnedNotice + gitNotice + '\n\n' + phrase(language,
            'Update is non-atomic; the old package may be removed and manual recovery may be needed. Repeat the same update command or run /plugin-updater ok or /plugin-updater confirm to proceed.',
            '更新不是原子操作，旧插件可能被移除，失败时可能需要人工恢复。请再次执行相同的 update 命令，或执行 /plugin-updater ok 或 /plugin-updater confirm 以确认。') };
        } finally { busy = false; }
      } catch (error) { return { kind: 'error', text: formatCommandError(error, language) }; }
    },
  };
}
