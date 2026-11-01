/** Web Client bridge: carry this caller's effective language through the existing command wire. */
import type { Context } from '@deepseek-ai/cordis';
import { normalizeLanguage } from '../language.js';

export interface ClientLocale { getSnapshot(): { readonly active: unknown } }

/** Only our exact command receives presentation metadata; all other bytes stay unchanged. */
export function withClientLanguage(line: unknown, language: unknown): unknown {
  const selected = normalizeLanguage(language);
  if (!selected || typeof line !== 'string' || !/^\/plugin-updater(?:\s|$)/.test(line)) return line;
  return `${line} --client-lang ${selected}`;
}

/**
 * rc.4 has no caller-locale field or pre-command hook. Adapt its public execute method in this
 * Client's own namespace, retaining the generated getter's caller Context and lifecycle checks.
 * Never mutate a Host global, settings, transport, composer draft or unrelated command.
 */
export function installLanguageBridge(commands: object, activeLanguage: () => unknown): () => void {
  const previous = Object.getOwnPropertyDescriptor(commands, 'execute');
  if (!previous || previous.configurable !== true || (typeof previous.get !== 'function' && typeof previous.value !== 'function')) {
    throw new Error('The updater language bridge requires a configurable commands.execute method.');
  }
  let active = true;
  const get = function(this: unknown) {
    const execute: unknown = previous.get ? Reflect.apply(previous.get, this, []) : previous.value;
    if (typeof execute !== 'function') throw new Error('commands.execute is unavailable.');
    return function(this: unknown, ...args: unknown[]) {
      if (!active || typeof args[1] !== 'string' || !/^\/plugin-updater(?:\s|$)/.test(args[1])) return Reflect.apply(execute, this, args);
      let language: unknown;
      try { language = activeLanguage(); } catch { /* Host keeps its explicit and saved-preference fallbacks. */ }
      const forwarded = [...args];
      forwarded[1] = withClientLanguage(args[1], language);
      return Reflect.apply(execute, this, forwarded);
    };
  };
  Object.defineProperty(commands, 'execute', { configurable: true, enumerable: previous.enumerable ?? true, get });
  return () => {
    active = false;
    // Do not undo another plugin's newer adapter. Captured wrappers become inert after teardown.
    if (Object.getOwnPropertyDescriptor(commands, 'execute')?.get === get) Object.defineProperty(commands, 'execute', previous);
  };
}

export const inject = ['locale', 'remote.commands'];

export function apply(ctx: Context): void {
  const commands = ctx.get('remote.commands') as object | undefined;
  const locale = ctx.get('locale') as ClientLocale | undefined;
  if (!commands || !locale) throw new Error('The updater Client requires locale and remote.commands.');
  ctx.effect(() => installLanguageBridge(commands, () => locale.getSnapshot().active));
}
