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

type Message = {
  id: string;
  name: string;
  email: string;
  content: string;
  created_at: string;
  is_read?: boolean;
  sha?: string;
};

type BrandInfo = {
  slug: string;
  title: string;
  subtitle: string;
  brand_details: {
    成立时间: string;
    注册地: string;
    方向: string;
    荣誉: string;
    北京办公室: string;
    合肥办公室: string;
    [key: string]: string;
  };
  description: string;
  source?: { path?: string; sha256?: string };
  sha?: string;
};

const API = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
type Section = 'products' | 'brand' | 'messages';
type Notice = { kind: 'success' | 'error'; text: string };

function formatCoverUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('../')) return url.replace(/^\.\.\//, '/');
  if (!url.startsWith('/') && !url.startsWith('http')) return '/' + url;
  return url;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const adminEmail = localStorage.getItem('admin_email') || (import.meta.env.VITE_ADMIN_EMAIL as string | undefined) || 'tetsuya.ueno@outlook.com';
  if (adminEmail) {
    if (!headers.has('cf-access-authenticated-user-email')) {
      headers.set('cf-access-authenticated-user-email', adminEmail);
    }
    if (!headers.has('x-admin-email')) {
      headers.set('x-admin-email', adminEmail);
    }
  }
  const response = await fetch(`${API}/${path}`, { ...init, headers });
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
    const url = window.prompt('图片 URL（可先通过上传图片按钮上传）', 'https://');
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

function Field({ label, value, onChange, multiline = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; disabled?: boolean }) {
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? <textarea disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} /> : <input disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} />}
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
  const [uploading, setUploading] = useState(false);
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const form = new FormData();
      form.append('file', file);
      const res = await request<{ ok: boolean; url: string }>('upload', {
        method: 'POST',
        body: form,
      });
      if (res?.url) {
        update('cover', res.url);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

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
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '-8px', marginBottom: '8px' }}>
            {product.cover && (
              <img
                src={formatCoverUrl(product.cover)}
                alt="封面预览"
                style={{ width: '48px', height: '64px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #ccc' }}
                onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
              />
            )}
            <label style={{ cursor: 'pointer', padding: '6px 12px', background: '#f5f5f5', borderRadius: '4px', fontSize: '12px', border: '1px solid #ddd' }}>
              {uploading ? '上传中…' : '上传本地图片'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpload} disabled={uploading || busy} />
            </label>
          </div>
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

