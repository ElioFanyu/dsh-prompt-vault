# dsh-prompt-vault

一个 DSH Web 插件：把常用的提示词存成**本机的 Markdown 文件**，在任意会话里一键插入复用。

解决的问题很具体：你在会话里写出一段好用的提示词，它只活在这次对话里；换个会话、
换台机器就找不回来了。装上这个插件之后，提示词变成磁盘上一条 `.md`，
Obsidian、Git、记事本都能直接打开——而且输入框工具栏里随时能插回来。

**文件才是唯一真相。** 没有私有数据库、没有导出按钮：库就是一堆带 frontmatter 的
Markdown 笔记。把 `vaultDir` 指到 Obsidian 库里的文件夹，它同时就是一个笔记文件夹。

## 它解决了什么

| | |
| --- | --- |
| 提示词不再被困在会话里 | 存成 `.md`，任何会话、任何时间都能插回输入框 |
| 不锁定格式 | 纯 Markdown + YAML frontmatter，Obsidian / Git / 任意编辑器都能读 |
| 搜索框即输入框 | 直接粘贴一段提示词，点保存就成为一条笔记 |
| 可编辑 | 点铅笔改标题/标签/正文，**文件名保持不变**，上一版自动进 `.history/` |
| 误删可救 | 删除是软删除，文件移到 `.trash/` 并带时间戳 |
| 模型也能用 | 暴露 `prompt_vault` 工具，让模型自己保存、读取、导入提示词 |

## 用起来是什么样

输入框工具栏左侧多一个「提示词」按钮，点开是一个面板：

- **点一行** → 这条提示词的正文插入到光标处（先插入一条空行，再接正文）
- **搜索框** → 同时也是输入框：直接粘贴一段提示词，点右侧「保存」或按 `Ctrl+Enter`，
  就存成一条新提示词（标题取正文首行）。下方还会出现「＋ 把『……』保存为新提示词」，
  想先改标题和标签就点旁边的「先改标题…」。
  短的单行输入仍然当作搜索过滤；**多行长文本不再过滤列表**，这样贴完还能看到全库。
- **铅笔「编辑」** → 打开表单改标题、标签、正文；**文件名保持不变**，上一版自动归档
- **新建** → 空白表单，手写一条
- **存草稿** → 把输入框里现在的内容存成一条新提示词
- **删除** → 点两次确认；默认移到 `.trash/`，可以找回
- **库目录** → 面板底部显示当前目录

## 模型工具 `prompt_vault`

`action` 取：

| action | 作用 |
| --- | --- |
| `list` | 列出全部提示词（标题、id、标签、预览） |
| `get` | 读一条的完整正文 |
| `save` | 新建或覆盖一条（给 `id` 就是改，不给就是建） |
| `import` | 把磁盘上的文本文件导入成提示词 |
| `remove` | 删除一条 |
| `where` | 返回库目录与统计 |

所以「把这个文件存进提示词库」只要一句话：`import` 会直接读那个文件，
不必先把全文贴进对话。

## 安装

```bash
dsh plugin --profile <profile> add link:<本仓库路径>
```

或用 `plugin_manager` 的 `install_bundle`，`target` 传本仓库的绝对路径。
装完刷新页面，输入框工具栏就会出现「提示词」按钮。

要求 DSH `>=0.2.1-rc.3 <0.3.0-0`，Node `>=20`。

## 存到哪

默认是 `%DSH_HOME%/prompt-vault`（Windows 上通常是
`C:\Users\<你>\.dsh\prompt-vault`）。想让它进 Obsidian 库，把这个目录改成
Obsidian 库里的一个子文件夹即可——例如 `D:/Workspace/Obsidian/提示词`。

改法：编辑 profile 的 `cordis.patch.yml`，找到本插件的行，改 `vaultDir`：

```yaml
- id: dsh-prompt-vault
  name: '@local/dsh-prompt-vault'
  config:
    vaultDir: 'D:/Workspace/Obsidian/提示词'
```

