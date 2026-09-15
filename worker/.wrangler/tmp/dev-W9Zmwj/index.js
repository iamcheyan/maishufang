var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var HttpError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
  status;
  static {
    __name(this, "HttpError");
  }
};
var corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, cf-access-authenticated-user-email",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-max-age": "86400"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" }
  });
}
__name(json, "json");
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
__name(isRecord, "isRecord");
function requireAdmin(request, env) {
  const email = request.headers.get("CF-Access-Authenticated-User-Email");
  if (!email || !env.ADMIN_EMAIL || email.trim().toLowerCase() !== env.ADMIN_EMAIL.trim().toLowerCase()) {
    throw new HttpError(403, "\u7BA1\u7406\u5458\u8BA4\u8BC1\u5931\u8D25");
  }
}
__name(requireAdmin, "requireAdmin");
function encodeBase64(bytes) {
  let binary = "";
  const chunkSize = 32768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
__name(encodeBase64, "encodeBase64");
function decodeBase64(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
__name(decodeBase64, "decodeBase64");
function decodeText(value) {
  return new TextDecoder().decode(decodeBase64(value));
}
__name(decodeText, "decodeText");
function apiBase(env) {
  return `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents`;
}
__name(apiBase, "apiBase");
function safeSegment(value, label) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) throw new HttpError(400, `${label}\u683C\u5F0F\u65E0\u6548`);
  return value;
}
__name(safeSegment, "safeSegment");
function githubPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}
__name(githubPath, "githubPath");
async function github(env, path, init = {}) {
  const [pathname, query = ""] = path.split("?", 2);
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${env.GITHUB_TOKEN}`);
  headers.set("accept", "application/vnd.github+json");
  headers.set("user-agent", "maishufang-cms");
  const suffix = query ? `?${query}` : "";
  return fetch(`${apiBase(env)}/${githubPath(pathname)}${suffix}`, { ...init, headers });
}
__name(github, "github");
async function githubError(operation, response) {
  throw new HttpError(response.status === 404 ? 404 : 502, `${operation}\u5931\u8D25\uFF08GitHub ${response.status}\uFF09`);
}
__name(githubError, "githubError");
async function listFiles(env, path) {
  const response = await github(env, `${path}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);
  if (response.status === 404) return [];
  if (!response.ok) return githubError("\u8BFB\u53D6 GitHub \u76EE\u5F55", response);
  const value = await response.json();
  return Array.isArray(value) ? value.filter(isRecord).map((entry) => ({
    path: typeof entry.path === "string" ? entry.path : "",
    sha: typeof entry.sha === "string" ? entry.sha : void 0,
    type: typeof entry.type === "string" ? entry.type : void 0
  })) : [];
}
__name(listFiles, "listFiles");
async function readFile(env, path) {
  const response = await github(env, `${path}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`);
  if (!response.ok) return githubError("\u8BFB\u53D6 GitHub \u6587\u4EF6", response);
  const file = await response.json();
  if (typeof file.content !== "string" || typeof file.sha !== "string") throw new HttpError(502, "GitHub\u6587\u4EF6\u54CD\u5E94\u65E0\u6548");
  return { text: decodeText(file.content), sha: file.sha };
}
__name(readFile, "readFile");
async function writeFile(env, path, bytes, message, sha) {
  const payload = {
    message,
    content: encodeBase64(bytes),
    branch: env.GITHUB_BRANCH,
    ...sha ? { sha } : {}
  };
  const response = await github(env, path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) return githubError("\u5199\u5165 GitHub \u6587\u4EF6", response);
}
__name(writeFile, "writeFile");
async function writeText(env, path, text, message, sha) {
  return writeFile(env, path, new TextEncoder().encode(text), message, sha);
}
__name(writeText, "writeText");
async function deleteFile(env, path, message, sha) {
  const response = await github(env, path, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, sha, branch: env.GITHUB_BRANCH })
  });
  if (!response.ok) return githubError("\u5220\u9664 GitHub \u6587\u4EF6", response);
}
__name(deleteFile, "deleteFile");
async function requestJson(request) {
  try {
    const body = await request.json();
    if (!isRecord(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  }
}
__name(requestJson, "requestJson");
function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}
__name(jsonText, "jsonText");
async function productList(env) {
  const files = await listFiles(env, "content/products");
  const products = await Promise.all(files.filter((file) => file.type !== "dir" && file.path.endsWith(".json")).map(async (file) => {
    const stored = await readFile(env, file.path);
    const value = JSON.parse(stored.text);
    if (!isRecord(value)) throw new HttpError(502, "\u4EA7\u54C1\u5185\u5BB9\u683C\u5F0F\u65E0\u6548");
    return { ...value, path: file.path, sha: stored.sha };
  }));
  return json(products);
}
__name(productList, "productList");
async function productDetail(env, id) {
  const safeId = safeSegment(id, "\u4EA7\u54C1 ID");
  const path = `content/products/${safeId}.json`;
  const stored = await readFile(env, path);
  const value = JSON.parse(stored.text);
  if (!isRecord(value)) throw new HttpError(502, "\u4EA7\u54C1\u5185\u5BB9\u683C\u5F0F\u65E0\u6548");
  return json({ ...value, path, sha: stored.sha });
}
__name(productDetail, "productDetail");
async function saveProduct(request, env, id) {
  const body = await requestJson(request);
  const productId = safeSegment(id ?? (typeof body.id === "string" ? body.id : crypto.randomUUID()), "\u4EA7\u54C1 ID");
  const path = `content/products/${productId}.json`;
  let sha;
  if (request.method === "PUT") sha = (await readFile(env, path)).sha;
  const title = body.title;
  if (typeof title !== "string" || !title.trim()) throw new HttpError(400, "\u4EA7\u54C1\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A");
  const product = { ...body, id: productId };
  await writeText(env, path, jsonText(product), `${request.method === "POST" ? "Create" : "Update"} product ${productId}`, sha);
  return json({ ok: true, path, id: productId }, request.method === "POST" ? 201 : 200);
}
__name(saveProduct, "saveProduct");
async function deleteProduct(env, id) {
  const safeId = safeSegment(id, "\u4EA7\u54C1 ID");
  const path = `content/products/${safeId}.json`;
  const stored = await readFile(env, path);
  await deleteFile(env, path, `Delete product ${safeId}`, stored.sha);
  return json({ ok: true, id: safeId });
}
__name(deleteProduct, "deleteProduct");
async function pageList(env) {
  const files = await listFiles(env, "content/pages");
  const pages = await Promise.all(files.filter((file) => file.path.endsWith(".json")).map(async (file) => {
    const stored = await readFile(env, file.path);
    const value = JSON.parse(stored.text);
    if (!isRecord(value)) throw new HttpError(502, "\u9875\u9762\u5185\u5BB9\u683C\u5F0F\u65E0\u6548");
    return { ...value, path: file.path, sha: stored.sha };
  }));
  return json(pages);
}
__name(pageList, "pageList");
async function pageDetail(env, slug) {
  const safeSlug = safeSegment(slug, "\u9875\u9762 slug");
  const path = `content/pages/${safeSlug}.json`;
  const stored = await readFile(env, path);
  const value = JSON.parse(stored.text);
  if (!isRecord(value)) throw new HttpError(502, "\u9875\u9762\u5185\u5BB9\u683C\u5F0F\u65E0\u6548");
  return json({ ...value, path, sha: stored.sha });
}
__name(pageDetail, "pageDetail");
async function savePage(request, env, slug) {
  const safeSlug = safeSegment(slug, "\u9875\u9762 slug");
  const path = `content/pages/${safeSlug}.json`;
  const body = await requestJson(request);
  let sha;
  try {
    sha = (await readFile(env, path)).sha;
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error;
  }
  await writeText(env, path, jsonText({ ...body, slug: safeSlug }), `Update page ${safeSlug}`, sha);
  return json({ ok: true, path, slug: safeSlug });
}
__name(savePage, "savePage");
function parseArticle(text, fallbackSlug) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const metadata = {};
  const body = match?.[2] ?? text;
  if (match) {
    for (const line of match[1].split("\n")) {
      const separator = line.indexOf(":");
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
  return { ...metadata, slug: typeof metadata.slug === "string" ? metadata.slug : fallbackSlug, body };
}
__name(parseArticle, "parseArticle");
function articleText(body) {
  const slug = typeof body.slug === "string" ? safeSegment(body.slug, "\u6587\u7AE0 slug") : crypto.randomUUID();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) throw new HttpError(400, "\u6587\u7AE0\u6807\u9898\u4E0D\u80FD\u4E3A\u7A7A");
  const content = typeof body.body === "string" ? body.body : typeof body.content === "string" ? body.content : "";
  const metadata = [["title", title], ["slug", slug]];
  for (const key of ["status", "author", "published_at", "cover"]) {
    if (typeof body[key] === "string" && body[key]) metadata.push([key, body[key]]);
  }
  return `---
${metadata.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}
---

${content.trim()}
`;
}
__name(articleText, "articleText");
async function articleList(env) {
  const files = await listFiles(env, "content/articles");
  const articles = await Promise.all(files.filter((file) => file.path.endsWith(".md")).map(async (file) => {
    const stored = await readFile(env, file.path);
    return { ...parseArticle(stored.text, file.path.split("/").pop()?.replace(/\.md$/, "") ?? ""), path: file.path, sha: stored.sha };
  }));
  return json(articles);
}
__name(articleList, "articleList");
async function articleDetail(env, slug) {
  const safeSlug = safeSegment(slug, "\u6587\u7AE0 slug");
  const path = `content/articles/${safeSlug}.md`;
  const stored = await readFile(env, path);
  return json({ ...parseArticle(stored.text, safeSlug), path, sha: stored.sha });
}
__name(articleDetail, "articleDetail");
async function saveArticle(request, env, id) {
  const body = await requestJson(request);
  const slug = safeSegment(id ?? (typeof body.slug === "string" ? body.slug : crypto.randomUUID()), "\u6587\u7AE0 slug");
  const path = `content/articles/${slug}.md`;
  let sha;
  if (request.method === "PUT") sha = (await readFile(env, path)).sha;
  await writeText(env, path, articleText({ ...body, slug }), `${request.method === "POST" ? "Create" : "Update"} article ${slug}`, sha);
  return json({ ok: true, path, slug }, request.method === "POST" ? 201 : 200);
}
__name(saveArticle, "saveArticle");
async function deleteArticle(env, slug) {
  const safeSlug = safeSegment(slug, "\u6587\u7AE0 slug");
  const path = `content/articles/${safeSlug}.md`;
  const stored = await readFile(env, path);
  await deleteFile(env, path, `Delete article ${safeSlug}`, stored.sha);
  return json({ ok: true, slug: safeSlug });
}
__name(deleteArticle, "deleteArticle");
async function upload(request, env) {
  const form = await request.formData();
  const value = form.get("file");
  if (!(value instanceof File)) throw new HttpError(400, "\u7F3A\u5C11\u56FE\u7247\u6587\u4EF6");
  if (!value.type.startsWith("image/")) throw new HttpError(400, "\u53EA\u5141\u8BB8\u4E0A\u4F20\u56FE\u7247");
  if (value.size > 10 * 1024 * 1024) throw new HttpError(413, "\u56FE\u7247\u4E0D\u80FD\u8D85\u8FC7 10MB");
  const original = value.name.split(/[\\/]/).pop() ?? "upload";
  const filename = original.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "") || "upload";
  const now = /* @__PURE__ */ new Date();
  const path = `public/uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${filename}`;
  await writeFile(env, path, new Uint8Array(await value.arrayBuffer()), `Upload ${path}`);
  return json({ ok: true, path, url: `/${path}` }, 201);
}
__name(upload, "upload");
function routePath(request) {
  const pathname = new URL(request.url).pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");
  return pathname ? pathname.split("/") : [];
}
__name(routePath, "routePath");
var src_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    try {
      requireAdmin(request, env);
      const parts = routePath(request);
      const [resource, id] = parts;
      if (request.method === "GET" && resource === "health" && parts.length === 1) {
        return json({ ok: true, repository: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`, branch: env.GITHUB_BRANCH });
      }
      if (resource === "products" && parts.length === 1 && request.method === "GET") return productList(env);
      if (resource === "products" && parts.length === 2 && request.method === "GET") return productDetail(env, id);
      if (resource === "products" && parts.length === 1 && request.method === "POST") return saveProduct(request, env);
      if (resource === "products" && parts.length === 2 && request.method === "PUT") return saveProduct(request, env, id);
      if (resource === "products" && parts.length === 2 && request.method === "DELETE") return deleteProduct(env, id);
      if (resource === "pages" && parts.length === 1 && request.method === "GET") return pageList(env);
      if (resource === "pages" && parts.length === 2 && request.method === "GET") return pageDetail(env, id);
      if (resource === "pages" && parts.length === 2 && request.method === "PUT") return savePage(request, env, id);
      if (resource === "articles" && parts.length === 1 && request.method === "GET") return articleList(env);
      if (resource === "articles" && parts.length === 2 && request.method === "GET") return articleDetail(env, id);
      if (resource === "articles" && parts.length === 1 && request.method === "POST") return saveArticle(request, env);
      if (resource === "articles" && parts.length === 2 && request.method === "PUT") return saveArticle(request, env, id);
      if (resource === "articles" && parts.length === 2 && request.method === "DELETE") return deleteArticle(env, id);
      if (resource === "upload" && parts.length === 1 && request.method === "POST") return upload(request, env);
      throw new HttpError(404, "\u63A5\u53E3\u4E0D\u5B58\u5728");
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      return json({ error: "\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF" }, 500);
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-JeciVF/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-JeciVF/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
