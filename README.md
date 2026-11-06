# dsh-better-plugin-updater

**English** | [简体中文](README.zh.md)

Check for and install updates to your DeepSeek Harness plugins, without leaving DSH.

It uses DSH's own plugin manager to change packages, so an update goes through the same path as the plugin page. Nothing runs in the background and nothing restarts on its own: you ask for a check, you see the exact target, and you confirm.

## Requirements

- Node.js 22 or later.
- A managed DSH profile, in the Web app, the desktop app or the terminal.

## Install

```sh
dsh plugin --profile web add github:Mooling0602/dsh-better-plugin-updater
```

Replace `web` with the profile you use. Then refresh an already-open Web page so the browser half loads. This package ships prebuilt files, so the install runs no build step. Its own dependencies need no install scripts either, though a profile policy can still prompt for other packages.

To remove it:

```sh
dsh plugin --profile web remove dsh-better-plugin-updater
```

If the update commands do not appear after a refresh, restart DSH once. DSH remembers that an installed package had no browser code, and an installation that was already running without the browser half keeps that cached answer until DSH starts again. A fresh installation does not hit this.

## Use

```text
/plugin-updater                   list installed plugin bundles
/plugin-updater check             check every bundle for updates
/plugin-updater check foo         check one bundle
/plugin-updater update foo        show the exact target and confirm
/plugin-updater ok                carry out the confirmed update
/plugin-updater help              show usage
```

Updates are never applied until you confirm them. `/plugin-updater update foo bar` accepts several packages at once, and `*` or `?` match package names. Repeating the command, or sending `ok` or `confirm`, performs the update you were just shown.

If you already know what you want and accept the risk described below:

```text
/plugin-updater update foo --accept-removal-risk
```

### Choose a language

Commands follow your interface language. To force one:

```text
/plugin-updater --lang zh
/plugin-updater check foo --lang zh
```

### Let the agent check for you

The same checks are available to the agent as the read-only `plugin_updates` tool. It can list bundles and check for updates, but it cannot install updates, accept the removal risk, approve a build script or grant a compatibility exemption. Updates require your slash command.

## What it can check

| Where the plugin comes from | How an update is found |
| --- | --- |
| npm | The highest stable version in your registry. Downgrades are never proposed. |
| A Git repository | The newest commit on the tracked branch, compared with the commit you installed. |
| A GitHub release | The highest version tag, prereleases included. GitHub's "latest" marker is ignored. |
| A local folder, or anything else | Reported as unsupported rather than guessed at. |

Fixed npm versions are checked for newer versions but remain protected from updates. Use `/plugin-updater update foo --allow-pinned` to authorize one update and confirm it normally, or set `allowPinned` in the configuration for ongoing authorization. The one-time option cannot be combined with `--accept-removal-risk`, and the newly installed version remains pinned. Pinned Git commits remain protected; configure `allowPinned` or the Git ref to follow. See [configuration](#configuration).

DSH's own bundles and protected packages are skipped. This plugin can check its own supported installation source, but it cannot update itself. Use an external method appropriate for its source. A local linked installation is not supported by the update checker.

## Risks

**An update is not atomic.** The old package is removed before the new one is installed. If the install then fails, or the package needs a build script you have not approved, the package can be left missing. A recovery target is printed whenever one is known, but recovery is manual and there is no automatic rollback.

This plugin never approves build scripts and never grants a compatibility exemption for you.

## Configuration

Most settings have a form in DSH's plugin settings page. Open the plugin's entry there, edit the fields and press Save, and the new value applies the next time the plugin uses it, without a restart. The form's labels follow your interface language. `sources` and `indexes` are set in the profile patch, because a nested per-package override is not a form field.

Every field is optional.

| Field | Default | Purpose |
| --- | --- | --- |
| `language` | `auto` | `auto`, `en` or `zh`. `auto` follows your interface language. |
| `sources` | empty | Per-package overrides, described below. |
| `githubTokenEnv` | `GITHUB_TOKEN` | The credential reference to resolve. Not a token value. |
| `requestTimeoutMs` | `15000` | Deadline for one metadata request. |
| `maxMetadataBytes` | `4194304` | Largest metadata response accepted, in bytes. |
| `planTtlMs` | `600000` | How long a confirmation stays valid. |

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

An override must match the source the plugin was actually installed from. It cannot point a package at an unrelated repository.

`index` sources and the global `indexes` list are reserved interfaces. This version accepts them and never fetches them.

## GitHub token

GitHub allows far fewer anonymous requests. If checks fail with a rate limit, add a token once and the limit stops getting in the way:

```yaml
# ~/.dsh/.credentials.yaml
version: 1
refs:
  GITHUB_TOKEN: "<your GitHub token>"
```

Only that one reference is read, and only when a GitHub request needs it. The token is sent to `api.github.com` and nowhere else. It does not apply to the package download itself, which DSH and pnpm handle separately.

To use a different reference name, change `githubTokenEnv` to match.

## Troubleshooting

**Checks fail with a rate limit.** Add a token, as described above. GitHub reports a suggested retry time when a limit is confirmed, but this plugin never retries on its own.

**A check reports `unsupported`.** The package was installed from a local folder or another source this plugin cannot read. Reinstall it from npm, a Git repository or a release asset.

**The package disappeared after a failed update.** Reinstall it using the recovery target printed in the update result. Recovery is manual by design.

**The update command is missing.** Refresh the Web page. If it is still missing, restart DSH once so the package metadata is read again.

See [the maintainer context](CONTEXT.md) for architecture, wire formats and extension boundaries.

## License

MIT
