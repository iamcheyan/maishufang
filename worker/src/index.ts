export interface Env {
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  ADMIN_EMAIL: string;
}

type JsonRecord = Record<string, unknown>;
type GitHubEntry = { path: string; sha?: string; type?: string };
type GitHubFile = { content?: string; sha?: string; encoding?: string };
type StoredFile = { text: string; sha: string };

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, cf-access-authenticated-user-email',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-max-age': '86400',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireAdmin(request: Request, env: Env): void {
  const email = request.headers.get('CF-Access-Authenticated-User-Email');
  if (!email || !env.ADMIN_EMAIL || email.trim().toLowerCase() !== env.ADMIN_EMAIL.trim().toLowerCase()) {
    throw new HttpError(403, '管理员认证失败');
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeText(value: string): string {
  return encodeBase64(new TextEncoder().encode(value));
}

function decodeText(value: string): string {
  return new TextDecoder().decode(decodeBase64(value));
}

function apiBase(env: Env): string {
  return `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents`;
}

function safeSegment(value: string, label: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) throw new HttpError(400, `${label}格式无效`);
  return value;
}

function githubPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function github(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const [pathname, query = ''] = path.split('?', 2);
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${env.GITHUB_TOKEN}`);
  headers.set('accept', 'application/vnd.github+json');
  headers.set('user-agent', 'maishufang-cms');
  const suffix = query ? `?${query}` : '';
  return fetch(`${apiBase(env)}/${githubPath(pathname)}${suffix}`, { ...init, headers });
}

async function githubError(operation: string, response: Response): Promise<never> {
  throw new HttpError(response.status === 404 ? 404 : 502, `${operation}失败（GitHub ${response.status}）`);
}

async function listFiles(env: Env, path: string): Promise<GitHubEntry[]> {
  const response = await github(env, `${path}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);
  if (response.status === 404) return [];
  if (!response.ok) return githubError('读取 GitHub 目录', response);
  const value: unknown = await response.json();
  return Array.isArray(value) ? value.filter(isRecord).map((entry) => ({
    path: typeof entry.path === 'string' ? entry.path : '',
    sha: typeof entry.sha === 'string' ? entry.sha : undefined,
    type: typeof entry.type === 'string' ? entry.type : undefined,
  })) : [];
}

