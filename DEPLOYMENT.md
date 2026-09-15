# 麦书房 (Maishufang) CMS 部署与运维指南

本文档指导如何将麦书房项目完整部署到 **Cloudflare 全家桶 + GitHub Contents API** 的无服务器架构中。

---

## 一、 核心架构全览

```text
[普通访客] ---> Cloudflare Pages (根目录公开静态站点)

[管 理 员] ---> Cloudflare Access (Zero Trust 邮箱验证码拦截)
                   │
                   ├──> Cloudflare Pages (React + TipTap 管理后台: /admin)
                   │
                   └──> Cloudflare Worker (API 服务: /api/*)
                           │ (注入 CF-Access-Authenticated-User-Email 校验)
                           ▼
                        GitHub Contents API (提交 Commit 持久化 JSON/Markdown)
```

- **持久化层**：不使用 MySQL/PostgreSQL/WordPress，全部数据以 JSON / Markdown 形式存放在 GitHub 仓库中，由 Git 负责版本记录与回滚。
- **计算层**：Cloudflare Worker (`worker/`)，作为 GitHub API 的安全网关，屏蔽敏感 Token。
- **后台层**：React + TypeScript + Vite + TipTap 富文本编辑器 (`apps/admin/`)。
- **安全层**：Cloudflare Access (Zero Trust)，无需编写用户注册与密码管理逻辑，边缘节点直接进行邮箱白名单鉴权。

---

## 二、 部署前准备工作

在开始部署前，请准备好以下三项：

### 1. 生成 GitHub Personal Access Token (PAT)
Worker 需要权限读写本仓库的内容：
1. 打开 GitHub -> 点击右上角头像 -> **Settings** -> **Developer settings**。
2. 选择 **Personal access tokens** -> **Fine-grained tokens** -> 点击 **Generate new token**。
3. **Token name**：填写 `maishufang-cms-worker`。
4. **Expiration**：建议选择 90 天或按需设置。
5. **Repository access**：选择 **Only select repositories**，并选中 `iamcheyan/maishufang`。
6. **Permissions**：展开 **Repository permissions**，找到 **Contents**，选择 **Access: Read and write**（GitHub 会自动附加 Metadata 只读权限）。
7. 点击 **Generate token**，**立即复制生成的 `github_pat_xxxx` 保存备用**。

### 2. 准备 Cloudflare 账号并登录 CLI
确保本地已安装 Node.js (>=20) 并通过 Wrangler 登录 Cloudflare：
```bash
npx wrangler login
```
*在弹出的浏览器窗口中点击授权即可。*

### 3. 确定管理员邮箱
确定用于登录 CMS 的管理员邮箱（例如 `your-email@outlook.com`），该邮箱用于 Cloudflare Access 验证与 Worker 鉴权白名单。

---

## 三、 分步部署流程

### 第一步：安装依赖与环境检查

在项目根目录下，安装后台与 Worker 的依赖：

```bash
# 切换到 feature 分支（如果尚未切换）
git checkout feature/github-cms

# 安装各工作区依赖
npm install --prefix apps/admin
npm install --prefix worker

# 验证编译与 Worker 类型检查
npm run build
npm run typecheck:worker
```

---

### 第二步：部署 Cloudflare Worker (后端 API)

1. **核对配置文件**：打开 `worker/wrangler.toml`，确认配置：
   ```toml
   name = "maishufang-cms-api"
   main = "src/index.ts"
   compatibility_date = "2026-09-15"

   [vars]
   GITHUB_OWNER = "iamcheyan"
   GITHUB_REPO = "maishufang"
   GITHUB_BRANCH = "main" # 生产环境写入的目标分支，可按需指定

   [observability]
   enabled = true
   ```

2. **写入云端加密密钥 (Secrets)**：
   在 `worker` 目录下，将准备好的敏感信息写入 Cloudflare：
   ```bash
   cd worker

   # 1. 写入 GitHub Token (粘贴刚刚生成的 github_pat_xxx)
   npx wrangler secret put GITHUB_TOKEN

   # 2. 写入管理员授权邮箱
   npx wrangler secret put ADMIN_EMAIL
   ```

3. **发布 Worker**：
   ```bash
   npx wrangler deploy
   ```
   发布成功后，终端将输出类似如下的线上 API 地址：
   ```text
   Uploaded maishufang-cms-api (3.21 sec)
   Deployed maishufang-cms-api triggers
     https://maishufang-cms-api.<你的子域名>.workers.dev
   ```
   **请记录此 Worker 域名**，下一步构建前端时需要用到。

---

### 第三步：构建与部署 Admin 管理后台 (`apps/admin`)

后台支持两种部署方式：

