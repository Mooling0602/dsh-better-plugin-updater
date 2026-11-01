# dsh-better-plugin-updater

A TypeScript Cordis bundle for manually checking and updating third-party DeepSeek Harness plugin bundles. It uses DSH's existing plugin manager for package changes, rather than running a second package manager.

## Initial implementation

- List the current profile's bundle inventory, including disabled bundles.
- Check npm channels, GitHub repository refs, and exact GitHub release tarball attachments.
- Review a frozen, expiring update plan before explicitly executing one update.
- Retain the bundle's enabled/disabled selection and report both management stages and the remaining package.
- Offer read-only checks and plans to the agent through `plugin_updates` when the tools service is available.

There are no startup checks, scheduled jobs, automatic updates, or automatic restarts. The bundle includes a Host coordinator and a small Web Client language bridge; buttons in the official plugin page are not implemented yet. Single-plugin and global custom indexes are reserved configuration interfaces; this version never fetches them.

## Build and use

Requires Node.js 22 or later and a managed DSH profile with `pluginManager`, `profileContext`, and `commands`. The adapter is based on DSH `0.2.1-rc.4`. Installation and hot activation in a live Web profile, plus a read-only GitHub release check, have been verified. Real plugin upgrades and browser UI behavior remain unverified.

```sh
pnpm install --ignore-scripts
pnpm build
pnpm test
pnpm pack
```

The generated package includes compiled JavaScript, declarations, the bundle patch, English/Chinese display metadata, and an original SVG icon. Git-source installations use the `prepare` build step and may require DSH's normal build-script approval. No live profile is installed or changed by the development tests.

Slash commands display human-readable summaries, grouped check results, and clearly separated risks and confirmation instructions. The `plugin_updates` model tool retains its structured JSON output over the same coordinator. A bare command lists bundles; `help` shows usage without starting a check.

After installing the built bundle through DSH's normal bundle installer, use:

```text
/plugin-updater
/plugin-updater help
/plugin-updater list
/plugin-updater check
/plugin-updater check example-plugin
/plugin-updater plan example-plugin
```

Inventory is grouped into profile plugins, DSH-provided bundles, and missing or uninstalled entries. Checks put available updates and failures first, show version or compact commit comparisons, and retain reasons for skipped packages. Update results distinguish completion, required restart, partial failure, pending script approvals, and manual recovery.

A successful plan contains its exact target, expiry, warnings, and a copyable command:

```text
/plugin-updater update <plan-id> --accept-removal-risk
```

Read the plan before running that command. Plans are single-use, expire after ten minutes by default, and disappear when this plugin unloads. The agent tool cannot execute them.

## Languages

Human-facing commands support English (`en`) and Simplified Chinese (`zh`). The Web Client entry reads the caller's actual `ctx.locale.getSnapshot().active` on every updater command, including a provisional UI language that was never saved. Selection order is explicit command `--lang`, explicit plugin `language: en | zh`, current caller UI language when `language: auto`, saved Host `locale.preference`, then English. Regional English/Chinese tags use their primary language. Unsupported or unavailable caller locales leave the Host fallback intact. Different Client trees do not share a last-language cache or overwrite global settings.

The bridge uses DSH rc.4's existing string command wire: it adapts this Client's public `remote.commands.execute` accessor only for `/plugin-updater` and appends validated presentation metadata `--client-lang en|zh`. The Host consumes that metadata without changing command actions, targets, risk acceptance, attachments or cancellation. Unload restores the original accessor; captured adapters become inert. This is a version-sensitive compatibility adapter, not a new core protocol field or a global fetch patch. Refresh an already-open Web page after installation to load the new Client entry; merely rebuilding Host code does not activate a previously absent browser half. DSH also caches a package's lack of Client metadata: when first upgrading an already-running Host-only installation, one Host restart may be needed for discovery. Fresh installations do not have that stale negative cache. Native Apps that do not load Cordis Web Client modules need their own sender-side bridge; the native UI language is not guessed from Host OS settings.

Set this plugin row's `language` configuration to `en` or `zh` to force a default, or override one command without changing any preference:

```text
/plugin-updater --lang zh
/plugin-updater check dsh-hint-shell --lang zh
/plugin-updater help --lang en
```

A single `--lang en|zh` pair may appear before or after the action. Command keywords, package names, versions, URLs, plan ids, and `--accept-removal-risk` are never translated. Descriptions in the command picker use the language at registration; command results capture the current invocation language, including Client context. Third-party diagnostics remain in their original language.

The agent tool keeps English message text and stable JSON keys/status identifiers. Optional `detail` and `warningDetails` descriptors carry typed translation keys beside those fields; command rendering uses the keys rather than matching English diagnostic strings.

## Source policy

| Source | Behavior |
| --- | --- |
| npm | Ask the effective current registry, or an explicit per-package registry. Use `latest` unless a channel is configured. Compare stable SemVer versions and do not propose downgrades. |
| GitHub source | Resolve the tracked ref to a full commit SHA. Compare it with a matching root-importer pnpm lockfile entry or an explicitly recorded SHA. An unknown baseline is not an actionable update. |
| GitHub release | Ask the latest stable release and choose one exact uploaded `.tgz` or `.tar.gz` attachment. Infer its filename template from the current attachment, or configure one. |
| Local directory, unknown host or unsupported selector | Report unsupported without falling back to another source. |
| Installation-provided, protected, broken, self, or official-target bundle | Skip. Official on-demand bundles retain DSH's built-in Update behavior. |

