# 麦书房 (Maishufang) CMS 部署与线上测试域名文档

麦书房项目已成功部署上线到 **Cloudflare 全家桶（Pages + Worker）+ GitHub Contents API** 现代无服务器架构。

---

## 一、 线上实时测试域名

无需绑定独立域名或等待备案，Cloudflare 官方免费二级测试域名已分配并全量生效：

| 服务 | 线上测试访问地址 | 架构说明 |
| :--- | :--- | :--- |
| **麦书房公开官网** | **[https://maishufang.pages.dev](https://maishufang.pages.dev)** | 根目录静态站点（首页、图书列表、27 个详情页、关于麦书房），自带前台留言提交功能 |
| **CMS 管理后台** | **[https://maishufang-admin.pages.dev](https://maishufang-admin.pages.dev)** | React + TipTap 管理控制台，管理图书、品牌联系信息与访客留言 |
| **后端 Worker API** | **[https://maishufang-cms-api.kkab.workers.dev](https://maishufang-cms-api.kkab.workers.dev)** | 无数据库 API 网关，直接操作 GitHub Contents API 提交 Commit |

---

## 二、 架构与业务功能全景

```text
[普通访客] ---> https://maishufang.pages.dev (公开官网)
                   │
                   └──> [联系我们表单] 提交留言 
                           │ (免密公开接口: POST /api/messages)
                           ▼
[管 理 员] ---> https://maishufang-admin.pages.dev (后台管理)
                   │
                   └──> [管理请求] (携带管理员邮箱头鉴权)
                           │
                           ▼
                  https://maishufang-cms-api.kkab.workers.dev (Cloudflare Worker)
                           │
                           ▼
                  GitHub Repository (iamcheyan/maishufang)
                           ├── content/products/*.json  (图书数据)
                           ├── content/pages/about.json (品牌与联系)
                           ├── content/messages/*.json  (留言记录)
                           └── public/uploads/          (图片附件)
```

### 三大核心业务模块
1. **图书管理 (`products`)**：
   - 展现全量 27 本图书。
   - 支持新增、编辑、删除图书。
   - 封面图片展示、支持直接上传本地图片并自动提交至 GitHub 仓库。
2. **品牌与联系 (`brand`)**：
   - 管理关于页面的核心信息：成立时间、注册地、业务方向、主要荣誉、北京办公室、合肥办公室。
   - 品牌详细文案及奖项列表自由编辑。
   - 保存时直接提交一次 Git Commit 自动更新 `content/pages/about.json`。
3. **留言板 (`messages`)**：
   - 前台页面访客提交的留言实时展示在留言板中。
   - 显示留言者姓名、邮箱、提交时间与留言详情。
   - 支持已读/未读切换标记，侧边栏带有未读留言红点提醒。
   - 支持一键调起邮件客户端回复访客，支持删除垃圾留言。

---

## 三、 日常迭代与一键部署命令

项目已接入 Wrangler CLI，本地修改代码后可随时一键部署至 Cloudflare 线上：

### 1. 部署 Worker API
```bash
# 进入 worker 目录发布
cd worker
npx wrangler deploy
```

### 2. 部署 CMS 管理后台
```bash
# 注入线上 API 地址打包并发布到 Cloudflare Pages
VITE_API_BASE_URL="https://maishufang-cms-api.kkab.workers.dev" npm --prefix apps/admin run build
cp -r static apps/admin/dist/
cp -r public apps/admin/dist/
npx wrangler pages deploy apps/admin/dist --project-name=maishufang-admin --branch=main
```

### 3. 部署公开官网主站
```bash
# 打包干净的静态资源并发布到 Cloudflare Pages
rm -rf dist-site && mkdir -p dist-site
cp -r index.html products.html about.html products static public dist-site/
npx wrangler pages deploy dist-site --project-name=maishufang --branch=main
rm -rf dist-site
```

---

## 四、 本地开发与联调

如果需要在本地运行全套环境：
```bash
# 启动 Worker 本地服务 (端口 8787)
npm --prefix worker run dev

# 启动 Admin 管理后台 (端口 5173)
npm --prefix apps/admin run dev

# 启动公开官网预览 (端口 8000)
python3 -m http.server 8000
```

---

## 五、 后续绑定自定义独立域名（可选）

目前三个测试域名已全功能可用。后续若需将正式域名解析到该系统：
1. **官网主站**：在 Cloudflare Dashboard -> **Pages** -> **maishufang** -> **Custom domains** -> 绑定 `maishufang.cn` 或 `www.maishufang.cn`。
2. **管理后台**：在 Cloudflare Dashboard -> **Pages** -> **maishufang-admin** -> **Custom domains** -> 绑定 `admin.maishufang.cn`。
3. **配置 Zero Trust (Access)**：
   - 在 Cloudflare Zero Trust 控制台创建 Application，域名填写 `admin.maishufang.cn`。
   - 规则设为只允许管理员邮箱（`tetsuya.ueno@outlook.com`）接收动态验证码（OTP）登录。
