# Maintainer context

## Scope and verification

This package is a Cordis bundle with a Host coordinator and Web Client language bridge. It does not patch installed DSH files; the version-sensitive Client command accessor adapter is documented below. Its structural adapter was checked against the installed DSH `0.2.1-rc.4` implementation. The supported range is a declared admission range, not a claim that every version in it was tested. Tests activate the plugin in the real Cordis `4.0.5` lifecycle with fake DSH services. Provider requests and package writes are mocked. No real-profile install, real plugin upgrade, browser action, or live registry/GitHub check is part of those tests.

A separate manual smoke test installed the local linked bundle through `dsh plugin`, observed hot activation without restarting DSH, and called the live `plugin_updates` tool. A check of the installed `dsh-hint-shell` release attachment returned `current` at `0.1.0`. No real plugin upgrade was performed. Installation exposed an implicit-versus-canonical tool schema mismatch; the registry declaration and regression assertions cover that boundary. A later diagnostic smoke test reloaded the linked bundle through the supported CLI and observed real GitHub HTTP 403 quota exhaustion for both `dsh-mloader` source checks and `dsh-hint-shell` release checks: each retained `error.githubRateLimitedUntil`, numeric `status: 403`, and a normalized UTC `retryAt`. A live plan refusal retained the same descriptive error. This did not perform an update, add credentials, schedule a retry, or restart DSH.

## Modules

```text
src/index.ts            Cordis activation and resource ownership
src/commands.ts         Human-facing slash command parsing and result kinds
src/format.ts           Localized plain-text inventory, check, plan and update presenters
src/i18n.ts             Typed interpolation and per-call/saved language resolution
src/language.ts         Small browser-safe supported-language vocabulary
src/client/index.ts     Effect-scoped Web Client command-language bridge
scripts/build-client.mjs Self-contained browser factory generation with esbuild
src/locales/            Complete English and Simplified Chinese dictionaries
src/errors.ts           Owned failures with stable translation identities
src/credentials.ts      Read-only credential-reference adapter and safe provider-error boundary
src/tools.ts            Read-only structured JSON tool adapter
src/config.ts           Config validation and inert defaults
src/types.ts            Shared adapter, source, provider, plan and result contracts
src/sources.ts          Conservative source classification and origin validation
src/lockfile.ts         Bounded read-only pnpm Git baseline extraction
src/http.ts             Deadline, body bound, HTTPS and token-host isolation
src/providers/index.ts  npm, GitHub ref and GitHub release readers
src/updater.ts          Inventory, checks, frozen plans and update execution
src/core.ts             Host-independent exports for tests and extensions
```

## Host boundary

`pluginManager.listBundles()` is the inventory authority. Its result includes installation-owned bundles and offline official offers, so `installed` alone does not establish an updateable profile package. The coordinator checks availability, protection, existing errors and official install targets. Runtime Cordis rows are not independently updateable packages.

The service is exposed as `ctx.betterPluginUpdater` to trusted Host consumers. It is not exposed as a Remote service. The `/plugin-updater` command is the only bundled mutation surface. The optional `plugin_updates` tool can list, check, and plan, but cannot apply a plan, accept removal risk, approve dependency scripts, or grant compatibility exemptions. Remote metadata is data, never instructions.

The command and tool adapters call the same coordinator but have separate presentation. Slash commands never serialize operation objects as JSON. Pure formatters produce grouped lists, explicit version/commit comparisons, all plan risks before the confirmation command, and stage-aware update failures with manual recovery. They use plain text and short rows rather than wide tables or terminal colors. Diagnostics remain readable text. An unconfirmed remaining package is not described as definitively removed. The agent tool retains JSON for list, check and plan, with no mutation action. A bare slash command lists inventory, while `help` only displays usage.

The tool registry accepts canonical object-rooted JSON Schema, not the implicit parameter-map DSL accepted by `defineTool`. This package registers a canonical schema directly and checks the small argument shape at execution; its lifecycle test asserts both schema structure and rejected invalid arguments.

