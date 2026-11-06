import { normalizeLanguage } from '../language.js';
import { en, zh } from './locales.js';
/** Dictionary namespace this bundle owns. */
export const NS = 'settings.updater';
/** Only our exact command receives presentation metadata; all other bytes stay unchanged. */
export function withClientLanguage(line, language) {
    const selected = normalizeLanguage(language);
    if (!selected || typeof line !== 'string' || !/^\/plugin-updater(?:\s|$)/.test(line))
        return line;
    return `${line} --client-lang ${selected}`;
}
/**
 * rc.4 has no caller-locale field or pre-command hook. Adapt its public execute method in this
 * Client's own namespace, retaining the generated getter's caller Context and lifecycle checks.
 * Never mutate a Host global, settings, transport, composer draft or unrelated command.
 */
export function installLanguageBridge(commands, activeLanguage) {
    const previous = Object.getOwnPropertyDescriptor(commands, 'execute');
    if (!previous || previous.configurable !== true || (typeof previous.get !== 'function' && typeof previous.value !== 'function')) {
        throw new Error('The updater language bridge requires a configurable commands.execute method.');
    }
    let active = true;
    const get = function () {
        const execute = previous.get ? Reflect.apply(previous.get, this, []) : previous.value;
        if (typeof execute !== 'function')
            throw new Error('commands.execute is unavailable.');
        return function (...args) {
            if (!active || typeof args[1] !== 'string' || !/^\/plugin-updater(?:\s|$)/.test(args[1]))
                return Reflect.apply(execute, this, args);
            let language;
            try {
                language = activeLanguage();
            }
            catch { /* Host keeps its explicit and saved-preference fallbacks. */ }
            const forwarded = [...args];
            forwarded[1] = withClientLanguage(args[1], language);
            return Reflect.apply(execute, this, forwarded);
        };
    };
    Object.defineProperty(commands, 'execute', { configurable: true, enumerable: previous.enumerable ?? true, get });
    return () => {
        active = false;
        // Do not undo another plugin's newer adapter. Captured wrappers become inert after teardown.
        if (Object.getOwnPropertyDescriptor(commands, 'execute')?.get === get)
            Object.defineProperty(commands, 'execute', previous);
    };
}
export const inject = ['locale', 'remote.commands'];
/** Host entry id this bundle owns in the profile, the settings namespace it serves. */
export const ENTRY_ID = 'better-plugin-updater';
/** The bundle package name the Plugins page keys a bundle page by. */
export const BUNDLE_NAME = 'dsh-better-plugin-updater';
/** The browser factory's module-table resolver, captured for the settings page import. */
let hostRequire;
/**
 * Record the factory resolver the Host assembles for this bundle.
 *
 * The Host resolves shared browser dependencies by specifier, so the page must reach React through
 * this resolver rather than a native dynamic import, which the browser cannot resolve at all.
 * @param resolver - the factory's `require`.
 */
export function captureHostRequire(resolver) {
    hostRequire = resolver;
}
/**
 * Mount this bundle's settings page through the public bundle-config slot.
 *
 * The page is loaded on demand so the packaged factory still evaluates with no browser dependency
 * present, which keeps the bundle inspectable outside a browser. Registration is gated on the
 * namespace being served, because a page whose fields nothing would accept is worse than none.
 * @param ctx - Client runtime owning slots and served settings forms.
 */
export function mountSettingsPage(ctx) {
    ctx.inject(['slots', 'configForms', 'locale'], inner => inner.effect(() => {
        // A front end that serves settings without a locale service still gets the page, just in English.
        const locale = inner.locale;
        const releaseDicts = locale?.register(NS, { en, zh });
        const disposePage = inner.configForms.whileServed([ENTRY_ID], () => {
            if (!hostRequire)
                return () => { };
            const controllerModule = require('./settings-controller.js');
            const page = require('./settings-page.js');
            const controller = new controllerModule.UpdaterCardController(inner.configForms.get(ENTRY_ID));
            const face = controller.inject();
            const Card = page.UpdaterSettingsPage;
            const disposeSlot = inner.slots.inject('plugins.bundle.config', () => inner.slots.register({
                name: 'plugins.bundle.config', key: BUNDLE_NAME,
                ...(releaseDicts ? { locale: NS } : {}), inject: () => face,
            }, Card));
            return () => { disposeSlot?.(); controller.dispose(); };
        });
        return () => { disposePage?.(); releaseDicts?.(); };
    }, 'dsh-better-plugin-updater: settings page'));
}
export function apply(ctx) {
    const commands = ctx.get('remote.commands');
    const locale = ctx.get('locale');
    // The settings page is the primary surface, so a Host missing the command wire must not cost it.
    mountSettingsPage(ctx);
    if (!commands || !locale)
        return;
    ctx.effect(() => installLanguageBridge(commands, () => locale.getSnapshot().active));
}
//# sourceMappingURL=index.js.map