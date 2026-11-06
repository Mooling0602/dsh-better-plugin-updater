在 DSH 中检查 npm 和 GitHub 插件包的更新。更新开始前，先审阅确切目标并确认。

使用 `/plugin-updater check` 检查已安装的插件包，或使用 `/plugin-updater update foo` 准备更新。使用 `/plugin-updater help` 查看全部命令。Agent 也可以通过只读工具 `plugin_updates` 检查更新，但不能安装。

更新会先移除旧包，再安装新包。如果安装失败，需要手动恢复。

[使用指南](https://github.com/Mooling0602/dsh-better-plugin-updater/blob/main/README.zh.md) · [反馈问题](https://github.com/Mooling0602/dsh-better-plugin-updater/issues)