The DSH-specific types are a small structural contract rather than imports from unpublished implementation internals. Activation asserts the essential methods exist. The adapter does not write profile configuration or lockfiles itself. It calls `removeBundle()` and `installBundle()` and retains the original bundle selection.

## Localization

Config accepts `language: auto | en | zh`, with `auto` as the default. `resolveLanguage()` prefers validated per-call UI context in auto mode, otherwise reads `settings.describe({ redactSecrets: true })` only when needed, selects the unique `locale` namespace, and consumes only its saved `value.preference`. It does not expose unrelated form values, write preferences, inspect Node's navigator or OS environment, or assume a browser-only provisional language. A missing, unavailable, ambiguous or unsupported preference falls back to English. A Chinese primary tag selects Simplified Chinese. Settings is optional and is looked up dynamically, so its absence cannot disable update functionality.

The command captures its default language once per invocation, or uses a single explicit `--lang en|zh` override anywhere in its arguments. Invalid or duplicate flags fail before any operation. The risk acknowledgement remains mandatory and language-independent. A UI-language change applies to the next command; a long-running command keeps the language it started with. Registry descriptions and input hints are localized at registration and require re-registration to change, matching the Host command registry's lifetime.

English dictionary keys form a compile-time contract; Chinese must supply all and only those keys. Tests also require identical interpolation placeholders. Interpolation is one-pass literal replacement. All plugin-owned result reasons, safety warnings and command failures use typed message identities. English wire text remains present for compatibility, and optional `detail` / `warningDetails` metadata is additive. Unknown third-party errors and host diagnostics are preserved verbatim, never translated through brittle English-text matching. Versions, package identities, source URLs, plan commands and JSON status identifiers do not change with language.

### Client-to-Host language context

The Web Client entry reads the caller's effective `ctx.locale.getSnapshot().active` on each updater command invocation. This is not equivalent to saved `locale.preference`: a browser-derived or native-shell-derived active language may never have been persisted. The installed DSH command invocation has no locale field or documented pre-execute hook. Its generated Client `remote.commands.execute` is a configurable accessor that captures the getter receiver's Cordis Context; the plugin installs a reversible accessor adapter on that Client namespace and retains the original getter, receiver, all positional arguments, Promise and result semantics. It changes only this plugin's exact command line, adding `--client-lang en|zh` through the existing string wire. No installed DSH file, global fetch, composer draft, command catalog, Host global language, or settings value is modified. The generated accessor contract is version-sensitive and verified against rc.4; reevaluate this adapter when upgrading DSH. An unsupported non-configurable method fails this Client plugin's activation rather than silently claiming propagation worked. Teardown restores the original descriptor if still owned, otherwise leaves a newer adapter alone; already captured wrappers become inert.

Selection order is explicit command `--lang`, explicit plugin `language: en | zh`, validated caller UI locale when plugin language is `auto`, saved Host locale preference, then English. Client tags are bounded/validated and normalized to supported primary languages. Host metadata is a single strict `--client-lang en|zh` pair; malformed or duplicate pairs fail before coordinator dispatch and cannot manufacture removal-risk acceptance. Language is captured per invocation, with no global last-client cache. Missing or unsupported caller context leaves Host-only behavior intact. JSON tool keys/statuses and English wire messages remain unchanged.

The package exports separate Node ESM and browser-factory Client artifacts and declares an immediate Web Client dependency on locale and API remotes. The build runs TypeScript then esbuild into `window.__ModuleLoader__.load`; there are no runtime imports in the browser factory. Tests run the generated factory, the real Cordis Client lifecycle, two independent callers against one Host handler, precedence, language changes, accessor receiver preservation, unrelated-command isolation, and teardown. New Client metadata requires refreshing an already-open Web page. This does not add a source watcher or imply live HMR without a running Web rebuild watcher. A native App that does not load the Cordis Web Client needs its own sender-side bridge; this Web entry must not be represented as automatically fixing that separate carrier.