#### 方案 A：作为独立的 Cloudflare Pages 项目部署（推荐，最省心）
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) -> **Compute (Workers & Pages)** -> **Create** -> **Pages**。
2. 选择 **Connect to Git**，选中 `iamcheyan/maishufang` 仓库。
3. 构建参数设置：
   - **Project name**：`maishufang-admin`
   - **Production branch**：`feature/github-cms`（或合并后的 `main`）
   - **Framework preset**：`Vite`
   - **Build command**：`npm --prefix apps/admin run build`
   - **Build output directory**：`apps/admin/dist`
   - **Environment variables**：
     - Variable name: `VITE_API_BASE_URL`
     - Value: `https://maishufang-cms-api.<你的子域名>.workers.dev`（即第二步获得的 Worker 地址）
4. 点击 **Save and Deploy**。完成之后即可通过专属 Pages 域名（如 `https://maishufang-admin.pages.dev`）访问后台。

#### 方案 B：本地预编译产物上传
```bash
# 本地注入 Worker 地址并打包
VITE_API_BASE_URL="https://maishufang-cms-api.<你的子域名>.workers.dev" npm --prefix apps/admin run build

# 使用 Wrangler 直接上传 dist 目录
npx wrangler pages deploy apps/admin/dist --project-name=maishufang-admin
```

---

### 第四步：部署公开静态站点 (主站)

主站继续沿用根目录的静态镜像文件（`index.html`, `products.html`, `static/`, `products/` 等）：
1. 在 Cloudflare Dashboard -> **Pages** -> **Create application** -> **Connect to Git**。
2. 关联 `iamcheyan/maishufang` 仓库。
3. 配置参数：
   - **Framework preset**：`None`
   - **Build command**：留空
   - **Build output directory**：留空（即根目录）
4. 点击 **Save and Deploy**，主站上线。

---

### 第五步：配置 Cloudflare Access (Zero Trust) 零信任拦截

这是保证安全的关键步骤，确保未授权访客无法进入后台或调用 Worker API。

1. 进入 [Cloudflare One / Zero Trust 控制台](https://one.dash.cloudflare.com/)。
2. 进入 **Access** -> **Applications** -> 点击 **Add an application**。
3. 选择 **Self-hosted**。
4. **配置 Application 基础信息**：
   - **Application name**：`Maishufang CMS Admin`
   - **Application domain**：填写你的后台域名（例如 `maishufang-admin.pages.dev` 或自定义域名）。
5. **添加 Policy 规则**：
   - **Policy name**：`Allow Admin Only`
   - **Action**：`Allow`
   - **Configure rules**：
     - Selector: `Emails`
     - Value: 填写你的管理员邮箱（例如 `your-email@outlook.com`，必须与 Worker 中的 `ADMIN_EMAIL` 一致）。
6. 点击 **Next** 直至保存。
7. （可选但推荐）同样为 Worker API 域名添加一个 Access Application，保护 `/api/*`。

---

## 四、 本地联调与开发指南

如果需要先在本地进行开发与功能验证：

### 1. 本地启动 Worker API
在 `worker/` 目录下创建临时变量文件 `.dev.vars`（已被 `.gitignore` 忽略，切勿提交）：
```ini
GITHUB_TOKEN=github_pat_xxxx
GITHUB_OWNER=iamcheyan
GITHUB_REPO=maishufang
GITHUB_BRANCH=feature/github-cms
ADMIN_EMAIL=your-email@outlook.com
```
启动 Worker 本地开发服务器：
```bash
npm --prefix worker run dev
# 默认监听 http://localhost:8787
```

### 2. 本地启动 Admin 后台
启动 Vite 前端开发服务器：
```bash
VITE_API_BASE_URL="http://localhost:8787" npm --prefix apps/admin run dev
# 默认监听 http://127.0.0.1:5173
```
打开浏览器访问即可测试图书、文章管理与图片上传。

---

## 五、 运维与常见问题排查 (FAQ)

### Q1: 后台操作时报错 `403 Forbidden`？
- **原因**：请求中的 `CF-Access-Authenticated-User-Email` 头与 Worker 中设定的 `ADMIN_EMAIL` 不一致，或者本地调试未传该请求头。
- **解决**：检查 Worker 密钥 `npx wrangler secret put ADMIN_EMAIL` 是否与登录 Cloudflare Access 的邮箱完全一致（大小写不敏感）。

### Q2: 保存内容时报错 `409 Conflict`？
- **原因**：触发了 GitHub Contents API 的乐观锁机制，说明当前提交的文件被外部改动，本地持有的 `sha` 已过期。
- **解决**：在后台刷新该条记录重新获取最新的 `sha` 后再提交修改。

### Q3: 图片上传后在前端无法显示？
- **原因**：图片通过 Worker 上传至 GitHub 仓库的 `public/uploads/YYYY/MM/` 路径下，若主站尚未触发重新构建部署，静态资源尚未分发到 CDN。
- **解决**：检查 GitHub 仓库确认图片已提交。等待 Cloudflare Pages 自动构建或检查图片访问路径映射。