function App() {
  const [section, setSection] = useState<Section>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [brand, setBrand] = useState<BrandInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [isNewProduct, setIsNewProduct] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    try {
      setProducts(await request<Product[]>('products'));
      setNotice(null);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '图书列表加载失败' });
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async () => {
    setLoading(true);
    try {
      setMessages(await request<Message[]>('messages'));
      setNotice(null);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '留言列表加载失败' });
    } finally {
      setLoading(false);
    }
  };

  const loadBrand = async () => {
    setLoading(true);
    try {
      const data = await request<BrandInfo>('pages/about');
      setBrand(data);
      setNotice(null);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '品牌信息加载失败' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
    void request<Message[]>('messages').then(setMessages).catch(() => {});
  }, []);

  const changeSection = (next: Section) => {
    setSection(next);
    if (next === 'products') void loadProducts();
    if (next === 'brand') void loadBrand();
    if (next === 'messages') void loadMessages();
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

  const saveBrand = async () => {
    if (!brand) return;
    setBusy(true);
    try {
      await request('pages/about', jsonRequest('PUT', brand));
      setNotice({ kind: 'success', text: '品牌与联系方式已更新，并成功提交 GitHub commit！' });
      await loadBrand();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : '保存失败' });
    } finally {
      setBusy(false);
    }
  };

  const toggleMessageRead = async (item: Message) => {
    try {
      await request(`messages/${encodeURIComponent(item.id)}`, jsonRequest('PUT', { is_read: !item.is_read }));
      setMessages((prev) => prev.map((m) => (m.id === item.id ? { ...m, is_read: !m.is_read } : m)));
    } catch (error) {
      alert(error instanceof Error ? error.message : '更新状态失败');
    }
  };

  const deleteMessage = async (item: Message) => {
    if (!window.confirm(`确定删除来自「${item.name}」的留言吗？`)) return;
    try {
      await request(`messages/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      setMessages((prev) => prev.filter((m) => m.id !== item.id));
      setNotice({ kind: 'success', text: '留言已删除并提交 GitHub commit' });
    } catch (error) {
      alert(error instanceof Error ? error.message : '删除失败');
    }
  };

  const unreadCount = messages.filter((m) => !m.is_read).length;

  return (
    <div className="shell">
      <header className="topbar">
        <div><span className="eyebrow">MAISHUFANG / CONTENT STORE</span><h1>内容管理系统</h1></div>
        <div className="access"><span className="status-dot" />Cloudflare Access 鉴权保护</div>
      </header>
      <main className="layout">
        <aside className="sidebar">
          <div className="side-title">内容管理</div>
          <button type="button" className={section === 'products' ? 'active' : ''} onClick={() => changeSection('products')}>
            图书 <b>{products.length}</b>
          </button>
          <button type="button" className={section === 'brand' ? 'active' : ''} onClick={() => changeSection('brand')}>
            品牌与联系 <b>—</b>
          </button>
          <button type="button" className={section === 'messages' ? 'active' : ''} onClick={() => changeSection('messages')}>
            留言板 {unreadCount > 0 ? <span className="badge">{unreadCount}</span> : <b>{messages.length}</b>}
          </button>
          <div className="side-title second">快捷操作</div>
          <button type="button" onClick={createProduct}>＋ 新增图书</button>
        </aside>

        <section className="content">
          {notice && <div className={notice.kind === 'success' ? 'notice' : 'error'} role="status">{notice.text}</div>}

          {/* 1. 图书列表 */}
          {section === 'products' && (
            <>
              <div className="section-head">
                <div><span className="eyebrow">CATALOG / {products.length} ITEMS</span><h2>图书目录</h2></div>
                <button type="button" className="primary" onClick={createProduct}>新增图书</button>
              </div>
              {loading ? (
                <div className="empty">正在读取 GitHub 内容…</div>
              ) : products.length === 0 ? (
                <div className="empty">还没有图书。新增第一本书。</div>
              ) : (
                <div className="list">
                  {products.map((item) => (
                    <button type="button" className="row" key={item.id} onClick={() => { setIsNewProduct(false); setProduct({ ...item }); }}>
                      <span className="cover">
                        {item.cover ? <img src={formatCoverUrl(item.cover)} alt="" onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }} /> : '书'}
                      </span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.author || '未填写作者'} · {item.published_at || '未填写年份'}</small>
                      </span>
                      <span className="chevron">›</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* 2. 品牌与联系我们 */}
          {section === 'brand' && (
            <>
              <div className="section-head">
                <div><span className="eyebrow">BRAND & CONTACT / PAGES</span><h2>品牌与联系我们</h2></div>
                <button type="button" className="primary" disabled={busy || !brand} onClick={() => void saveBrand()}>
                  {busy ? '正在提交 Git Commit…' : '保存并发布'}
                </button>
              </div>
              {loading || !brand ? (
                <div className="empty">正在读取品牌信息…</div>
              ) : (
                <div className="brand-panel">
                  <h3>基本信息</h3>
                  <div className="form">
                    <div className="form-grid">
                      <Field label="页面大标题" value={brand.title || ''} onChange={(v) => setBrand({ ...brand, title: v })} />
                      <Field label="品牌副标题" value={brand.subtitle || ''} onChange={(v) => setBrand({ ...brand, subtitle: v })} />
                      <Field label="成立时间" value={brand.brand_details?.['成立时间'] || ''} onChange={(v) => setBrand({ ...brand, brand_details: { ...brand.brand_details, 成立时间: v } })} />
                      <Field label="注册地" value={brand.brand_details?.['注册地'] || ''} onChange={(v) => setBrand({ ...brand, brand_details: { ...brand.brand_details, 注册地: v } })} />
                    </div>
                    <Field label="业务方向" value={brand.brand_details?.['方向'] || ''} onChange={(v) => setBrand({ ...brand, brand_details: { ...brand.brand_details, 方向: v } })} />
                    <Field label="主要荣誉" value={brand.brand_details?.['荣誉'] || ''} onChange={(v) => setBrand({ ...brand, brand_details: { ...brand.brand_details, 荣誉: v } })} />

                    <h3 style={{ marginTop: '20px' }}>办公室地址</h3>
                    <div className="form-grid">
                      <Field label="北京办公室" value={brand.brand_details?.['北京办公室'] || ''} onChange={(v) => setBrand({ ...brand, brand_details: { ...brand.brand_details, 北京办公室: v } })} />
                      <Field label="合肥办公室" value={brand.brand_details?.['合肥办公室'] || ''} onChange={(v) => setBrand({ ...brand, brand_details: { ...brand.brand_details, 合肥办公室: v } })} />
                    </div>

                    <h3 style={{ marginTop: '20px' }}>详细介绍与荣誉奖项</h3>
                    <Field label="品牌介绍与荣誉文案" multiline value={brand.description || ''} onChange={(v) => setBrand({ ...brand, description: v })} />
                  </div>
                  <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" className="primary" disabled={busy} onClick={() => void saveBrand()}>
                      {busy ? '正在提交 Git Commit…' : '保存并发布'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 3. 留言板 */}
          {section === 'messages' && (
            <>
              <div className="section-head">
                <div>
                  <span className="eyebrow">FEEDBACK / {messages.length} MESSAGES</span>
                  <h2>留言板 {unreadCount > 0 && <span style={{ fontSize: '15px', color: '#933a2a', fontWeight: 'normal' }}>({unreadCount} 条未读)</span>}</h2>
                </div>
                <button type="button" className="quiet-button" onClick={() => void loadMessages()}>刷新留言</button>
              </div>
              {loading ? (
                <div className="empty">正在读取留言列表…</div>
              ) : messages.length === 0 ? (
                <div className="empty">暂无访客留言。前台「联系我们」表单提交的内容将实时展示在此处。</div>
              ) : (
                <div className="message-list">
                  {messages.map((item) => (
                    <div key={item.id} className={`message-card ${!item.is_read ? 'unread' : ''}`}>
                      <div className="message-head">
                        <div className="message-author">
                          <strong>{item.name}</strong>
                          <a href={`mailto:${item.email}`} title="点击直接发送邮件回复">✉ {item.email}</a>
                          {!item.is_read && <span style={{ color: '#933a2a', fontSize: '11px', fontWeight: 'bold' }}>[未读]</span>}
                        </div>
                        <div className="message-time">
                          {new Date(item.created_at).toLocaleString('zh-CN', { hour12: false })}
                        </div>
                      </div>
                      <div className="message-body">{item.content}</div>
                      <div className="message-actions">
                        <button type="button" className="btn-text" onClick={() => void toggleMessageRead(item)}>
                          {item.is_read ? '标为未读' : '标为已读'}
                        </button>
                        <a href={`mailto:${item.email}?subject=回复：麦书房留言`} className="btn-text" style={{ textDecoration: 'none' }}>
                          回复邮件
                        </a>
                        <button type="button" className="btn-text danger-text" onClick={() => void deleteMessage(item)}>
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {product && (
        <ProductModal
          product={product}
          isNew={isNewProduct}
          busy={busy}
          onChange={setProduct}
          onSave={() => void saveProduct()}
          onDelete={() => void deleteProduct()}
          onClose={() => setProduct(null)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
