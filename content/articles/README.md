# 文章内容规范

文章是 UTF-8 Markdown 文件，提交到 `content/articles/` 后由公开站点构建流程消费。文件名使用小写短横线 slug，例如 `reading-notes.md`。

## Front matter

文件必须以 YAML-like front matter 开始，字段如下：

```yaml
---
title: 文章标题
slug: reading-notes
status: draft
author: 作者
published_at: 2026-09-15
cover: /uploads/2026/09/cover.jpg
---
```

- `title`、`slug` 必填；`slug` 只能使用小写字母、数字和短横线。
- `status` 使用 `draft` 或 `published`；草稿不会出现在公开文章列表。
- 日期使用 ISO `YYYY-MM-DD`。
- 正文使用标准 Markdown；图片引用必须指向仓库中的 `/uploads/...` 路径。
- 文章内容不在当前静态镜像公开页面中；新增文章不会自动改写原站 HTML。

文章 CRUD API 会将 Markdown 原文和 front matter 一起写回 GitHub，保持可审计的文本 diff。