Exact npm versions and SemVer-like Git tags/commit pins are protected by default. Updates deliberately save exact versions/commits. To keep offering subsequent updates, explicitly opt an npm package into pinned updates, or configure the Git ref to keep following. Other named Git refs are treated as tracking refs; arbitrary tag classification and Git SemVer/path selectors are not supported.

Configure this bundle's row through DSH's normal configuration mechanism. For example, the row configuration can contain:

```yaml
sources:
  example-plugin:
    kind: npm
    registry: https://registry.npmjs.org/
    channel: latest
    allowPinned: true
  github-plugin:
    kind: github-source
    repository: owner/repository
    ref: main
  release-plugin:
    kind: github-release
    repository: owner/repository
    assetTemplate: plugin-{tag}.tgz
```

Overrides must match the installed source kind and GitHub repository identity. They do not redirect a package to an unrelated repository. Release templates accept `{tag}` and `{version}` and match exactly one asset, not an arbitrary wildcard.

Registry checks use bounded HTTPS JSON requests, not `pnpm view`. They do not inherit npm's authentication or scoped registry configuration. Configure a per-package registry explicitly where needed; authenticated private npm registries are not supported yet. The original registry of an old installation cannot always be recovered, so the effective current registry is the fallback, not a claim about the original source.

## GitHub API credentials

GitHub metadata requests optionally resolve the `GITHUB_TOKEN` credential reference through DSH's official `ctx.credentials` service. The backward-compatible `githubTokenEnv` option selects a different reference name; it is not a token value. The local provider uses this precedence: saved credential references, inherited launch environment, project dotenv, then DSH-home dotenv. Thus a saved token takes priority over an environment variable with the same name.

For the default local provider, merge a reference into the existing document rather than replacing its other references or records:

```yaml
# ~/.dsh/.credentials.yaml (or the credentials provider's configured path)
version: 1
refs:
  GITHUB_TOKEN: "<your GitHub API token>"
```

Leave the plugin configuration at its default, or use a custom reference in both places:

```yaml
# Plugin configuration: reference name only, never the secret itself
githubTokenEnv: MY_GITHUB_TOKEN
```

Only the selected reference is resolved, anew for each GitHub API request; the plugin never enumerates credentials, reads other plugins' records, parses or writes the credential document, or copies its values into the environment. After the Host provider reloads a stored token change, the next request uses it without restarting this plugin or DSH. The provider owns the path, file validation, permissions and reload behavior. If no credentials service exists, only the selected process environment variable is used as a compatibility fallback; an available provider's absence or error is not bypassed with a second environment lookup.

Credential lookup uses the request deadline and cancellation. Lookup errors or malformed bearer tokens produce a sanitized error without sending an HTTP request. No token value or provider exception text is returned by commands or tools. The resolved token is sent only to `https://api.github.com`, never to a registry or release-attachment host. It does not authorize the subsequent pnpm installation; DSH and its package manager still own installation credentials.

## Request diagnostics

Checks retain specific HTTP status codes, response-size violations, missing bodies, invalid UTF-8/JSON, timeouts, and caller cancellations instead of replacing them with one generic failure. Network/transport failures remain sanitized.

GitHub `403` responses are identified as rate limiting only when quota exhaustion (`X-RateLimit-Remaining: 0`) or a valid `Retry-After` header confirms it; other forbidden responses retain HTTP `403` without guessing the cause. HTTP `429` is reported as rate limiting on any metadata server. A valid `Retry-After` delay/date, or GitHub's exhausted-quota `X-RateLimit-Reset`, supplies the earliest suggested retry time as ISO 8601 UTC in both the message and `detail.params.retryAt`. Missing, malformed, or past hints do not invent a retry time. GitHub diagnostics also explain the optional token configuration for unauthenticated requests.

These hints do not trigger automatic retries, waits, or scheduled checks, and do not guarantee the next request will succeed. Error response bodies and raw header values are never echoed; diagnostics contain only known message text, the numeric HTTP status, and normalized retry timestamps. Slash commands localize these diagnostics; the tool retains English text and typed details.

## Update risks and limits

**Updating is not an atomic transaction.** The normal path removes the old bundle, then installs the planned target. If installation fails or needs unapproved build scripts, the old package may be absent. The result includes an exact recovery target when one is known, but recovery is manual. No compatibility exemption or new build-script permission is granted by this plugin.

When DSH refuses removal with `stop-profile`, this adapter follows the official page's install-over path and reports any restart requirement. It does not restart DSH itself. Once removal starts, an update is awaited through installation even if the command caller disconnects, so cancellation does not deliberately leave a removed package unreinstalled.

The executor rejects stale plans if the package, enabled state, source, effective registry, or known Git baseline changed. It serializes its own updates. Other DSH clients still have their own operations, and the public API provides no transaction spanning removal and installation. A failed activation is not reported as a successful update. Matching release metadata is not a cryptographic signature or a tarball checksum guarantee.

See [the maintainer context](<CONTEXT.md>) for architecture and extension boundaries.

## License

MIT. The existing copyright and license are retained.
