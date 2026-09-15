import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import './styles.css';

type Product = {
  id: string;
  title: string;
  author?: string;
  publisher?: string;
  published_at?: string;
  isbn?: string;
  cover?: string;
  buy_url?: string;
  description?: string;
  body?: string;
  [key: string]: unknown;
};
type Page = { slug: string; title?: string; source?: { path?: string }; [key: string]: unknown };
type Article = { slug: string; title: string; body: string; status?: string; author?: string; published_at?: string; [key: string]: unknown };

const API = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
type Section = 'products' | 'articles' | 'pages';
type Notice = { kind: 'success' | 'error'; text: string };
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}/${path}`, init);
  const contentType = response.headers.get('content-type') || '';
  let data: unknown = null;
  if (contentType.includes('json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }
  if (!contentType.includes('json')) throw new Error('API 未返回 JSON，请检查 Worker 地址和 Cloudflare Access 配置');
  if (!response.ok) {
    const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
      ? data.error
      : `请求失败（${response.status}）`;
    throw new Error(message);
  }
  return data as T;
}

const jsonRequest = (method: string, value: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});

const editorExtensions = [
  StarterKit,
  Link.configure({ openOnClick: false }),
  Image.configure({ allowBase64: false }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  Placeholder.configure({ placeholder: '输入正文内容…' }),
];

function RichEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editor = useEditor({
    extensions: editorExtensions,
    content: value,
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) editor.commands.setContent(value || '', { emitUpdate: false });
  }, [editor, value]);

  const run = (action: () => boolean | undefined) => {
    action();
  };
  const setLink = () => {
    if (!editor) return;
    const url = window.prompt('链接地址', editor.getAttributes('link').href || 'https://');
    if (url === null) return;
    if (url.trim() === '') editor.chain().focus().unsetLink().run();
    else editor.chain().focus().setLink({ href: url.trim() }).run();
  };
  const addImage = () => {
    if (!editor) return;
    const url = window.prompt('图片 URL（请先通过上传接口上传图片）', 'https://');
    if (url?.trim()) editor.chain().focus().setImage({ src: url.trim() }).run();
  };

  return (
    <div className="editor">
      <div className="toolbar" aria-label="正文格式">
        <button type="button" onClick={() => run(() => editor?.chain().focus().setParagraph().run())}>段落</button>
        <button type="button" onClick={() => run(() => editor?.chain().focus().toggleHeading({ level: 2 }).run())}>标题</button>
        <button type="button" onClick={() => run(() => editor?.chain().focus().toggleBold().run())}>粗体</button>
        <button type="button" onClick={() => run(() => editor?.chain().focus().toggleItalic().run())}>斜体</button>
        <button type="button" onClick={() => run(() => editor?.chain().focus().toggleBlockquote().run())}>引用</button>
        <button type="button" onClick={() => run(() => editor?.chain().focus().toggleCodeBlock().run())}>代码块</button>
        <button type="button" onClick={setLink}>链接</button>
        <button type="button" onClick={addImage}>图片</button>
        <button type="button" onClick={() => run(() => editor?.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run())}>表格</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} /> : <input value={value} onChange={(event) => onChange(event.target.value)} />}
    </label>
  );
}

function ProductModal({ product, isNew, busy, onChange, onSave, onDelete, onClose }: {
  product: Product;
  isNew: boolean;
  busy: boolean;
  onChange: (product: Product) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const update = (key: keyof Product, value: string) => onChange({ ...product, [key]: value });
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="product-dialog-title">
        <div className="modal-head">
          <div><span className="eyebrow">PRODUCT / {product.id}</span><h2 id="product-dialog-title">{isNew ? '新增图书' : '编辑图书'}</h2></div>
          <button type="button" className="quiet-button" onClick={onClose}>关闭</button>
        </div>
        <div className="form">
          <Field label="书名" value={product.title} onChange={(value) => update('title', value)} />
          <div className="form-grid">
            <Field label="作者" value={product.author || ''} onChange={(value) => update('author', value)} />
            <Field label="出版社" value={product.publisher || ''} onChange={(value) => update('publisher', value)} />
            <Field label="出版时间" value={product.published_at || ''} onChange={(value) => update('published_at', value)} />
            <Field label="ISBN" value={product.isbn || ''} onChange={(value) => update('isbn', value)} />
          </div>
          <Field label="封面 URL" value={product.cover || ''} onChange={(value) => update('cover', value)} />
          <Field label="购买链接" value={product.buy_url || ''} onChange={(value) => update('buy_url', value)} />
          <Field label="简介" value={product.description || ''} onChange={(value) => update('description', value)} multiline />
          <label className="field"><span>编辑备注（TipTap）</span><RichEditor value={product.body || ''} onChange={(value) => update('body', value)} /></label>
        </div>
        <div className="modal-actions">
          {!isNew && <button type="button" className="danger" disabled={busy} onClick={onDelete}>删除</button>}
          <span />
          <button type="button" className="quiet-button" disabled={busy} onClick={onClose}>取消</button>
          <button type="button" className="primary" disabled={busy} onClick={onSave}>{busy ? '保存中…' : '保存并发布'}</button>
        </div>
      </div>
    </div>
  );
}

function ArticleModal({ article, isNew, busy, onChange, onSave, onDelete, onClose }: {
  article: Article;
  isNew: boolean;
  busy: boolean;
  onChange: (article: Article) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const update = (key: keyof Article, value: string) => onChange({ ...article, [key]: value });
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="article-dialog-title">
        <div className="modal-head">
          <div><span className="eyebrow">ARTICLE / {article.slug}</span><h2 id="article-dialog-title">{isNew ? '新增文章' : '编辑文章'}</h2></div>
          <button type="button" className="quiet-button" onClick={onClose}>关闭</button>
        </div>
        <div className="form">
          <Field label="标题" value={article.title} onChange={(value) => update('title', value)} />
          <div className="form-grid">
            <Field label="Slug" value={article.slug} onChange={(value) => update('slug', value)} />
            <Field label="状态（draft / published）" value={article.status || 'draft'} onChange={(value) => update('status', value)} />
            <Field label="作者" value={article.author || ''} onChange={(value) => update('author', value)} />
            <Field label="发布日期" value={article.published_at || ''} onChange={(value) => update('published_at', value)} />
          </div>
          <label className="field"><span>正文（TipTap）</span><RichEditor value={article.body} onChange={(value) => update('body', value)} /></label>
        </div>
        <div className="modal-actions">
          {!isNew && <button type="button" className="danger" disabled={busy} onClick={onDelete}>删除</button>}
          <span />
          <button type="button" className="quiet-button" disabled={busy} onClick={onClose}>取消</button>
          <button type="button" className="primary" disabled={busy} onClick={onSave}>{busy ? '保存中…' : '保存文章'}</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [section, setSection] = useState<Section>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [isNewArticle, setIsNewArticle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const loadProducts = async () => {
    setLoading(true);
    try {
      setProducts(await request<Product[]>('products'));
      setNotice(null);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '图书加载失败' });
    } finally {
      setLoading(false);
    }
  };
  const loadArticles = async () => {
    setLoading(true);
    try {
      setArticles(await request<Article[]>('articles'));
      setNotice(null);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '文章加载失败' });
    } finally {
      setLoading(false);
    }
  };
  const loadPages = async () => {
    setLoading(true);
    try {
      setPages(await request<Page[]>('pages'));
      setNotice(null);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '页面加载失败' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadProducts(); }, []);

  const changeSection = (next: Section) => {
    setSection(next);
    if (next === 'products' && products.length === 0) void loadProducts();
    if (next === 'articles' && articles.length === 0) void loadArticles();
    if (next === 'pages' && pages.length === 0) void loadPages();
  };
  const createProduct = () => {
    setIsNewProduct(true);
    setProduct({ id: crypto.randomUUID(), title: '', author: '', publisher: '', published_at: '', isbn: '', cover: '', buy_url: '', description: '', body: '' });
  };
  const saveProduct = async () => {
    if (!product || !product.title.trim()) {
      setNotice({ kind: 'error', text: '书名不能为空' });
      return;
    }
    setBusy(true);
    try {
      await request(isNewProduct ? 'products' : `products/${encodeURIComponent(product.id)}`, jsonRequest(isNewProduct ? 'POST' : 'PUT', product));
      setNotice({ kind: 'success', text: isNewProduct ? '图书已创建并提交 GitHub commit' : '图书已更新并提交 GitHub commit' });
      setProduct(null);
      await loadProducts();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '保存失败' });
    } finally {
      setBusy(false);
    }
  };
  const deleteProduct = async () => {
    if (!product || !window.confirm(`确定删除「${product.title}」吗？`)) return;
    setBusy(true);
    try {
      await request(`products/${encodeURIComponent(product.id)}`, { method: 'DELETE' });
      setProduct(null);
      setNotice({ kind: 'success', text: '图书已删除并提交 GitHub commit' });
      await loadProducts();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '删除失败' });
    } finally {
      setBusy(false);
    }
  };
  const createArticle = () => {
    setIsNewArticle(true);
    setArticle({ slug: `new-article-${Date.now()}`, title: '', status: 'draft', author: '', published_at: '', body: '' });
  };
  const saveArticle = async () => {
    if (!article || !article.title.trim()) {
      setNotice({ kind: 'error', text: '文章标题不能为空' });
      return;
    }
    setBusy(true);
    try {
      await request(isNewArticle ? 'articles' : `articles/${encodeURIComponent(article.slug)}`, jsonRequest(isNewArticle ? 'POST' : 'PUT', article));
      setArticle(null);
      setNotice({ kind: 'success', text: '文章已保存并提交 GitHub commit' });
      await loadArticles();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '文章保存失败' });
    } finally {
      setBusy(false);
    }
  };
  const deleteArticle = async () => {
    if (!article || !window.confirm(`确定删除「${article.title}」吗？`)) return;
    setBusy(true);
    try {
      await request(`articles/${encodeURIComponent(article.slug)}`, { method: 'DELETE' });
      setArticle(null);
      setNotice({ kind: 'success', text: '文章已删除并提交 GitHub commit' });
      await loadArticles();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '文章删除失败' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div><span className="eyebrow">MAISHUFANG / CONTENT STORE</span><h1>内容管理</h1></div>
        <div className="access"><span className="status-dot" />Cloudflare Access</div>
      </header>
      <main className="layout">
        <aside className="sidebar">
          <div className="side-title">内容</div>
          <button type="button" className={section === 'products' ? 'active' : ''} onClick={() => changeSection('products')}>图书 <b>{products.length}</b></button>
          <button type="button" className={section === 'articles' ? 'active' : ''} onClick={() => changeSection('articles')}>文章 <b>{articles.length || '—'}</b></button>
          <button type="button" className={section === 'pages' ? 'active' : ''} onClick={() => changeSection('pages')}>页面 <b>{pages.length || '—'}</b></button>
          <div className="side-title second">快捷操作</div>
          <button type="button" onClick={section === 'articles' ? createArticle : createProduct}>＋ 新增{section === 'articles' ? '文章' : '图书'}</button>
        </aside>
        <section className="content">
          {notice && <div className={notice.kind === 'success' ? 'notice' : 'error'} role="status">{notice.text}</div>}
          {section === 'products' && (
            <>
              <div className="section-head"><div><span className="eyebrow">CATALOG / {products.length} ITEMS</span><h2>图书目录</h2></div><button type="button" className="primary" onClick={createProduct}>新增图书</button></div>
              {loading ? <div className="empty">正在读取 GitHub 内容…</div> : products.length === 0 ? <div className="empty">还没有图书。新增第一本书。</div> : <div className="list">{products.map((item) => <button type="button" className="row" key={item.id} onClick={() => { setIsNewProduct(false); setProduct({ ...item }); }}><span className="cover">{item.cover ? <img src={item.cover} alt="" /> : '书'}</span><span><strong>{item.title}</strong><small>{item.author || '未填写作者'} · {item.published_at || '未填写年份'}</small></span><span className="chevron">›</span></button>)}</div>}
            </>
          )}
          {section === 'articles' && (
            <>
              <div className="section-head"><div><span className="eyebrow">ARTICLES / MARKDOWN</span><h2>文章</h2></div><button type="button" className="primary" onClick={createArticle}>新增文章</button></div>
              {loading ? <div className="empty">正在读取 GitHub 内容…</div> : articles.length === 0 ? <div className="empty">暂无文章。文章会以 Markdown 保存到 GitHub。</div> : <div className="list">{articles.map((item) => <button type="button" className="row article-row" key={item.slug} onClick={() => { setIsNewArticle(false); setArticle({ ...item }); }}><span className="article-mark">MD</span><span><strong>{item.title}</strong><small>{item.slug} · {item.status || 'draft'}</small></span><span className="chevron">›</span></button>)}</div>}
            </>
          )}
          {section === 'pages' && (
            <div className="coming-soon">
              <span className="eyebrow">PAGES / READ-ONLY ENTRY</span>
              <h2>页面内容</h2>
              <p>页面编辑尚未接入。下面的入口仅用于确认 GitHub 内容源已可读取；不会伪装成可发布的页面编辑器。</p>
              {loading ? <div className="empty">正在读取 GitHub 内容…</div> : <div className="page-list">{pages.map((item) => <div className="page-item" key={item.slug}><strong>{item.title || item.slug}</strong><small>{item.source?.path || `content/pages/${item.slug}.json`}</small></div>)}</div>}
            </div>
          )}
        </section>
      </main>
      {product && <ProductModal product={product} isNew={isNewProduct} busy={busy} onChange={setProduct} onSave={() => void saveProduct()} onDelete={() => void deleteProduct()} onClose={() => setProduct(null)} />}
      {article && <ArticleModal article={article} isNew={isNewArticle} busy={busy} onChange={setArticle} onSave={() => void saveArticle()} onDelete={() => void deleteArticle()} onClose={() => setArticle(null)} />}
    </div>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('缺少应用根节点');
createRoot(root).render(<App />);
