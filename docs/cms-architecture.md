# GitHub-backed CMS 架构

## 边界

原始静态镜像仍是公开站点基线：根目录的 `index.html`、`products.html`、`products/*.html`、`about.html` 和资源不会被 CMS 删除或自动改写。`content/` 是抽取后的、可审计的 GitHub 内容源，供管理后台和后续公开站点构建流程使用。

```text
Cloudflare Access -> React Admin -> Cloudflare Worker -> GitHub Contents API
       |                                  |
       +-- email policy                   +-- one Git commit per mutation
```

## 内容模型

- `content/products/*.json`：产品记录，包含 `id`、展示字段和 `source.path` / `source.sha256`。
- `content/pages/home.json`、`content/pages/about.json`：现有页面抽取结果。页面 API 已支持读写，后台入口当前明确为只读/未接入编辑。
- `content/articles/*.md`：UTF-8 Markdown，使用 front matter；规范见同目录 README。
- `public/uploads/YYYY/MM/*`：Worker 使用二进制 ArrayBuffer Base64 上传的媒体文件。

`scripts/migrate_content.py` 使用 Python 标准库解析镜像并覆盖生成 JSON，重复运行结果稳定。当前镜像只有 27 个产品详情页（缺少 `27.html` 和 `28.html`），脚本只迁移实际存在的页面，不制造缺失产品。

## API 与安全

Worker 只信任 Cloudflare Access 注入的 `CF-Access-Authenticated-User-Email`，并与 `ADMIN_EMAIL` 做大小写不敏感比较。OPTIONS 预检不需要认证；其余路由都需要认证。GitHub token 只作为 Worker secret 使用。

文本先用 UTF-8 `TextEncoder` 编码再 Base64；图片使用 `File.arrayBuffer()`，避免 `File.text()` 造成二进制损坏。更新和删除带 GitHub Contents API 返回的 SHA，分支和 commit message 由 Worker 统一控制。错误响应只返回安全的状态描述，不返回 GitHub 响应体或 token。

## 本地检查

```bash
npm install --prefix apps/admin
npm install --prefix worker
npm run migrate:content
npm run build
npm run typecheck:worker
npm --prefix worker exec wrangler deploy --dry-run
```

后台使用 `VITE_API_BASE_URL`，默认 `/api`。Worker 需要 `GITHUB_TOKEN`、`GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BRANCH`、`ADMIN_EMAIL`。不要把 `.env`、`.dev.vars`、Access 认证文件或 token 提交到仓库。

## 线上发布

1. Cloudflare Pages 发布原始静态站点，并单独发布 `apps/admin/dist` 或将其挂到 `/admin`。
2. Wrangler 发布 `worker`。
3. GitHub fine-grained token 限定到本仓库，授予 `Contents: Read and write`；Metadata 读取为基础权限，不授予 Issues、Actions 等无关权限。
4. Cloudflare Access 保护 `/admin/*` 与 `/api/*`，策略只允许管理员邮箱。
5. 配置 `VITE_API_BASE_URL` 指向 Worker/API 地址后重新构建后台。

当前仓库没有线上 secrets，dry-run/类型检查不代表线上部署完成。
