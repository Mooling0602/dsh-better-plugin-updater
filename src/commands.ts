/** Localized human-facing command adapter over the same coordinator used by the JSON tool. */
import { formatApply, formatChecks, formatCommandError, formatInventory, formatPlan, formatUsage } from './format.js';
import { t } from './i18n.js';
import type { Language } from './i18n.js';
import type { Updater } from './updater.js';

/** The command result expected by DSH's commands service. */
export interface CommandResult { readonly kind: 'success' | 'error'; readonly text: string }
/** Registry-ready command definition; it owns parsing and presentation, not update policy. */
export interface UpdaterCommand {
  readonly name: string;
  readonly description: string;
  readonly input: { readonly hint: string };
  handler(invocation: { readonly rawInput: string; readonly signal?: AbortSignal }): Promise<CommandResult>;
}
/** Resolve the default once per invocation, or force a language for a host-independent consumer. */
export interface CommandOptions { readonly language?: Language | ((clientLanguage?: Language) => Language) }

/** Build the command. The --lang override is per invocation and never mutates Host preferences. */
export function createUpdaterCommand(updater: Pick<Updater, 'list' | 'check' | 'plan' | 'apply'>, options: CommandOptions = {}): UpdaterCommand {
  const defaultLanguage = (clientLanguage?: Language): Language => {
    try { return (typeof options.language === 'function' ? options.language(clientLanguage) : options.language ?? clientLanguage) === 'zh' ? 'zh' : 'en'; }
    catch { return 'en'; }
  };
  const initialLanguage = defaultLanguage();
  return {
    name: 'plugin-updater', description: t(initialLanguage, 'ui.command.description'), input: { hint: t(initialLanguage, 'ui.command.hint') },
    async handler({ rawInput, signal }) {
      const tokens = rawInput.trim().split(/\s+/).filter(Boolean);
      // Presentation-only metadata carried by our Client through rc.4's existing string wire.
      const clientFlags = tokens.flatMap((token, index) => token === '--client-lang' ? [index] : []);
      let clientLanguage: Language | undefined;
      if (clientFlags.length > 0) {
        const index = clientFlags[0]!;
        const value = tokens[index + 1];
        if (clientFlags.length !== 1 || (value !== 'en' && value !== 'zh')) return { kind: 'error', text: formatUsage(defaultLanguage()) };
        clientLanguage = value;
        tokens.splice(index, 2);
      }
      const flags = tokens.flatMap((token, index) => token === '--lang' ? [index] : []);
      let language: Language;
      if (flags.length > 0) {
        const index = flags[0]!;
        const value = tokens[index + 1];
        if (flags.length !== 1 || (value !== 'en' && value !== 'zh')) return { kind: 'error', text: formatUsage(defaultLanguage(clientLanguage)) };
        language = value;
        tokens.splice(index, 2);
      } else language = defaultLanguage(clientLanguage);
      const [action = 'list', target, acknowledgement, ...extra] = tokens;
      try {
        if (action === 'list' && !target) return { kind: 'success', text: formatInventory(await updater.list(), language) };
        if (action === 'help' && !target) return { kind: 'success', text: formatUsage(language) };
        if (action === 'check' && !acknowledgement) return { kind: 'success', text: formatChecks(await updater.check(target, signal), language) };
        if (action === 'plan' && target && !acknowledgement) return { kind: 'success', text: formatPlan(await updater.plan(target, signal), language) };
        if (action === 'update' && target && acknowledgement === '--accept-removal-risk' && extra.length === 0) {
          const result = await updater.apply(target, true);
          return { kind: result.status === 'failed' ? 'error' : 'success', text: formatApply(result, language) };
        }
        return { kind: 'error', text: formatUsage(language) };
      } catch (error) { return { kind: 'error', text: formatCommandError(error, language) }; }
    },
  };
}