Manual Client-bridge verification additionally mounted the installed rc.4 Gateway and generated Commands Remote contribution in a real Cordis tree with an in-memory carrier: the actual SDK accessor forwarded Chinese/English metadata and restored its original behavior on teardown. The live Host command handler returned Chinese and English help from per-call metadata while the saved Host preference was absent. The existing GUI origin advertised the new immediate Client graph row and served its revisioned factory with authenticated HTTP 200. No browser realm was connected to Inspector during that check, so visual rendering or automatic native-App loading was not claimed.

First adoption by this already-running Host-only development install encountered DSH's cached negative package-metadata result. Ordinary plugin reload did not discover the newly added Client declaration. A package-subpath entry was tested and reverted because rc.4 scans bare package names or paths, not package subpaths. For this development deployment only, the local Inspector refreshed just this package's metadata cache and reconciled its existing Loader entry; no core file or global setting was changed, and no restart was performed. The plugin does not ship that administrative cache manipulation. Other running Host-only installs may need one Host restart when first adopting the Client declaration; fresh installs discover it normally.

## GitHub credentials

The existing `githubTokenEnv` field is a validated reference name, default `GITHUB_TOKEN`. The adapter dynamically looks up optional `ctx.credentials` for each GitHub API metadata request and resolves only that reference. The structural contract matches DSH's `resolve(ref): Promise<{ value, source } | undefined>`; no new runtime DSH dependency, local file parser, record enumeration, credential write, or token-bearing diagnostics are introduced. The default local provider reads a version-1 YAML document with `refs` and `records` and already owns file permissions and hot reload. Stored refs outrank inherited launch environment, project dotenv and DSH-home dotenv. This precedence is delegated, not reimplemented.

An available provider is authoritative, including an absent result; a thrown provider exception is sanitized and does not fall through to `process.env`. Only when the service is unavailable does the selected process environment variable supply compatibility behavior. Neither the service nor environment is captured at activation, so no token is read on startup and subsequent requests see provider changes, removals and newly available services. The HTTP client accepts an optional async resolver with precedence over its legacy standalone static token option; an absent resolved token cannot resurrect the static token. Resolution happens only for the exact HTTPS GitHub API origin, under the same timeout and caller-cancellation boundary as HTTP. Invalid bearer values and resolver errors send no request and yield a typed bilingual diagnostic without provider text or a cause chain. Late resolver settlement after abort cannot send a request or create an unhandled rejection. Tests cover precedence, rotation, removal, optional service appearance, environment-only compatibility, origin isolation, lookup failure, token redaction, deadline/cancellation, and real Cordis command/tool wiring. The developer did not read or edit the user's actual credential document. A supported-CLI reload and subsequent live tool checks succeeded: `dsh-hint-shell` reported current and `dsh-mloader` reported a different upstream commit. These requests verify the activated request path, not whether a real stored token was present; no credential status/value was inspected and no offered update was executed.

## Checking

Checks are explicit and sequential. Each provider returns `current`, `update-available`, `pinned`, `unknown`, or `unsupported`; the coordinator adds `skipped` and `error`. One provider's error does not discard other results. Caller cancellation and unload abort metadata reads. No periodic timer exists; the HTTP deadline timer is cleared after each request.

npm metadata is read directly from the selected registry's packument. The package name, chosen version manifest and bundle declaration must agree. The effective current registry is obtained from the manager unless explicitly overridden. This does not reconstruct historical per-package registry selection or inherit private npm credentials. Stable versions use SemVer comparison, not string comparison; range compatibility is not a version-selection policy in this iteration.

GitHub source checks resolve one ref through the commits API. They compare full commit identities, independently of the manifest version. The installed baseline comes only from an exact source SHA or a matching dependency in the root lockfile importer. The reader bounds input to 4 MiB, disables YAML aliases, rejects a mismatched repository/ref, and does not scan arbitrary transitive entries for a convenient SHA. An unsupported lockfile representation produces `unknown`, not a speculative update.

GitHub release checks use the stable latest-release endpoint, require a stable SemVer tag with optional `v`, and choose one exact uploaded tarball. A release's source archive is not substituted for a prepared attachment. Asset URLs must match the requested GitHub repository, release tag and filename. No checksum verification is implemented beyond whatever pnpm records and verifies during its own operation.

