# CMS Architecture

## Phase 1 implemented

- The original static mirror remains the public-site baseline.
- `content/` is the versioned GitHub Content Store.
- `apps/admin` is a React + TypeScript + Vite admin console.
- `worker` is a TypeScript Cloudflare Worker API that reads and writes GitHub Contents API.
- Cloudflare Access is expected to protect `/admin` and `/api/*`; the Worker additionally checks the Access email header.

```text
Cloudflare Access -> React Admin -> Cloudflare Worker -> GitHub Contents API
                                      |
                                      +-> GitHub commit -> Cloudflare Pages rebuild
```

## Content model

- `content/pages/home.json` and `content/pages/about.json`: page metadata and sections.
- `content/products/*.json`: product records.
- `content/articles/*.md`: Markdown articles with YAML-like front matter.
- `public/uploads/YYYY/MM/*`: uploaded media, committed to the repository.

## Local development

```bash
npm install --prefix apps/admin
npm install --prefix worker
npm run migrate:content
npm run build
npm run typecheck:worker
```

The admin console uses `VITE_API_BASE_URL` when set and otherwise `/api`. The Worker requires `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`, and `ADMIN_EMAIL` secrets/vars. Do not put any token in the repository.

## Cloudflare deployment

1. Deploy the static site and `apps/admin/dist` through Pages (or route `/admin` to the admin build).
2. Deploy `worker` with `wrangler deploy`.
3. Set Worker secrets: `GITHUB_TOKEN` (fine-grained token limited to this repo, Contents read/write), and vars `GITHUB_OWNER=iamcheyan`, `GITHUB_REPO=maishufang`, `GITHUB_BRANCH=main`, `ADMIN_EMAIL=<your-email>`.
4. Configure Cloudflare Access to protect `/admin/*` and `/api/*`, allowing only the administrator email.
5. Set `VITE_API_BASE_URL` to the Worker/API route before building the admin app.

Cloudflare Access performs the email login and policy enforcement. The Worker does not implement registration or a user database.