async function readFile(env: Env, path: string): Promise<StoredFile> {
  const response = await github(env, `${path}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);
  if (!response.ok) return githubError('读取 GitHub 文件', response);
  const file = await response.json() as GitHubFile;
  if (typeof file.content !== 'string' || typeof file.sha !== 'string') throw new HttpError(502, 'GitHub文件响应无效');
  return { text: decodeText(file.content), sha: file.sha };
}

async function writeFile(env: Env, path: string, bytes: Uint8Array, message: string, sha?: string): Promise<void> {
  const payload = {
    message,
    content: encodeBase64(bytes),
    branch: env.GITHUB_BRANCH,
    ...(sha ? { sha } : {}),
  };
  const response = await github(env, path, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return githubError('写入 GitHub 文件', response);
}

async function writeText(env: Env, path: string, text: string, message: string, sha?: string): Promise<void> {
  return writeFile(env, path, new TextEncoder().encode(text), message, sha);
}

async function deleteFile(env: Env, path: string, message: string, sha: string): Promise<void> {
  const response = await github(env, path, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: env.GITHUB_BRANCH }),
  });
  if (!response.ok) return githubError('删除 GitHub 文件', response);
}

async function requestJson(request: Request): Promise<JsonRecord> {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, '请求体必须是 JSON 对象');
  }
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function productList(env: Env): Promise<Response> {
  const files = await listFiles(env, 'content/products');
  const products = await Promise.all(files.filter((file) => file.type !== 'dir' && file.path.endsWith('.json')).map(async (file) => {
    const stored = await readFile(env, file.path);
    const value: unknown = JSON.parse(stored.text);
    if (!isRecord(value)) throw new HttpError(502, '产品内容格式无效');
    return { ...value, path: file.path, sha: stored.sha };
  }));
  return json(products);
}

async function productDetail(env: Env, id: string): Promise<Response> {
  const safeId = safeSegment(id, '产品 ID');
  const path = `content/products/${safeId}.json`;
  const stored = await readFile(env, path);
  const value: unknown = JSON.parse(stored.text);
  if (!isRecord(value)) throw new HttpError(502, '产品内容格式无效');
  return json({ ...value, path, sha: stored.sha });
}

async function saveProduct(request: Request, env: Env, id?: string): Promise<Response> {
  const body = await requestJson(request);
  const productId = safeSegment(id ?? (typeof body.id === 'string' ? body.id : crypto.randomUUID()), '产品 ID');
  const path = `content/products/${productId}.json`;
  let sha: string | undefined;
  if (request.method === 'PUT') sha = (await readFile(env, path)).sha;
  const title = body.title;
  if (typeof title !== 'string' || !title.trim()) throw new HttpError(400, '产品标题不能为空');
  const product: JsonRecord = { ...body, id: productId };
  await writeText(env, path, jsonText(product), `${request.method === 'POST' ? 'Create' : 'Update'} product ${productId}`, sha);
  return json({ ok: true, path, id: productId }, request.method === 'POST' ? 201 : 200);
}

async function deleteProduct(env: Env, id: string): Promise<Response> {
  const safeId = safeSegment(id, '产品 ID');
  const path = `content/products/${safeId}.json`;
  const stored = await readFile(env, path);
  await deleteFile(env, path, `Delete product ${safeId}`, stored.sha);
  return json({ ok: true, id: safeId });
}

async function pageList(env: Env): Promise<Response> {
  const files = await listFiles(env, 'content/pages');
  const pages = await Promise.all(files.filter((file) => file.path.endsWith('.json')).map(async (file) => {
    const stored = await readFile(env, file.path);
    const value: unknown = JSON.parse(stored.text);
    if (!isRecord(value)) throw new HttpError(502, '页面内容格式无效');
    return { ...value, path: file.path, sha: stored.sha };
  }));
  return json(pages);
}

async function pageDetail(env: Env, slug: string): Promise<Response> {
  const safeSlug = safeSegment(slug, '页面 slug');
  const path = `content/pages/${safeSlug}.json`;
  const stored = await readFile(env, path);
  const value: unknown = JSON.parse(stored.text);
  if (!isRecord(value)) throw new HttpError(502, '页面内容格式无效');
  return json({ ...value, path, sha: stored.sha });
}

async function savePage(request: Request, env: Env, slug: string): Promise<Response> {
  const safeSlug = safeSegment(slug, '页面 slug');
  const path = `content/pages/${safeSlug}.json`;
  const body = await requestJson(request);
  let sha: string | undefined;
  try {
    sha = (await readFile(env, path)).sha;
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
  }
  await writeText(env, path, jsonText({ ...body, slug: safeSlug }), `Update page ${safeSlug}`, sha);
  return json({ ok: true, path, slug: safeSlug });
}

type Article = JsonRecord & { slug: string; body: string };

function parseArticle(text: string, fallbackSlug: string): Article {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const metadata: JsonRecord = {};
  const body = match?.[2] ?? text;
  if (match) {
    for (const line of match[1].split('\n')) {
      const separator = line.indexOf(':');
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim();
      const raw = line.slice(separator + 1).trim();
      try {
        metadata[key] = JSON.parse(raw);
      } catch {
        metadata[key] = raw;
      }
    }
  }
  return { ...metadata, slug: typeof metadata.slug === 'string' ? metadata.slug : fallbackSlug, body };
}

function articleText(body: JsonRecord): string {
  const slug = typeof body.slug === 'string' ? safeSegment(body.slug, '文章 slug') : crypto.randomUUID();
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) throw new HttpError(400, '文章标题不能为空');
  const content = typeof body.body === 'string' ? body.body : typeof body.content === 'string' ? body.content : '';
  const metadata: Array<[string, string]> = [['title', title], ['slug', slug]];
  for (const key of ['status', 'author', 'published_at', 'cover']) {
    if (typeof body[key] === 'string' && body[key]) metadata.push([key, body[key] as string]);
  }
  return `---\n${metadata.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n${content.trim()}\n`;
}

async function articleList(env: Env): Promise<Response> {
  const files = await listFiles(env, 'content/articles');
  const articles = await Promise.all(files.filter((file) => file.path.endsWith('.md')).map(async (file) => {
    const stored = await readFile(env, file.path);
    return { ...parseArticle(stored.text, file.path.split('/').pop()?.replace(/\.md$/, '') ?? ''), path: file.path, sha: stored.sha };
  }));
  return json(articles);
}

async function articleDetail(env: Env, slug: string): Promise<Response> {
  const safeSlug = safeSegment(slug, '文章 slug');
  const path = `content/articles/${safeSlug}.md`;
  const stored = await readFile(env, path);
  return json({ ...parseArticle(stored.text, safeSlug), path, sha: stored.sha });
}

async function saveArticle(request: Request, env: Env, id?: string): Promise<Response> {
  const body = await requestJson(request);
  const slug = safeSegment(id ?? (typeof body.slug === 'string' ? body.slug : crypto.randomUUID()), '文章 slug');
  const path = `content/articles/${slug}.md`;
  let sha: string | undefined;
  if (request.method === 'PUT') sha = (await readFile(env, path)).sha;
  await writeText(env, path, articleText({ ...body, slug }), `${request.method === 'POST' ? 'Create' : 'Update'} article ${slug}`, sha);
  return json({ ok: true, path, slug }, request.method === 'POST' ? 201 : 200);
}

async function deleteArticle(env: Env, slug: string): Promise<Response> {
  const safeSlug = safeSegment(slug, '文章 slug');
  const path = `content/articles/${safeSlug}.md`;
  const stored = await readFile(env, path);
  await deleteFile(env, path, `Delete article ${safeSlug}`, stored.sha);
  return json({ ok: true, slug: safeSlug });
}

async function upload(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const value = form.get('file');
  if (!(value instanceof File)) throw new HttpError(400, '缺少图片文件');
  if (!value.type.startsWith('image/')) throw new HttpError(400, '只允许上传图片');
  if (value.size > 10 * 1024 * 1024) throw new HttpError(413, '图片不能超过 10MB');
  const original = value.name.split(/[\\/]/).pop() ?? 'upload';
  const filename = original.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '') || 'upload';
  const now = new Date();
  const path = `public/uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${filename}`;
  await writeFile(env, path, new Uint8Array(await value.arrayBuffer()), `Upload ${path}`);
  return json({ ok: true, path, url: `/${path}` }, 201);
}

type MessageRecord = {
  id: string;
  name: string;
  email: string;
  content: string;
  created_at: string;
  is_read?: boolean;
};

async function createMessage(request: Request, env: Env): Promise<Response> {
  const body = await requestJson(request);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const content = typeof body.content === 'string' ? body.content.trim() : typeof body.message === 'string' ? body.message.trim() : '';

  if (!name) throw new HttpError(400, '请输入您的姓名');
  if (!email || !email.includes('@')) throw new HttpError(400, '请输入有效邮箱地址');
  if (!content) throw new HttpError(400, '请输入留言内容');

  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 6)}`;
  const record: MessageRecord = {
    id,
    name,
    email,
    content,
    created_at: new Date().toISOString(),
    is_read: false,
  };

  const path = `content/messages/${id}.json`;
  await writeText(env, path, jsonText(record), `cms(message): new message from ${name}`);
  return json({ ok: true, message: '留言提交成功', id }, 201);
}

async function messageList(env: Env): Promise<Response> {
  const files = await listFiles(env, 'content/messages');
  const messages = await Promise.all(
    files.filter((f) => f.path.endsWith('.json')).map(async (f) => {
      try {
        const stored = await readFile(env, f.path);
        const data = JSON.parse(stored.text) as MessageRecord;
        return { ...data, sha: stored.sha };
      } catch {
        return null;
      }
    })
  );
  const valid = messages.filter((m): m is NonNullable<typeof m> => m !== null);
  valid.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return json(valid);
}

async function markMessageRead(request: Request, env: Env, id: string): Promise<Response> {
  const safeId = safeSegment(id, '留言 ID');
  const path = `content/messages/${safeId}.json`;
  const stored = await readFile(env, path);
  const data = JSON.parse(stored.text) as MessageRecord;
  const body = await requestJson(request);
  const is_read = typeof body.is_read === 'boolean' ? body.is_read : true;
  const updated: MessageRecord = { ...data, is_read };
  await writeText(env, path, jsonText(updated), `cms(message): mark read ${safeId}`, stored.sha);
  return json({ ok: true, id: safeId, is_read });
}

async function deleteMessage(env: Env, id: string): Promise<Response> {
  const safeId = safeSegment(id, '留言 ID');
  const path = `content/messages/${safeId}.json`;
  const stored = await readFile(env, path);
  await deleteFile(env, path, `cms(message): delete ${safeId}`, stored.sha);
  return json({ ok: true, id: safeId });
}

function routePath(request: Request): string[] {
  const pathname = new URL(request.url).pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  return pathname ? pathname.split('/') : [];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    try {
      const parts = routePath(request);
      const [resource, id] = parts;

      // 公开接口：访客提交留言（无需 Admin 认证）
      if (resource === 'messages' && parts.length === 1 && request.method === 'POST') {
        return createMessage(request, env);
      }

      // 其余管理后台接口必须通过管理员认证
      requireAdmin(request, env);
      if (request.method === 'GET' && resource === 'health' && parts.length === 1) {
        return json({ ok: true, repository: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`, branch: env.GITHUB_BRANCH });
      }
      if (resource === 'products' && parts.length === 1 && request.method === 'GET') return productList(env);
      if (resource === 'products' && parts.length === 2 && request.method === 'GET') return productDetail(env, id);
      if (resource === 'products' && parts.length === 1 && request.method === 'POST') return saveProduct(request, env);
      if (resource === 'products' && parts.length === 2 && request.method === 'PUT') return saveProduct(request, env, id);
      if (resource === 'products' && parts.length === 2 && request.method === 'DELETE') return deleteProduct(env, id);
      if (resource === 'pages' && parts.length === 1 && request.method === 'GET') return pageList(env);
      if (resource === 'pages' && parts.length === 2 && request.method === 'GET') return pageDetail(env, id);
      if (resource === 'pages' && parts.length === 2 && request.method === 'PUT') return savePage(request, env, id);
      if (resource === 'messages' && parts.length === 1 && request.method === 'GET') return messageList(env);
      if (resource === 'messages' && parts.length === 2 && request.method === 'PUT') return markMessageRead(request, env, id);
      if (resource === 'messages' && parts.length === 2 && request.method === 'DELETE') return deleteMessage(env, id);
      if (resource === 'articles' && parts.length === 1 && request.method === 'GET') return articleList(env);
      if (resource === 'articles' && parts.length === 2 && request.method === 'GET') return articleDetail(env, id);
      if (resource === 'articles' && parts.length === 1 && request.method === 'POST') return saveArticle(request, env);
      if (resource === 'articles' && parts.length === 2 && request.method === 'PUT') return saveArticle(request, env, id);
      if (resource === 'articles' && parts.length === 2 && request.method === 'DELETE') return deleteArticle(env, id);
      if (resource === 'upload' && parts.length === 1 && request.method === 'POST') return upload(request, env);
      throw new HttpError(404, '接口不存在');
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      return json({ error: '服务器内部错误' }, 500);
    }
  },
};
