export default {
    async fetch(request, env) {
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        };

        // 1. 优先处理预检请求
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // 2. 现有的 API 路由分发
            if (path === '/api/auth/register') return await handleRegister(request, env, corsHeaders);
            if (path === '/api/auth/login') return await handleLogin(request, env, corsHeaders);
            if (path === '/api/auth/logout') return await handleLogout(request, env, corsHeaders);
            if (path === '/api/sync/pull') return await handlePull(request, env, corsHeaders);
            if (path === '/api/sync/push') return await handlePush(request, env, corsHeaders);
            if (path === '/api/bing') return await handleBingWallpaper(corsHeaders);

            // 3. ✨ Web 桌面：非 /api/ 访问统一返回内置的单页应用 (需登录才可见数据)
            if (!path.startsWith('/api/')) {
                return new Response(renderWebDashboardHtml(), {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' },
                });
            }

            return jsonResponse({ error: 'Not Found' }, 404, corsHeaders);
        } catch (error) {
            console.error('Worker Error:', error.message);
            const status = error.status || 500;
            return jsonResponse({
                error: error.message,
                stack: error.stack
            }, status, corsHeaders);
        }
    },
};

// =========================================================================
// 核心业务 API 逻辑函数 (保持原有逻辑完备)
// =========================================================================

async function verifyToken(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        const err = new Error('未授权：缺少 Token');
        err.status = 401;
        throw err;
    }

    const token = authHeader.substring(7);
    const email = await env.NewTab_KV.get(`token:${token}`);

    if (!email) {
        const err = new Error('登录已过期或无效');
        err.status = 401;
        throw err;
    }
    return email;
}

function jsonResponse(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    });
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handleBingWallpaper(corsHeaders) {
    const bingApiUrl = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN';
    const response = await fetch(bingApiUrl);
    if (!response.ok) throw new Error('无法访问 Bing 接口');

    const data = await response.json();
    if (data && data.images && data.images.length > 0) {
        const imgUrl = 'https://cn.bing.com' + data.images[0].url;
        const copyright = data.images[0].copyright;
        return jsonResponse({ url: imgUrl, copyright }, 200, corsHeaders);
    } else {
        throw new Error('解析 Bing 返回数据失败');
    }
}

async function handleRegister(request, env, corsHeaders) {
    const { email, password } = await request.json();
    if (!email || !password) return jsonResponse({ error: '邮箱和密码不能为空' }, 400, corsHeaders);

    const existingUser = await env.NewTab_KV.get(`user:${email}`);
    if (existingUser) return jsonResponse({ error: '用户已存在' }, 409, corsHeaders);

    const user = { email, passwordHash: await hashPassword(password), createdAt: Date.now() };
    await env.NewTab_KV.put(`user:${email}`, JSON.stringify(user));

    const token = crypto.randomUUID();
    await env.NewTab_KV.put(`token:${token}`, email, { expirationTtl: 2592000 });
    return jsonResponse({ token, email }, 201, corsHeaders);
}

async function handleLogin(request, env, corsHeaders) {
    const { email, password } = await request.json();
    if (!email || !password) return jsonResponse({ error: '邮箱和密码不能为空' }, 400, corsHeaders);

    const userData = await env.NewTab_KV.get(`user:${email}`);
    if (!userData) return jsonResponse({ error: '凭证无效' }, 401, corsHeaders);

    const user = JSON.parse(userData);
    if (await hashPassword(password) !== user.passwordHash) return jsonResponse({ error: '凭证无效' }, 401, corsHeaders);

    const token = crypto.randomUUID();
    await env.NewTab_KV.put(`token:${token}`, email, { expirationTtl: 2592000 });
    return jsonResponse({ token, email }, 200, corsHeaders);
}

async function handleLogout(request, env, corsHeaders) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
        await env.NewTab_KV.delete(`token:${authHeader.substring(7)}`);
    }
    return jsonResponse({ success: true }, 200, corsHeaders);
}

async function handlePull(request, env, corsHeaders) {
    const email = await verifyToken(request, env);
    const syncData = await env.NewTab_KV.get(`sync:${email}`);
    return jsonResponse({ data: syncData ? JSON.parse(syncData) : null }, 200, corsHeaders);
}

async function handlePush(request, env, corsHeaders) {
    const email = await verifyToken(request, env);
    const data = await request.json();
    const existingData = await env.NewTab_KV.get(`sync:${email}`);
    const existing = existingData ? JSON.parse(existingData) : null;
    const existingUpdatedAt = Number(existing?.updatedAt);
    const hasExistingData = Boolean(existing);
    const hasExistingTimestamp = Number.isFinite(existingUpdatedAt);
    const incomingUpdatedAt = Number(data.updatedAt);
    const incomingBaseUpdatedAt = Number(data.baseUpdatedAt);
    const hasIncomingTimestamp = data.updatedAt !== null && data.updatedAt !== undefined && Number.isFinite(incomingUpdatedAt);
    const hasIncomingBaseTimestamp = data.baseUpdatedAt !== null && data.baseUpdatedAt !== undefined && Number.isFinite(incomingBaseUpdatedAt);

    if (hasExistingData && !hasIncomingTimestamp) {
        return jsonResponse({
            error: 'Conflict: refusing timestamp-less sync push over existing cloud data',
            code: 'SYNC_CONFLICT_MISSING_TIMESTAMP',
            currentUpdatedAt: hasExistingTimestamp ? existingUpdatedAt : null,
        }, 409, corsHeaders);
    }

    if (hasExistingTimestamp) {
        if (hasIncomingBaseTimestamp && incomingBaseUpdatedAt < existingUpdatedAt) {
            return jsonResponse({
                error: 'Conflict: cloud data is newer than the client base version',
                code: 'SYNC_CONFLICT_STALE_BASE',
                currentUpdatedAt: existingUpdatedAt,
            }, 409, corsHeaders);
        }

        if (!hasIncomingBaseTimestamp && incomingUpdatedAt < existingUpdatedAt) {
            return jsonResponse({
                error: 'Conflict: cloud data is newer than the incoming payload',
                code: 'SYNC_CONFLICT_STALE_PAYLOAD',
                currentUpdatedAt: existingUpdatedAt,
            }, 409, corsHeaders);
        }
    }

    const syncData = { ...data, updatedAt: hasIncomingTimestamp ? incomingUpdatedAt : Date.now() };
    delete syncData.baseUpdatedAt;
    await env.NewTab_KV.put(`sync:${email}`, JSON.stringify(syncData));
    return jsonResponse({ success: true, updatedAt: syncData.updatedAt }, 200, corsHeaders);
}