改完重启 DSH。同一目录下已有的 `.md` 会被直接识别成提示词，不需要导入。

## 文件格式

```markdown
---
title: 雨夜便利店街角
tags: [生图, 场景]
created: "2026-11-10T05:29:57.372Z"
updated: "2026-11-10T05:29:57.372Z"
description: 请制作一个雨夜便利店街角小场景…
---
（正文）
```

`title` / `tags` / `created` / `updated` / `description` 由插件读写；
**你在 Obsidian 里加的其它属性（`aliases`、`cssclass`……）原样保留**，
不会被一次保存冲掉。没有 frontmatter 的普通 `.md` 也能直接当提示词用。

## 安全与可靠性

- 正文写入是原子的（临时文件 + 重命名），不会留下写了一半的提示词
- 覆盖已有提示词之前，上一版存进 `.history/<id>/`，最多留 `historyLimit` 份（默认 20）
- 删除是软删除：文件移到 `.trash/`，带时间戳
- 超过 `maxFileBytes`（默认 256 KiB）的文件在列表与读取时跳过，并说明原因
- id 不允许 `/`、`\`、`..`、结尾的点或空格，也不允许 Windows 设备名（`con`、`nul`……）
- HTTP 通道的写操作只接受本机回环地址

## 配置项

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `vaultDir` | `''`（`<DSH_HOME>/prompt-vault`） | 提示词目录；填 Obsidian 库里的文件夹即可共存 |
| `maxFileBytes` | `262144` | 单个提示词文件的上限，超过就跳过 |
| `historyLimit` | `20` | 每条提示词保留的历史版本数；`0` 关闭历史 |
| `softDelete` | `true` | 删除时移到 `.trash/` 而不是直接删 |

## 目录结构

```
dsh-prompt-vault/
  package.json          bundle 清单（dsh.bundle.patch + dsh.client）
  cordis.patch.yml      插入插件行与默认配置
  lib/index.js          Host：存储、frontmatter、HTTP 通道、prompt_vault 工具
  lib/client.js         Client：工具栏按钮、列表、编辑表单、搜索框保存
  locale/{zh,en}.json   Plugin Manager 里显示的标题与说明
  test/host.test.js     Host 测试：存储、归档、frontmatter、危险 id
  test/ui/              Client 渲染测试（stub React，不是浏览器测试）
  icon.svg              插件图标
```

## 测试

```bash
npm test
```

17 个用例，分两类：

- **Host**（`test/host.test.js`）：编辑保持文件名、历史归档是改前内容、历史数量上限、
  外部 frontmatter 不被冲掉、正文里出现 `---` 能原样往返、危险 id 被拒、软删除可找回。
- **Client**（`test/ui/`）：把 `lib/client.js` 按浏览器的方式加载进 `vm`，用 stub React 渲染
  出真实元素树，检查编辑表单预填、搜索框是 `textarea` 且保留换行、空正文禁用保存、
  删除需二次确认，以及**每个渲染出来的 class 都有对应样式规则**（拼错的 class 会渲染成
  无样式控件，语法检查看不出来）。

这两个 Client 测试**不是浏览器测试**：它们验证结构，不验证视觉。真实渲染需要在
DSH 里打开面板确认。

## 已知限制

- 编辑表单里的「保存」用现有 id 覆盖同一条笔记，**不会改名**——重命名请自己改文件名，
  或在 Obsidian 里改。这是有意的：改名会打断 Obsidian 里的 `[[链接]]`。
- 面板没有做 Markdown 预览，编辑器就是纯文本（提示词本来就该是纯文本）。
- 没有做跨设备同步；把 `vaultDir` 指到同步盘（或 Git 仓库）就是同步方案。
- 插入走的是 composer 的 `insertText`；如果插入点已失效（面板开着时输入框内容变了），
  会明确提示重新点一次，而不是猜着追加。

## License

MIT
