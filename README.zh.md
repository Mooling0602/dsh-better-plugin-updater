# dsh-better-plugin-updater

[English](README.md) | **简体中文**

在你的 DeepSeek Harness 里检查和安装插件更新，不必离开 DSH。

它用 DSH 自己的插件管理器来改动软件包，所以一次更新走的是和插件页面相同的路径。后台不会运行任何东西，也不会自行重启：检查由你发起，确切目标先给你看，最后也由你确认。

## 环境要求

- Node.js 22 或更高版本。
- 一个受管理的 DSH profile，可以是 Web 应用、桌面应用或终端。

## 安装

```sh
dsh plugin --profile web add github:Mooling0602/dsh-better-plugin-updater
```

把 `web` 换成你在用的那个 profile。然后刷新已经打开的 Web 页面，让浏览器那一半加载进来。这个包自带预构建文件，安装过程不执行构建步骤。它自身的依赖也不需要安装脚本，不过 profile 的策略仍可能就其他包向你询问。

要卸载：

```sh
dsh plugin --profile web remove dsh-better-plugin-updater
```

如果刷新之后更新命令仍未出现，重启一次 DSH。DSH 会记住某个已安装的包没有浏览器代码，而在缺少浏览器代码的状态下已经运行起来的安装，会一直保留这个缓存的答案，直到 DSH 再次启动。全新安装不会遇到这种情况。

## 使用

```text
/plugin-updater                   列出已安装的插件包
/plugin-updater check             检查全部插件包是否有更新
/plugin-updater check foo         检查一个插件包
/plugin-updater update foo        显示确切目标并等待确认
/plugin-updater ok                执行已确认的更新
/plugin-updater help              显示用法
```

未经你的确认，不会执行任何更新。`/plugin-updater update foo bar` 可以一次指定多个包，`*` 和 `?` 可以匹配包名。重复执行该命令，或者发送 `ok`、`confirm`，就会执行刚才向你展示的那次更新。

如果你已经清楚要做什么，并且接受下文所述的风险：

```text
/plugin-updater update foo --accept-removal-risk
```

### 选择语言

命令跟随你的界面语言。要强制指定一个：

```text
/plugin-updater --lang zh
/plugin-updater check foo --lang zh
```

### 让 agent 替你检查

同样的检查也以只读工具 `plugin_updates` 提供给 agent。它可以列出插件包并检查更新，但不能安装更新、接受移除风险、批准构建脚本或授予兼容性豁免。执行更新需要由你使用斜杠命令。

## 能检查哪些来源

| 插件来源 | 如何找到更新 |
| --- | --- |
| npm | 你的 registry 中最高的稳定版本。不会建议降级。 |
| Git 仓库 | 跟踪分支上的最新提交，与你安装的那个提交比较。 |
| GitHub release | 最高的版本标签，包含预发布版本。忽略 GitHub 的 `latest` 标记。 |
| 本地目录或其他来源 | 报告为不支持，而不是猜测。 |

固定版本的 npm 插件和固定提交的 GitHub 源码插件仍受更新保护。使用 `/plugin-updater update foo --allow-pinned` 可临时允许本次更新，仍需正常确认；也可以在配置中设置 `allowPinned` 持续允许更新。固定的 Git 提交默认与仓库默认分支比较，也可通过 `sources.foo.ref` 指定引用。使用 `/plugin-updater update foo --allow-pinned --git-branch feature/name` 可临时指定分支；批量操作时，该分支适用于所有选中的 GitHub 源码插件。选定分支不一定包含已安装的提交，请确认前核对精确目标。`--allow-pinned` 和 `--git-branch` 均不能与 `--accept-removal-risk` 同时使用，安装后的目标仍会固定。见[配置](#配置)。

DSH 自带的插件包和受保护的包会被跳过。本插件可以检查自身受支持的安装来源，但不能自行更新；请根据安装来源使用外部方式更新。本地链接安装不受更新检查器支持。

## 风险

**更新不是原子操作。** 安装新版本之前会先移除旧包。如果随后安装失败，或者该包需要你尚未批准的构建脚本，这个包就可能缺失了。只要已知恢复目标就会打印出来，但恢复需要人工完成，没有自动回滚。

来自 npm registry 的包会在移除旧包之前先下载新版本及其依赖，因此安装阶段不再需要网络。如果下载失败，更新会中止，已安装的包保持不变。GitHub 来源和 release tarball 不会提前下载，这类更新在安装阶段仍然需要网络。

本插件不会替你批准构建脚本，也不会替你授予兼容性豁免。

## 配置

大多数设置都出现在 DSH 的插件设置页里。在插件条目里打开，改完按保存，新值会在插件下次用到它时生效，不需要重启。表单文案跟随你的界面语言。`sources` 和 `indexes` 写在 profile patch 里，因为针对单个包的嵌套覆盖无法用表单字段表达。

所有字段都是可选的。

| 字段 | 默认值 | 用途 |
| --- | --- | --- |
| `language` | `auto` | `auto`、`en` 或 `zh`。`auto` 跟随你的界面语言。 |
| `sources` | 空 | 针对单个包的覆盖项，见下文。 |
| `githubTokenEnv` | `GITHUB_TOKEN` | 要解析的凭据引用名。不是 token 值本身。 |
| `requestTimeoutMs` | `15000` | 单次元数据请求的期限。 |
| `maxMetadataBytes` | `4194304` | 单次元数据响应的最大字节数。 |
| `planTtlMs` | `600000` | 一次确认的有效时长。 |

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

覆盖项必须与插件实际安装时的来源一致。它不能把某个包指向一个无关的仓库。

`index` 来源和全局 `indexes` 列表是预留接口。本版本接受它们，但从不抓取。

## GitHub token

GitHub 对匿名请求的限制紧得多。如果检查因为速率限制而失败，添加一次 token，这个限制就不再挡路：

```yaml
# ~/.dsh/.credentials.yaml
version: 1
refs:
  GITHUB_TOKEN: "<你的 GitHub token>"
```

只会读取这一个引用，而且只在 GitHub 请求需要时才读。token 只发送给 `api.github.com`，不发给任何其他地方。它不适用于包下载本身，那部分由 DSH 和 pnpm 各自负责。

要使用别的引用名，把 `githubTokenEnv` 改成对应的名字。

## 故障排查

**检查因为速率限制失败。** 按上文添加 token。确认属于速率限制时，GitHub 会给出一个建议的重试时间，但本插件从不自行重试。

**检查报告 `unsupported`。** 该包是从本地目录或本插件读不到的其他来源安装的。请从 npm、Git 仓库或 release 附件重新安装。

**更新失败后包不见了。** 用更新结果里打印的恢复目标重新安装。恢复需要人工完成，这是有意如此。

**更新命令不出现。** 刷新 Web 页面。如果仍然没有，重启一次 DSH，让包元数据被重新读取。

有关架构、通信格式与扩展边界，见[维护者说明](CONTEXT.md)。

## 许可证

MIT
