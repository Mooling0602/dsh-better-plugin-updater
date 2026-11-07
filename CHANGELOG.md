# Changelog

Release notes for this DSH plugin bundle. Version sections are ordered newest first, and the release workflow reads only the section it is publishing.

## Header

> [!NOTE]
> Install or update from the package attached below: copy its link and paste it into dsh's "Add plugin" input field. The same package is also published on npm, so that field accepts `dsh-better-plugin-updater` as well and installs it from the npm registry. The plugin's slash commands work with almost every front end (web, the desktop app, [dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI), [dsh-Go](https://github.com/ccch1mneyyy/dsh-go), and others), so you can install it with `dsh plugin --profile <profile> add dsh-better-plugin-updater|<release-tarball-link>`. You can also send this version's page to AI to have it translate the notes or perform the installation.
>
> 使用下方附带的插件包安装或更新：复制它的链接并粘贴到 dsh 的“添加插件”输入框中。同一个包也发布在 npm 上，因此该输入框同样接受 `dsh-better-plugin-updater` 并通过 npm 源安装。插件的斜杠命令功能可以支持几乎所有前端（web、桌面版、[dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI) 和 [dsh-Go](https://github.com/ccch1mneyyy/dsh-go) 等），因此你可以通过 `dsh plugin --profile <profile> add dsh-better-plugin-updater|<release-tarball-link>` 进行安装。你也可以将此版本的详情页发送给 AI，让它帮你翻译信息或进行安装。

## Endfix

**full_changelog!**

## 0.1.1

### Fixes

- Remove the duplicated version heading from the GitHub release body, and regenerate a published body from the changelog without touching its tag or assets, in commit 3cb0fc7.
- Publish through npm staged publishing, so the second factor stays with a maintainer instead of the workflow, in commit 5c7eee0.

### Documentation

- Label the command paragraph in the plugin introduction, in commit 15d0def.

## 0.1.0

### Features

- Check npm registry, GitHub source and GitHub release bundles for updates without leaving DSH, in commit 445df23.
- Update a GitHub-sourced plugin from its own detail page; npm packages keep DSH's native version controls, in commit 46d7cd7.
- Show the exact install target and require an explicit risk acknowledgement before any package is removed, in commit 445df23.
- Stage a registry target in the profile store before removal, so a failed download leaves the installed package in place, in commit 0d4fdbf.
- Support a fixed npm version or Git commit through a one-time authorization, and pick a Git ref for one operation, in commit 0d4fdbf.
- Offer a read-only `plugin_updates` tool that can list and check but never install, in commit 445df23.
- Report command output and the detail page in English or Simplified Chinese, in commit 445df23.
