/** Validated Cordis configuration, with explicit source policy instead of implicit origin switching. */
import Schema from '@deepseek-ai/schemastery';
const repository = Schema.string().pattern(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const url = Schema.string().pattern(/^https?:\/\/\S+$/);
/** Source policy for one package, discriminated on `kind`. */
export const Source = Schema.union([
    Schema.object({
        kind: Schema.const('npm'), registry: url, channel: Schema.string().min(1).default('latest'), allowPinned: Schema.boolean().default(false),
    }),
    Schema.object({
        kind: Schema.const('github-source'), repository, ref: Schema.string().min(1), allowPinned: Schema.boolean().default(false),
    }),
    Schema.object({
        kind: Schema.const('github-release'), repository, assetTemplate: Schema.string().min(1), allowPinned: Schema.boolean().default(false),
    }),
    Schema.object({ kind: Schema.const('index'), url }),
]);
/**
 * Configuration is inert until a user explicitly invokes a check or update command.
 *
 * Cordis validates this schema before `apply` runs, so `apply` receives parsed
 * values. A volatile scalar is a live reference rather than a plain value, and
 * this plugin reads it through `.get()` at the point of use, so a value saved in
 * the settings page applies to the next request or command. Reading such a
 * field once during activation would freeze the value for the plugin lifetime.
 */
export const Config = Schema.object({
    language: Schema.union(['auto', 'en', 'zh']).default('auto').volatile()
        .description('Command language. auto follows the interface language.'),
    requestTimeoutMs: Schema.natural().min(100).max(120_000).default(15_000).volatile()
        .description('Deadline for one metadata request, in milliseconds.'),
    maxMetadataBytes: Schema.natural().min(1024).max(16 * 1024 * 1024).default(4 * 1024 * 1024).volatile()
        .description('Largest metadata response accepted, in bytes.'),
    planTtlMs: Schema.natural().min(1000).max(60 * 60_000).default(10 * 60_000).volatile()
        .description('How long an update confirmation stays valid, in milliseconds.'),
    /** Credential reference resolved by DSH (stored refs before environment fallbacks), not a token value. */
    githubTokenEnv: Schema.string().pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).default('GITHUB_TOKEN').volatile()
        .description('Credential reference naming the GitHub token. Not the token value.'),
    sources: Schema.dict(Source).default({})
        .description('Per-package source overrides, keyed by package name.'),
    indexes: Schema.array(url).default([])
        .description('Reserved index sources. Accepted and never fetched.'),
});
//# sourceMappingURL=config.js.map