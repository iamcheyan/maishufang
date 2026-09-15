# 麦书房

这是 `https://maishufang.cn` 的静态镜像，以及一个不依赖数据库的 GitHub-backed CMS。原始 HTML、CSS 和静态资源仍在仓库根目录，公开站点默认继续使用这套镜像；CMS 不会自动改写首页或产品页。

## 仓库结构

- `index.html`、`products.html`、`products/*.html`、`about.html`：原始公开站点镜像。
- `content/products/*.json`：从 27 个现存产品详情页逐字段迁移的内容源；每条记录包含源文件路径和 SHA-256。镜像实际缺少 `27.html`、`28.html`，迁移脚本不会凭空创建记录。
- `content/pages/home.json`、`content/pages/about.json`：从现存页面抽取的页面内容源。
- `content/articles/*.md`：带 front matter 的 Markdown 文章；规范和示例见 `content/articles/README.md`。
- `apps/admin`：React + TypeScript + Vite 管理后台。
- `worker`：Cloudflare Worker API，通过 GitHub Contents API 读写内容并为每次变更创建 commit。
- `public/uploads`：Worker 上传图片的目标目录。

## 本地开发

需要 Node.js 20+、npm 和 Python 3。安装依赖：

```bash
npm install --prefix apps/admin
npm install --prefix worker
```

迁移静态镜像内容（可重复运行）：

```bash
npm run migrate:content
```

构建后台并检查 Worker：

```bash
npm run build
npm run typecheck:worker
```

启动后台：

```bash
npm --prefix apps/admin run dev -- --host 127.0.0.1
```

后台从 `VITE_API_BASE_URL` 读取 Worker 地址；未设置时请求同源 `/api`。后台只保存内容，不包含 GitHub token。Worker 本地开发需要用 Wrangler 变量或 `.dev.vars` 提供运行时变量；`.dev.vars` 不得提交：

```text
GITHUB_TOKEN=github_pat_xxx
GITHUB_OWNER=iamcheyan
GITHUB_REPO=maishufang
GITHUB_BRANCH=main
ADMIN_EMAIL=admin@example.com
```

```bash
npm --prefix worker run dev
```

`.dev.vars` 仅供本地使用，仓库已忽略 `.env*` 和 `node_modules/`。没有真实 GitHub token 时可执行 Worker 类型检查和 `wrangler deploy --dry-run`，不能进行写入或假称已部署。

## API

所有非 `OPTIONS` 请求都必须经过 Cloudflare Access，并由 Worker 校验 `CF-Access-Authenticated-User-Email` 是否等于 `ADMIN_EMAIL`（大小写不敏感）。API 返回 JSON 错误；GitHub token 只存在 Worker 运行时，不会返回给客户端。

- `GET /api/health`
- `GET /api/products`、`GET /api/products/:id`
- `POST /api/products`、`PUT /api/products/:id`、`DELETE /api/products/:id`
- `GET /api/pages`、`GET /api/pages/:slug`、`PUT /api/pages/:slug`
- `GET /api/articles`、`GET /api/articles/:slug`
- `POST /api/articles`、`PUT /api/articles/:slug`、`DELETE /api/articles/:slug`
- `POST /api/upload`（multipart 字段 `file`，仅图片，最大 10 MB）

文本通过 UTF-8 编码后 Base64 写入 GitHub。图片使用 `File.arrayBuffer()` 转为二进制 Base64，绝不调用 `File.text()`。产品、页面和文章的写入/删除都使用 GitHub 返回的 SHA，避免覆盖过期版本。

## Cloudflare 部署

1. 在 Cloudflare Pages 创建站点，构建输出可继续使用仓库根目录的静态文件；后台可单独部署 `apps/admin/dist`，或通过站点路由挂载到 `/admin`。
2. 在 `worker` 目录执行 `npx wrangler deploy` 部署 API Worker。
3. 使用 Worker secret 保存 token：

   ```bash
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put ADMIN_EMAIL
   ```

   `GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BRANCH` 可放在 `wrangler.toml` 的 vars 中；生产环境应核对分支是否确实为发布分支。
4. GitHub 使用 fine-grained personal access token，仅授权 `iamcheyan/maishufang` 这一仓库，并授予 `Contents: Read and write`。不需要 Issues、Actions、Deployments 或组织级权限；GitHub 的 Metadata 读取权限是 token 的基础只读权限。
5. Cloudflare Access 建立自托管应用，保护 `/admin/*` 和 `/api/*`，策略只允许管理员邮箱。Access 的策略是第一道门，Worker 的邮箱 header 校验是第二道门。
6. 构建后台时设置 Worker/API 地址：

   ```bash
   VITE_API_BASE_URL=https://cms-api.example.workers.dev npm --prefix apps/admin run build
   ```

当前仓库没有线上 Cloudflare 账号配置、GitHub token 或 Access 认证文件；本地检查不代表线上部署成功。

## 限制与迁移边界

- GitHub 是唯一内容存储，不使用传统数据库。每次保存会产生一个 Git commit；高频编辑不适合作为协作型实时 CMS。
- Worker 当前按 GitHub Contents API 读取目录，适合本项目的小规模内容量；超大目录需要后续分页/缓存设计。
- 图片上传会提交到 `public/uploads/YYYY/MM/`，同名文件可能触发 GitHub 冲突，应使用唯一文件名。
- 后台已实现图书和文章 CRUD；页面入口当前明确标记为只读/未接入编辑，不伪装为已完成。
- 公开站点仍是原始静态镜像。`content/` 目前供 CMS 和后续构建流程使用，不会替换现有首页、产品列表、详情或关于页面。