The JSON transport refuses redirects, credentials, query strings and fragments; sends an optional token only to `https://api.github.com`; bounds streamed bytes; and gives headers/body reading a common deadline. Direct provider users are trusted Host code; external input should enter through source inference and validated configuration.

Owned `UpdaterError` diagnostics are rethrown intact instead of being swallowed by the transport catch. Non-success responses retain HTTP status. GitHub-origin `403` needs `X-RateLimit-Remaining: 0` or a valid `Retry-After` hint to identify a rate limit; any-origin `429` is rate limiting. Retry-After delay seconds or an HTTP date take precedence over GitHub's quota-reset epoch, which is used only when the primary quota is exhausted. Invalid or past times are omitted; accepted hints become ISO UTC `detail.params.retryAt`. Classification reads headers only and cancels the error body without waiting, so arbitrary remote diagnostics, IP addresses, credentials, and stalled cancellation cannot replace or delay the status error. These are advisory retry times, not automatic retries or success guarantees. Timeout, caller cancellation, body limits, missing bodies and invalid UTF-8/JSON retain separate typed identities; arbitrary transport errors are sanitized. Integration tests carry rate-limit details through both GitHub providers, coordinator, JSON tool, plan refusal, and Chinese command presentation.

## Planning and execution

A plan is a deeply frozen copy of the checked bundle, source and exact candidate. It includes a random id, timestamps, risk warnings and a copyable user command. At most 32 plans are retained, without a pruning timer. Expired plans are pruned on plan creation and refused on execution. Plan state is deliberately process-local and is discarded on unload.

Before any write, execution compares the current bundle fingerprint and inferred source with the planned snapshot. This includes the saved version/source, enabled state, protection, effective registry and known baseline. It then consumes the plan and serializes this plugin's own removal/install pair. Another client can still change the profile between the public management calls; the adapter does not pretend to hold a transaction lock across them.

Normal execution requires successful removal before installation. `stop-profile` is the only removal refusal that permits the official install-over fallback. Other failures stop immediately. Installation gets an exact candidate, `saveExact: true`, the original enabled state and a request id. It receives neither approved build names nor version exemptions.

Once removal starts, unload or caller cancellation does not interrupt the recovery-critical install. Disposal aborts checks, clears plans, and awaits active operations. DSH owns the package-manager subprocess and its cancellation policy. A successful host answer is checked against the observed package and expected version/revision. `restart-required` remains distinct from `updated`. Installation failure can leave the package absent; exact prior npm versions, Git baselines or release URLs become manual recovery suggestions where available, not automatic rollback attempts.

Exact target installation intentionally records a new version/commit pin. Continued npm tracking needs `sources.<name>.allowPinned`; continued Git branch tracking needs `sources.<name>.ref`. This policy is shown in each plan rather than silently overriding user configuration.

## Next extension points

- Register controls and tags through the official `plugins.detail.actions` and `plugins.detail.badge` slots. A future mutation UI must call the same coordinator and keep risk acceptance user-only. The Client entry currently only bridges command language; a stable updater Remote boundary and matching read-only tool contract still need verification before adding page controls.
- Single-plugin index configuration is reserved as `sources.<name> = { kind: 'index', url }`; it currently reports unsupported. Global `indexes` are accepted but never fetched. Global indexes must not take over npm packages. Define source identity, precedence, conflict handling, trust and integrity before making either path active.
- DSH's existing market index format supports npm and commit-pinned Git, not release attachments. Evaluate a compatible adapter before introducing a new format.
- Private npm authentication, additional Git hosts, monorepo paths, prereleases, update batching, scheduled checks, rollback and self-update are not implemented.

## Development

```sh
pnpm install --ignore-scripts
pnpm check
pnpm test
pnpm pack
```

Tests use `node:test` against compiled modules. Source output is generated by TypeScript; edit TypeScript rather than generated JavaScript. The pack and Git preparation scripts build the runtime. Keep the package's exported resources and distribution file list aligned with the actual output. Do not install into a live profile or restart it as an incidental development check.