// =========================================================================
// ✨ 前端页面渲染 (桌面 / 待办 / 笔记 Tab 模式)
// =========================================================================

function renderWebDashboardHtml() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>iTabs Web 桌面</title>
  <link rel="icon" href="https://api.iconify.design/lucide:layout-grid.svg?color=%236366f1">
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- 引入轻量 Markdown 解析库渲染笔记 -->
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            glass: 'rgba(255, 255, 255, 0.08)',
            'glass-border': 'rgba(255, 255, 255, 0.16)',
          }
        }
      }
    }
  </script>
  <style>
    body {
      background-color: #0f172a;
      background-size: cover;
      background-position: center;
      background-attachment: fixed;
      transition: background-image 0.5s ease-in-out;
    }
    .custom-scrollbar::-webkit-scrollbar {
      width: 5px;
      height: 5px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 9999px;
    }
    .markdown-body {
      word-break: break-word;
      overflow-wrap: break-word;
      line-height: 1.8;
      color: #e2e8f0;
    }
    .markdown-body h1 { font-size: 1.45rem; font-weight: 700; margin-bottom: 0.85rem; color: #fff; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.3rem; }
    .markdown-body h2 { font-size: 1.25rem; font-weight: 600; margin-top: 1.2rem; margin-bottom: 0.6rem; color: #f1f5f9; }
    .markdown-body h3 { font-size: 1.1rem; font-weight: 600; margin-top: 1rem; margin-bottom: 0.4rem; color: #e2e8f0; }
    .markdown-body p { margin-bottom: 0.85rem; line-height: 1.8; color: #cbd5e1; white-space: pre-wrap; }
    .markdown-body ul { list-style-type: disc; margin-left: 1.25rem; margin-bottom: 0.85rem; color: #cbd5e1; }
    .markdown-body ol { list-style-type: decimal; margin-left: 1.25rem; margin-bottom: 0.85rem; color: #cbd5e1; }
    .markdown-body li { margin-bottom: 0.35rem; white-space: pre-wrap; }
    .markdown-body code { background: rgba(255,255,255,0.12); padding: 0.15rem 0.35rem; border-radius: 0.25rem; font-size: 0.88em; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    .markdown-body pre { background: rgba(0,0,0,0.5); padding: 0.85rem; border-radius: 0.5rem; overflow-x: auto; margin-bottom: 0.85rem; white-space: pre; border: 1px solid rgba(255,255,255,0.08); }
    .markdown-body pre code { background: transparent; padding: 0; }
    .markdown-body blockquote { border-left: 3px solid #6366f1; padding-left: 0.85rem; color: #94a3b8; margin-bottom: 0.85rem; }
    .markdown-body hr { border-color: rgba(255,255,255,0.1); margin: 1.25rem 0; }
  </style>
</head>
<body class="min-h-screen text-slate-100 font-sans flex flex-col antialiased selection:bg-indigo-500 selection:text-white">

  <!-- 背景遮罩层 -->
  <div class="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] -z-10"></div>

  <!-- 顶部导航栏 -->
  <header class="w-full border-b border-glass-border bg-black/20 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 py-3 flex justify-between items-center">
    <div class="flex items-center gap-2.5 sm:gap-3">
      <div class="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-400 flex items-center justify-center shadow-lg shadow-indigo-500/30">
        <svg class="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      </div>
      <span class="font-bold tracking-wide text-base sm:text-lg bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">iTabs Web</span>
      <span id="sync-status" class="hidden text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">已同步</span>
    </div>

    <!-- 用户栏状态 -->
    <div id="auth-bar" class="flex items-center gap-2 sm:gap-3">
      <span id="user-email-text" class="text-xs sm:text-sm text-slate-300 hidden md:inline"></span>
      <button id="logout-btn" onclick="logout()" class="hidden px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-red-500/20 text-slate-200 hover:text-red-300 border border-glass-border transition">
        退出
      </button>
    </div>
  </header>

  <!-- 主体区域 -->
  <main class="flex-1 max-w-6xl w-full mx-auto p-3 sm:p-5 lg:p-6 flex flex-col min-h-0">

    <!-- 1. 未登录卡片 -->
    <div id="login-section" class="flex-1 flex items-center justify-center py-10">
      <div class="w-full max-w-md bg-white/[0.08] backdrop-blur-xl border border-glass-border rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div class="text-center mb-6 sm:mb-8">
          <h2 class="text-xl sm:text-2xl font-bold text-white mb-2" id="form-title">欢迎登录 iTabs</h2>
          <p class="text-xs sm:text-sm text-slate-400">输入账号查看并访问您的云端桌面与笔记</p>
        </div>

        <form id="auth-form" onsubmit="handleAuthSubmit(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-slate-300 mb-1.5">邮箱地址</label>
            <input id="auth-email" type="email" required placeholder="name@example.com" class="w-full px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-black/30 border border-glass-border text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-400 transition" />
          </div>
          <div>
            <label class="block text-xs font-medium text-slate-300 mb-1.5">密码</label>
            <input id="auth-password" type="password" required placeholder="••••••••" class="w-full px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-black/30 border border-glass-border text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-400 transition" />
          </div>

          <div id="auth-error" class="hidden text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg"></div>

          <button id="auth-submit-btn" type="submit" class="w-full py-2.5 rounded-xl font-medium text-sm bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition">
            登 录
          </button>
        </form>

        <div class="mt-6 text-center text-xs text-slate-400">
          <span id="toggle-auth-prompt">还没有账号？</span>
          <button type="button" onclick="toggleAuthMode()" id="toggle-auth-btn" class="text-indigo-400 hover:underline font-medium ml-1">注册新账号</button>
        </div>
      </div>
    </div>

    <!-- 2. 已登录主视窗 (Tab 标签页切换) -->
    <div id="dashboard-section" class="hidden flex-1 flex flex-col space-y-4">
      
      <!-- 🗂️ 顶置 Tab 标签栏 (桌面 / 待办 / 笔记) -->
      <div class="flex items-center justify-center w-full">
        <div class="inline-flex p-1 rounded-2xl bg-black/30 backdrop-blur-md border border-glass-border shadow-xl">
          
          <!-- Tab 1: 桌面 -->
          <button id="tab-btn-shortcuts" onclick="switchTab('shortcuts')"
                  class="flex items-center gap-1.5 px-3.5 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span>桌面</span>
            <span id="shortcuts-count" class="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 text-white">0</span>
          </button>

          <!-- Tab 2: 待办 -->
          <button id="tab-btn-todos" onclick="switchTab('todos')"
                  class="flex items-center gap-1.5 px-3.5 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 text-slate-400 hover:text-white">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>待办</span>
            <span id="todos-count" class="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-slate-300">0</span>
          </button>

          <!-- Tab 3: 笔记 -->
          <button id="tab-btn-notes" onclick="switchTab('notes')"
                  class="flex items-center gap-1.5 px-3.5 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 text-slate-400 hover:text-white">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>笔记</span>
            <span id="notes-count" class="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 text-slate-300">0</span>
          </button>

        </div>
      </div>

      <!-- 📦 Tab 内容展示区域 -->
      <div class="flex-1">

        <!-- 📌 视图 1: 桌面 (快捷方式) -->
        <div id="view-shortcuts" class="animate-fade">
          <div class="bg-white/[0.07] backdrop-blur-md border border-glass-border rounded-3xl p-4 sm:p-6 shadow-xl min-h-[300px]">
            <div id="shortcuts-container" class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2.5 sm:gap-4">
              <!-- 动态加载桌面图标和文件夹 -->
            </div>
            <div id="shortcuts-empty" class="hidden py-16 text-center text-slate-400 text-xs sm:text-sm">
              暂无桌面图标，请先在 Chrome 扩展中添加并同步
            </div>
          </div>
        </div>

        <!-- 📌 视图 2: 待办 -->
        <div id="view-todos" class="hidden animate-fade">
          <div class="bg-white/[0.07] backdrop-blur-md border border-glass-border rounded-3xl p-4 sm:p-6 shadow-xl max-w-2xl mx-auto flex flex-col min-h-[400px]">
            <div class="flex items-center justify-between pb-3 mb-3 border-b border-glass-border">
              <h2 class="text-sm sm:text-base font-semibold text-slate-200">待办任务</h2>
              <span class="text-xs text-slate-400">点击勾选完成 &bull; 自动云端同步</span>
            </div>

            <!-- 新增待办输入栏 -->
            <div class="flex gap-2 mb-4">
              <input id="new-todo-input" type="text" placeholder="输入待办事项，按回车添加..."
                     onkeydown="if(event.key==='Enter') addTodo()"
                     class="flex-1 px-3.5 py-2.5 bg-black/30 border border-glass-border rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400 transition" />
              <button onclick="addTodo()" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-medium transition flex items-center gap-1 shadow-md shadow-emerald-600/20">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                <span>添加</span>
              </button>
            </div>

            <div id="todos-container" class="space-y-2 flex-1 overflow-y-auto pr-1 custom-scrollbar">
              <!-- 动态待办 -->
            </div>
            <div id="todos-empty" class="hidden my-auto py-12 text-center text-slate-400 text-xs">
              暂无待办事项，快在上方添加一个吧
            </div>
          </div>
        </div>

        <!-- 📌 视图 3: 笔记 -->
        <div id="view-notes" class="hidden animate-fade">
          <div class="bg-white/[0.07] backdrop-blur-md border border-glass-border rounded-3xl p-3 sm:p-5 shadow-xl">
            <!-- 整体容器自适应大屏高度，最低 600px，最大 820px -->
            <div id="notes-wrapper" class="flex flex-col md:flex-row gap-3 sm:gap-4 min-h-[580px] h-[72vh] max-h-[820px] min-h-0">
              
              <!-- 👈 左侧紧凑笔记列表 (固定宽度 300px，让右侧编辑空间最大化) -->
              <div id="notes-list-panel" class="w-full md:w-72 lg:w-80 shrink-0 flex flex-col bg-black/25 rounded-2xl border border-glass-border p-2.5 sm:p-3 overflow-hidden min-h-0">
                <div class="flex items-center justify-between pb-2 mb-2 border-b border-white/5 shrink-0">
                  <span class="text-xs text-slate-400 font-medium">笔记列表</span>
                  <!-- ➕ 新建笔记按钮 -->
                  <button onclick="startCreateNote()" class="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-xs font-medium border border-amber-500/30 flex items-center gap-1 transition">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                    <span>新建笔记</span>
                  </button>
                </div>
                <div id="notes-list-container" class="flex-1 overflow-y-auto space-y-1.5 sm:space-y-2 pr-1 custom-scrollbar min-h-0">
                  <!-- 动态笔记折叠卡片列表 -->
                </div>
                <div id="notes-empty" class="hidden my-auto text-center text-slate-400 text-xs py-10">
                  暂无云端笔记，点击上方按钮新建
                </div>
              </div>

              <!-- 👉 右侧同页笔记面板 (阅读 / 编辑 / 删除) -->
              <div id="notes-detail-panel" class="hidden md:flex flex-1 flex-col bg-black/35 rounded-2xl border border-glass-border p-4 sm:p-6 overflow-hidden min-h-0 min-w-0">
                
                <!-- 顶部工具栏 (标题 + 操作按钮) -->
                <div class="flex justify-between items-start pb-2.5 border-b border-glass-border/60 mb-2.5 shrink-0">
                  <div class="min-w-0 flex-1 mr-2">
                    <h3 id="right-note-title" class="text-base sm:text-xl font-bold text-white break-words line-clamp-2">请选择笔记</h3>
                    <div id="right-note-time" class="text-[11px] text-slate-400 mt-0.5"></div>
                  </div>

                  <div id="note-action-btns" class="flex items-center gap-1.5 shrink-0">
                    <button id="btn-edit-note" onclick="startEditNote()" class="hidden px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-slate-200 rounded-lg border border-glass-border transition flex items-center gap-1">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      <span>编辑</span>
                    </button>
                    <button id="btn-delete-note" onclick="deleteCurrentNote()" class="hidden px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg border border-red-500/30 transition flex items-center gap-1">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      <span>删除</span>
                    </button>
                    <button onclick="mobileBackToList()" class="md:hidden px-2.5 py-1.5 text-xs bg-white/10 text-slate-300 rounded-lg">
                      返回列表
                    </button>
                  </div>
                </div>
                
                <!-- 📖 阅读模式展示区域 (带 min-h-0 避免内容溢出被截断，加 pb-10 保证底部完全显示) -->
                <div id="right-note-body" class="flex-1 overflow-y-auto pr-1.5 sm:pr-2 custom-scrollbar text-xs sm:text-sm text-slate-200 min-h-0 pb-10">
                  <div class="h-full flex flex-col items-center justify-center text-slate-400 text-xs sm:text-sm gap-2">
                    <svg class="w-7 h-7 sm:w-8 sm:h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    <span>👈 点击左侧任意笔记查看或点击“新建笔记”</span>
                  </div>
                </div>

                <!-- ✏️ 编辑模式表单区域 (撑满空间，textarea 支持垂直自由拉大) -->
                <div id="right-note-editor" class="hidden flex-1 flex flex-col space-y-3 min-h-0 min-w-0">
                  <input id="editor-title" type="text" placeholder="笔记标题..."
                         class="w-full px-3.5 py-2.5 bg-black/40 border border-glass-border rounded-xl text-sm sm:text-base font-semibold text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition shrink-0" />
                  <textarea id="editor-content" placeholder="输入笔记正文，支持 Markdown 语法与回车自然换行..."
                            class="w-full flex-1 min-h-[360px] sm:min-h-[440px] px-3.5 sm:px-4 py-3 bg-black/40 border border-glass-border rounded-xl text-xs sm:text-sm sm:text-[14px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 transition resize-y custom-scrollbar leading-relaxed font-mono min-h-0"></textarea>
                  <div class="flex justify-end gap-2 pt-1 shrink-0">
                    <button onclick="cancelEditNote()" class="px-3.5 py-1.5 text-xs text-slate-300 hover:bg-white/10 rounded-lg transition">取消</button>
                    <button onclick="saveNote()" class="px-4 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg shadow-md transition">保存并同步</button>
                  </div>
                </div>

              </div>

            </div>
          </div>
        </div>

      </div>

    </div>
  </main>

  <!-- 📁 文件夹展开弹窗 (Folder Modal) -->
  <div id="folder-modal" class="fixed inset-0 bg-black/60 backdrop-blur-md z-50 hidden flex items-center justify-center p-4" onclick="handleFolderBackdropClick(event)">
    <div id="folder-modal-card" class="bg-slate-900/95 border border-white/20 rounded-3xl max-w-sm sm:max-w-lg w-full p-5 sm:p-6 shadow-2xl flex flex-col max-h-[80vh]">
      <div class="flex items-center justify-between pb-3 sm:pb-4 border-b border-glass-border mb-4">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <h3 id="modal-folder-title" class="font-bold text-base sm:text-lg text-white">文件夹</h3>
        </div>
        <button onclick="closeFolderModal()" class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div id="folder-items-container" class="grid grid-cols-4 gap-2.5 sm:gap-3 overflow-y-auto pr-1 custom-scrollbar min-h-[120px]">
        <!-- 动态文件夹内部图标 -->
      </div>
    </div>
  </div>

  <footer class="py-3 sm:py-4 text-center text-[11px] text-slate-500 border-t border-glass-border/40">
    iTabs Cloud Dashboard &bull; Powered by Cloudflare Workers
  </footer>

  <script>
    let isRegisterMode = false;
    let currentSyncData = null;
    let selectedNoteIndex = -1;
    let isCreatingNote = false;
    let currentTab = 'shortcuts';

    // 🗂️ Tab 切换逻辑 (桌面 / 待办 / 笔记)
    function switchTab(tab) {
      currentTab = tab;
      const tabs = ['shortcuts', 'todos', 'notes'];

      tabs.forEach(t => {
        const btn = document.getElementById('tab-btn-' + t);
        const view = document.getElementById('view-' + t);
        if (t === tab) {
          view.classList.remove('hidden');
          btn.className = 'flex items-center gap-1.5 px-3.5 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 bg-indigo-600 text-white shadow-md shadow-indigo-600/30';
        } else {
          view.classList.add('hidden');
          btn.className = 'flex items-center gap-1.5 px-3.5 sm:px-5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 text-slate-400 hover:text-white';
        }
      });
    }

    async function init() {
      loadBingWallpaper();
      const token = localStorage.getItem('itabs_token');
      const email = localStorage.getItem('itabs_email');

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeFolderModal();
      });

      if (!token) {
        showLoginView();
      } else {
        showDashboardView(email);
        await fetchCloudData(token);
      }
    }

    function toggleAuthMode() {
      isRegisterMode = !isRegisterMode;
      document.getElementById('form-title').innerText = isRegisterMode ? '注册 iTabs 账号' : '欢迎登录 iTabs';
      document.getElementById('auth-submit-btn').innerText = isRegisterMode ? '注 册' : '登 录';
      document.getElementById('toggle-auth-prompt').innerText = isRegisterMode ? '已有账号？' : '还没有账号？';
      document.getElementById('toggle-auth-btn').innerText = isRegisterMode ? '直接登录' : '注册新账号';
      document.getElementById('auth-error').classList.add('hidden');
    }

    async function handleAuthSubmit(e) {
      e.preventDefault();
      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      const errorEl = document.getElementById('auth-error');
      errorEl.classList.add('hidden');

      const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '请求失败');

        localStorage.setItem('itabs_token', data.token);
        localStorage.setItem('itabs_email', data.email);
        showDashboardView(data.email);
        fetchCloudData(data.token);
      } catch (err) {
        errorEl.innerText = err.message;
        errorEl.classList.remove('hidden');
      }
    }

    async function fetchCloudData(token) {
      try {
        const res = await fetch('/api/sync/pull', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.status === 401) {
          logout();
          return;
        }
        const result = await res.json();
        currentSyncData = result.data || {};
        renderDashboard(currentSyncData);
      } catch (err) {
        console.error('拉取数据失败:', err);
      }
    }

    // 🌟 全局持久化保存至 Cloudflare KV
    async function saveToCloud() {
      const token = localStorage.getItem('itabs_token');
      if (!token || !currentSyncData) return;

      const syncStatus = document.getElementById('sync-status');
      syncStatus.innerText = '同步中...';
      syncStatus.className = 'text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full inline-block';

      const baseUpdatedAt = currentSyncData.updatedAt || 0;
      const newUpdatedAt = Date.now();
      const payload = {
        ...currentSyncData,
        baseUpdatedAt: baseUpdatedAt,
        updatedAt: newUpdatedAt
      };

      try {
        const res = await fetch('/api/sync/push', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (res.ok) {
          currentSyncData.updatedAt = result.updatedAt;
          syncStatus.innerText = '已同步';
          syncStatus.className = 'text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full inline-block';
        } else {
          syncStatus.innerText = '同步失败';
          syncStatus.className = 'text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full inline-block';
        }
      } catch (e) {
        syncStatus.innerText = '网络异常';
        syncStatus.className = 'text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full inline-block';
      }
    }

    function renderDashboard(data) {
      const shortcuts = Array.isArray(data.shortcuts) ? data.shortcuts : [];
      const todos = Array.isArray(data.todos) ? data.todos : [];
      const notes = Array.isArray(data.notes) ? data.notes : [];

      renderShortcuts(shortcuts);
      renderTodos(todos);
      renderNotesList(notes);
    }

    // =========================================================================
    // 🎨 图标多重源检测与优雅降级机制
    // =========================================================================
    
    function generateLetterAvatar(text, size = 64) {
      const char = (text || 'A').trim().charAt(0).toUpperCase() || 'A';
      const gradients = [
        ['#6366f1', '#a855f7'],
        ['#3b82f6', '#06b6d4'],
        ['#10b981', '#059669'],
        ['#f59e0b', '#d97706'],
        ['#ec4899', '#f43f5e'],
        ['#8b5cf6', '#6366f1']
      ];
      let hash = 0;
      for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash);
      const [c1, c2] = gradients[Math.abs(hash) % gradients.length];

      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
        '<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '<stop offset="0%" stop-color="' + c1 + '" />' +
        '<stop offset="100%" stop-color="' + c2 + '" />' +
        '</linearGradient></defs>' +
        '<rect width="' + size + '" height="' + size + '" rx="' + (size * 0.28) + '" fill="url(#g)" />' +
        '<text x="50%" y="54%" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="' + (size * 0.48) + '" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">' + char + '</text>' +
        '</svg>';
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    }

    function getShortcutIcon(s) {
      if (s.customIcon && s.customIcon.data) return s.customIcon.data;
      if (s.customIcon && s.customIcon.url) return s.customIcon.url;
      if (s.icon && !s.icon.includes('google.com/s2/favicons')) return s.icon;

      if (s.customIcon && s.customIcon.type === 'letter') {
        return generateLetterAvatar(s.customIcon.letter || s.title || s.name);
      }

      if (s.url) {
        try {
          const domain = new URL(s.url).hostname;
          if (domain) {
            return 'https://api.iowen.cn/favicon/' + domain + '.png';
          }
        } catch (e) {}
      }

      return generateLetterAvatar(s.title || s.name || 'Web');
    }

    // 渲染桌面图标
    function renderShortcuts(shortcuts) {
      const container = document.getElementById('shortcuts-container');
      const emptyEl = document.getElementById('shortcuts-empty');
      document.getElementById('shortcuts-count').innerText = shortcuts.length;

      if (shortcuts.length === 0) {
        container.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
      }
      emptyEl.classList.add('hidden');

      container.innerHTML = shortcuts.map((s, idx) => {
        const isFolder = s.type === 'folder';
        const title = s.title || s.name || (isFolder ? '文件夹' : '快捷方式');

        if (isFolder) {
          const children = Array.isArray(s.children) ? s.children : [];
          const previewIcons = children.slice(0, 9);
          const gridCols = previewIcons.length <= 4 ? 'grid-cols-2' : 'grid-cols-3';

          return \`
            <div onclick="openFolderModal('\${s.id || idx}')"
                 class="group flex flex-col items-center justify-center p-1 cursor-pointer select-none">
              <div class="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl mb-1 p-1 sm:p-1.5 bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/20 shadow-md shadow-black/30 grid \${gridCols} gap-0.5 sm:gap-1 items-center justify-center overflow-hidden group-hover:scale-108 transition-all duration-200">
                \${previewIcons.map(child => {
                  const fallback = generateLetterAvatar(child.title || child.name || 'W', 32);
                  return \`<img src="\${getShortcutIcon(child)}" class="w-full h-full object-contain rounded-[2px] sm:rounded-xs" onerror="this.onerror=null;this.src='\${fallback}'" />\`;
                }).join('')}
                \${previewIcons.length === 0 ? '<div class="w-full h-full flex items-center justify-center col-span-3 text-[9px] text-slate-400">空</div>' : ''}
              </div>
              <span class="text-[11px] sm:text-xs font-medium text-slate-200 group-hover:text-white truncate w-full text-center tracking-tight leading-tight">
                \${title}
              </span>
            </div>
          \`;
        }

        const url = s.url || '#';
        const iconSrc = getShortcutIcon(s);
        const fallbackIcon = generateLetterAvatar(title, 64);

        return \`
          <a href="\${url}" target="_blank" rel="noopener noreferrer"
             class="group flex flex-col items-center justify-center p-1 cursor-pointer select-none">
            <div class="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl mb-1 flex items-center justify-center overflow-hidden p-1.5 sm:p-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/15 shadow-md shadow-black/30 group-hover:scale-108 transition-all duration-200">
              <img src="\${iconSrc}" alt="\${title}" class="w-full h-full object-contain rounded-md sm:rounded-lg" onerror="this.onerror=null;this.src='\${fallbackIcon}'" />
            </div>
            <span class="text-[11px] sm:text-xs font-medium text-slate-200 group-hover:text-white truncate w-full text-center tracking-tight leading-tight">
              \${title}
            </span>
          </a>
        \`;
      }).join('');
    }

    // 文件夹弹窗
    function openFolderModal(folderId) {
      const shortcuts = currentSyncData?.shortcuts || [];
      const folder = shortcuts.find(s => String(s.id) === String(folderId)) || shortcuts[folderId];
      if (!folder || folder.type !== 'folder') return;

      document.getElementById('modal-folder-title').innerText = folder.title || '文件夹';
      const container = document.getElementById('folder-items-container');
      const children = Array.isArray(folder.children) ? folder.children : [];

      if (children.length === 0) {
        container.innerHTML = '<div class="col-span-4 text-center py-8 text-xs text-slate-400">该文件夹为空</div>';
      } else {
        container.innerHTML = children.map(child => {
          const title = child.title || child.name || '快捷方式';
          const url = child.url || '#';
          const iconSrc = getShortcutIcon(child);
          const fallbackIcon = generateLetterAvatar(title, 64);

          return \`
            <a href="\${url}" target="_blank" rel="noopener noreferrer"
               class="group flex flex-col items-center justify-center p-1 cursor-pointer select-none">
              <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl mb-1 flex items-center justify-center overflow-hidden p-1.5 bg-white/10 hover:bg-white/20 border border-white/15 group-hover:scale-108 transition-all duration-200">
                <img src="\${iconSrc}" alt="\${title}" class="w-full h-full object-contain rounded-md" onerror="this.onerror=null;this.src='\${fallbackIcon}'" />
              </div>
              <span class="text-[10px] sm:text-[11px] font-medium text-slate-300 group-hover:text-white truncate w-full text-center leading-tight">
                \${title}
              </span>
            </a>
          \`;
        }).join('');
      }

      document.getElementById('folder-modal').classList.remove('hidden');
    }

    function closeFolderModal() {
      document.getElementById('folder-modal').classList.add('hidden');
    }

    function handleFolderBackdropClick(e) {
      if (!document.getElementById('folder-modal-card').contains(e.target)) {
        closeFolderModal();
      }
    }

    // =========================================================================
    // ✅ 待办模块：渲染 + 新增 + 切换状态 + 删除
    // =========================================================================

    function renderTodos(todos) {
      const container = document.getElementById('todos-container');
      const emptyEl = document.getElementById('todos-empty');
      const completedCount = todos.filter(t => t.completed).length;
      document.getElementById('todos-count').innerText = todos.length ? (completedCount + '/' + todos.length) : '0';

      if (todos.length === 0) {
        container.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
      }
      emptyEl.classList.add('hidden');

      container.innerHTML = todos.map((t, idx) => {
        const isDone = Boolean(t.completed);
        return \`
          <div class="group flex items-center justify-between gap-2.5 p-3 rounded-2xl bg-white/5 hover:bg-white/[0.08] border border-glass-border text-xs sm:text-sm transition">
            <div class="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onclick="toggleTodoStatus(\${idx})">
              <input type="checkbox" \${isDone ? 'checked' : ''} class="rounded border-slate-600 text-emerald-500 w-4 h-4 cursor-pointer pointer-events-none" />
              <span class="truncate flex-1 select-none \${isDone ? 'line-through text-slate-400' : 'text-slate-200'}">\${t.text || t.content || '未命名待办'}</span>
            </div>
            <button onclick="deleteTodo(\${idx})" class="opacity-40 group-hover:opacity-100 text-slate-400 hover:text-red-400 p-1.5 rounded transition" title="删除">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        \`;
      }).join('');
    }

    function addTodo() {
      const input = document.getElementById('new-todo-input');
      const text = input.value.trim();
      if (!text) return;

      if (!Array.isArray(currentSyncData.todos)) currentSyncData.todos = [];
      currentSyncData.todos.unshift({
        id: 'todo-' + Date.now(),
        text: text,
        completed: false,
        createdAt: Date.now()
      });

      input.value = '';
      renderTodos(currentSyncData.todos);
      saveToCloud();
    }

    function toggleTodoStatus(idx) {
      if (!currentSyncData?.todos?.[idx]) return;
      currentSyncData.todos[idx].completed = !currentSyncData.todos[idx].completed;
      renderTodos(currentSyncData.todos);
      saveToCloud();
    }

    function deleteTodo(idx) {
      if (!currentSyncData?.todos?.[idx]) return;
      currentSyncData.todos.splice(idx, 1);
      renderTodos(currentSyncData.todos);
      saveToCloud();
    }

    // =========================================================================
    // 📝 笔记模块：列表 + 新建 + 编辑 + 阅读 + 删除
    // =========================================================================

        // 配置 marked 解析规则：breaks: true 保证普通回车转换为 <br>，gfm: true 支持 GFM 换行
    if (typeof marked !== 'undefined') {
      try {
        if (marked.setOptions) marked.setOptions({ breaks: true, gfm: true });
        if (marked.use) marked.use({ breaks: true, gfm: true });
      } catch (e) {
        console.warn('marked 配置失败:', e);
      }
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function cleanMarkdownSummary(text) {
      return (text || '').replace(/[#*~>_\\-\\[\\]()]/g, ' ').replace(/\\s+/g, ' ').trim();
    }

    function formatTime(iso) {
      if (!iso) return '';
      try {
        const d = new Date(iso);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        return '';
      }
    }

    function renderNotesList(notes) {
      const container = document.getElementById('notes-list-container');
      const emptyEl = document.getElementById('notes-empty');
      document.getElementById('notes-count').innerText = notes.length;

      if (notes.length === 0) {
        container.innerHTML = '';
        emptyEl.classList.remove('hidden');
        resetRightNotePanel();
        return;
      }
      emptyEl.classList.add('hidden');

      container.innerHTML = notes.map((n, idx) => {
        const title = n.title || '无标题笔记';
        const content = cleanMarkdownSummary(n.content);
        const timeStr = formatTime(n.updatedAt || n.createdAt);
        const isSelected = idx === selectedNoteIndex;

        return \`
          <div onclick="selectNote(\${idx})" id="note-item-\${idx}"
               class="p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer select-none \${
                 isSelected
                   ? 'bg-indigo-600/20 border-indigo-500/80 shadow-md shadow-indigo-500/10'
                   : 'bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/20'
               }">
            <div class="flex items-center justify-between gap-1.5 mb-1">
              <h4 class="font-semibold text-xs text-slate-100 truncate \${isSelected ? 'text-indigo-300' : ''}">\${title}</h4>
              <span class="text-[9px] sm:text-[10px] text-slate-500 shrink-0">\${timeStr}</span>
            </div>
            <p class="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">\${content || '暂无内容'}</p>
          </div>
        \`;
      }).join('');

      if (selectedNoteIndex >= 0 && selectedNoteIndex < notes.length) {
        displayNoteDetail(selectedNoteIndex);
      } else if (window.innerWidth >= 768 && notes.length > 0) {
        selectNote(0);
      }
    }

    function selectNote(idx) {
      const notes = currentSyncData?.notes || [];
      if (!notes[idx]) return;
      selectedNoteIndex = idx;
      isCreatingNote = false;

      notes.forEach((_, i) => {
        const el = document.getElementById('note-item-' + i);
        if (el) {
          if (i === idx) {
            el.className = 'p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer select-none bg-indigo-600/20 border-indigo-500/80 shadow-md shadow-indigo-500/10';
          } else {
            el.className = 'p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer select-none bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/20';
          }
        }
      });

      displayNoteDetail(idx);

      if (window.innerWidth < 768) {
        document.getElementById('notes-list-panel').classList.add('hidden');
        document.getElementById('notes-detail-panel').classList.remove('hidden');
      }
    }

    function displayNoteDetail(idx) {
      const notes = currentSyncData?.notes || [];
      const note = notes[idx];
      if (!note) return;

      const rightTitleEl = document.getElementById('right-note-title');
      rightTitleEl.innerText = note.title || '无标题笔记';
      rightTitleEl.title = note.title || '无标题笔记';
      document.getElementById('right-note-time').innerText = '最后修改于：' + (formatTime(note.updatedAt || note.createdAt) || '未知时间');
      
      const bodyEl = document.getElementById('right-note-body');
      const editorEl = document.getElementById('right-note-editor');
      bodyEl.classList.remove('hidden');
      editorEl.classList.add('hidden');

      document.getElementById('btn-edit-note').classList.remove('hidden');
      document.getElementById('btn-delete-note').classList.remove('hidden');

      const content = note.content || '';
      try {
        if (typeof marked !== 'undefined' && marked.parse) {
          // 显式传入 breaks: true 与 gfm: true，保证以前普通回车换行的笔记能够 100% 正常换行
          bodyEl.innerHTML = '<div class="markdown-body">' + marked.parse(content, { breaks: true, gfm: true }) + '</div>';
        } else {
          bodyEl.innerHTML = '<div class="markdown-body whitespace-pre-wrap leading-relaxed">' + escapeHtml(content) + '</div>';
        }
      } catch (e) {
        bodyEl.innerHTML = '<div class="markdown-body whitespace-pre-wrap leading-relaxed">' + escapeHtml(content) + '</div>';
      }
    }

    function startCreateNote() {
      isCreatingNote = true;
      selectedNoteIndex = -1;

      document.querySelectorAll('#notes-list-container > div').forEach(el => {
        el.className = 'p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer select-none bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/20';
      });

      document.getElementById('right-note-title').innerText = '新建笔记';
      document.getElementById('right-note-time').innerText = '正在编写新内容...';
      document.getElementById('btn-edit-note').classList.add('hidden');
      document.getElementById('btn-delete-note').classList.add('hidden');

      document.getElementById('right-note-body').classList.add('hidden');
      document.getElementById('right-note-editor').classList.remove('hidden');

      document.getElementById('editor-title').value = '';
      document.getElementById('editor-content').value = '';
      document.getElementById('editor-title').focus();

      if (window.innerWidth < 768) {
        document.getElementById('notes-list-panel').classList.add('hidden');
        document.getElementById('notes-detail-panel').classList.remove('hidden');
      }
    }

    function startEditNote() {
      const notes = currentSyncData?.notes || [];
      const note = notes[selectedNoteIndex];
      if (!note) return;

      isCreatingNote = false;
      document.getElementById('btn-edit-note').classList.add('hidden');
      document.getElementById('btn-delete-note').classList.add('hidden');

      document.getElementById('right-note-body').classList.add('hidden');
      document.getElementById('right-note-editor').classList.remove('hidden');

      document.getElementById('editor-title').value = note.title || '';
      document.getElementById('editor-content').value = note.content || '';
      document.getElementById('editor-content').focus();
    }

    function cancelEditNote() {
      if (isCreatingNote) {
        resetRightNotePanel();
        if (currentSyncData?.notes?.length > 0) selectNote(0);
      } else if (selectedNoteIndex >= 0) {
        displayNoteDetail(selectedNoteIndex);
      }
    }

    function saveNote() {
      const title = document.getElementById('editor-title').value.trim() || '无标题笔记';
      const content = document.getElementById('editor-content').value;
      const now = Date.now();

      if (!Array.isArray(currentSyncData.notes)) currentSyncData.notes = [];

      if (isCreatingNote) {
        const newNote = {
          id: 'note-' + now,
          title: title,
          content: content,
          createdAt: now,
          updatedAt: now
        };
        currentSyncData.notes.unshift(newNote);
        selectedNoteIndex = 0;
        isCreatingNote = false;
      } else if (selectedNoteIndex >= 0 && currentSyncData.notes[selectedNoteIndex]) {
        currentSyncData.notes[selectedNoteIndex].title = title;
        currentSyncData.notes[selectedNoteIndex].content = content;
        currentSyncData.notes[selectedNoteIndex].updatedAt = now;
      }

      renderNotesList(currentSyncData.notes);
      displayNoteDetail(selectedNoteIndex);
      saveToCloud();
    }

    function deleteCurrentNote() {
      if (selectedNoteIndex < 0 || !currentSyncData?.notes?.[selectedNoteIndex]) return;
      const noteTitle = currentSyncData.notes[selectedNoteIndex].title || '此笔记';
      if (!confirm('确定要删除 "' + noteTitle + '" 吗？')) return;

      currentSyncData.notes.splice(selectedNoteIndex, 1);
      selectedNoteIndex = -1;

      renderNotesList(currentSyncData.notes);
      resetRightNotePanel();
      saveToCloud();

      if (window.innerWidth < 768) mobileBackToList();
    }

    function resetRightNotePanel() {
      document.getElementById('right-note-title').innerText = '请选择笔记';
      document.getElementById('right-note-time').innerText = '';
      document.getElementById('btn-edit-note').classList.add('hidden');
      document.getElementById('btn-delete-note').classList.add('hidden');
      document.getElementById('right-note-editor').classList.add('hidden');
      document.getElementById('right-note-body').classList.remove('hidden');
      document.getElementById('right-note-body').innerHTML = 
        '<div class="h-full flex flex-col items-center justify-center text-slate-400 text-xs sm:text-sm gap-2">' +
        '<svg class="w-7 h-7 sm:w-8 sm:h-8 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">' +
        '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />' +
        '</svg><span>👈 点击左侧任意笔记查看或点击“新建笔记”</span></div>';
    }

    function mobileBackToList() {
      document.getElementById('notes-list-panel').classList.remove('hidden');
      document.getElementById('notes-detail-panel').classList.add('hidden');
    }

    // Bing 每日壁纸
    async function loadBingWallpaper() {
      try {
        const res = await fetch('/api/bing');
        if (res.ok) {
          const { url } = await res.json();
          if (url) document.body.style.backgroundImage = 'url(\"' + url + '\")';
        }
      } catch (e) {
        console.warn('壁纸加载失败，使用默认底色');
      }
    }

    function showLoginView() {
      document.getElementById('login-section').classList.remove('hidden');
      document.getElementById('dashboard-section').classList.add('hidden');
      document.getElementById('logout-btn').classList.add('hidden');
      document.getElementById('user-email-text').innerText = '';
      document.getElementById('sync-status').classList.add('hidden');
    }

    function showDashboardView(email) {
      document.getElementById('login-section').classList.add('hidden');
      document.getElementById('dashboard-section').classList.remove('hidden');
      document.getElementById('logout-btn').classList.remove('hidden');
      document.getElementById('user-email-text').innerText = email || '';
      document.getElementById('sync-status').classList.remove('hidden');
      switchTab('shortcuts'); // 默认展示“桌面”
    }

    function logout() {
      const token = localStorage.getItem('itabs_token');
      if (token) {
        fetch('/api/auth/logout', {
          headers: { 'Authorization': 'Bearer ' + token }
        }).catch(() => {});
      }
      localStorage.removeItem('itabs_token');
      localStorage.removeItem('itabs_email');
      showLoginView();
    }

    init();
  </script>
</body>
</html>`;
}