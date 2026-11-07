var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { GitHubUi } from './github-ui.js';
import { formatApply } from './format.js';
/** Expose only GitHub detail operations, leaving package writes to the shared coordinator. */
let GitHubRemote = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _describe_decorators;
    let _check_decorators;
    let _apply_decorators;
    return class GitHubRemote extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _describe_decorators = [Remote];
            _check_decorators = [Remote];
            _apply_decorators = [Remote];
            __esDecorate(this, null, _describe_decorators, { kind: "method", name: "describe", static: false, private: false, access: { has: obj => "describe" in obj, get: obj => obj.describe }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _check_decorators, { kind: "method", name: "check", static: false, private: false, access: { has: obj => "check" in obj, get: obj => obj.check }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _apply_decorators, { kind: "method", name: "apply", static: false, private: false, access: { has: obj => "apply" in obj, get: obj => obj.apply }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        ui = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, ui) {
            super(ctx, 'betterPluginUpdaterUi');
            this.ui = ui;
        }
        owner() {
            if (this.ctx.invocation?.peer.principal.kind !== 'owner')
                throw new Error('Only the Host owner may manage plugin updates.');
        }
        /** Identify one package without checking a registry or changing the profile. */
        async describe(name) {
            this.owner();
            if (typeof name !== 'string' || name.length < 1 || name.length > 214)
                throw new Error('Invalid package name.');
            return JSON.stringify((await this.ui.describe(name)) ?? null);
        }
        /** Check one GitHub dependency and return its immutable confirmation when actionable. */
        async check(name) {
            this.owner();
            if (typeof name !== 'string' || name.length < 1 || name.length > 214)
                throw new Error('Invalid package name.');
            return JSON.stringify((await this.ui.check(name, this.ctx.invocation?.signal)) ?? null);
        }
        /** Apply only a plan issued by the detail-page adapter after explicit risk acknowledgement. */
        async apply(id, acceptRemovalRisk, language) {
            this.owner();
            if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
                throw new Error('Invalid confirmation identifier.');
            if (language !== 'en' && language !== 'zh')
                throw new Error('Invalid presentation language.');
            const result = await this.ui.apply(id, acceptRemovalRisk);
            return JSON.stringify({ status: result.status, text: formatApply(result, language) });
        }
    };
})();
export { GitHubRemote };
//# sourceMappingURL=github-remote.js.map