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
            // 2. 路由分发
            if (path === '/api/auth/register') return await handleRegister(request, env, corsHeaders);
            if (path === '/api/auth/login') return await handleLogin(request, env, corsHeaders);
            if (path === '/api/auth/logout') return await handleLogout(request, env, corsHeaders);
            if (path === '/api/sync/pull') return await handlePull(request, env, corsHeaders);
            if (path === '/api/sync/push') return await handlePush(request, env, corsHeaders);
            if (path === '/api/webdav/request') return await handleWebDavRequest(request, env, corsHeaders);

            // ✨ 新增：Bing 每日壁纸获取接口（公开接口，无需 Bearer Token 校验）
            if (path === '/api/bing') return await handleBingWallpaper(corsHeaders);

            return jsonResponse({ error: 'Not Found' }, 404, corsHeaders);
        } catch (error) {
            // 3. 关键修正：确保 catch 块也返回状态码并包含 corsHeaders
            console.error('Worker Error:', error.message);
            const status = error.status || 500;
            return jsonResponse({
                error: error.message,
                stack: error.stack // 调试用，稳定后可删除
            }, status, corsHeaders);
        }
    },
};

// ---------------- 核心逻辑函数 ----------------

async function verifyToken(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        const err = new Error('未授权：缺少 Token');
        err.status = 401;
        throw err;
    }

    const token = authHeader.substring(7);
    // 【重要】：请确认你的 KV 命名确实是 NewTab_KV
    const email = await env.NewTab_KV.get(`token:${token}`);

    if (!email) {
        const err = new Error('登录已过期或无效');
        err.status = 401;
        throw err;
    }
    return email;
}

// 辅助：统一 JSON 返回
function jsonResponse(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    });
}

// 辅助：Hash 密码
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------- 处理函数 ----------------

// ✨ 新增：处理 Bing 壁纸请求
async function handleBingWallpaper(corsHeaders) {
    // 请求 Bing 官方接口（idx=0 表示当天，n=1 表示获取 1 张）
    const bingApiUrl = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN';

    const response = await fetch(bingApiUrl);
    if (!response.ok) {
        throw new Error('无法访问 Bing 接口');
    }

    const data = await response.json();

    if (data && data.images && data.images.length > 0) {
        // 拼接超清主图的绝对路径 (1920x1080)
        const imgUrl = 'https://cn.bing.com' + data.images[0].url;
        const copyright = data.images[0].copyright; // 版权/故事信息，也可以顺便传给前端

        return jsonResponse({ url: imgUrl, copyright }, 200, corsHeaders);
    } else {
        throw new Error('解析 Bing 返回数据失败');
    }
}

async function handleRegister(request, env, corsHeaders) {
    const { email, password } = await request.json();
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
    const syncData = { ...data, updatedAt: data.updatedAt || Date.now() };
    await env.NewTab_KV.put(`sync:${email}`, JSON.stringify(syncData));
    return jsonResponse({ success: true, updatedAt: syncData.updatedAt }, 200, corsHeaders);
}

async function handleWebDavRequest(request, env, corsHeaders) {
    await verifyToken(request, env);

    const { method, url, username, password, contentType, body } = await request.json();
    const normalizedMethod = String(method || '').toUpperCase();
    if (!['PUT', 'DELETE'].includes(normalizedMethod)) {
        return jsonResponse({ error: '不支持的 WebDAV 请求方法' }, 400, corsHeaders);
    }

    let targetUrl;
    try {
        targetUrl = new URL(url);
    } catch {
        return jsonResponse({ error: '无效的 WebDAV 地址' }, 400, corsHeaders);
    }

    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        return jsonResponse({ error: 'WebDAV 地址仅支持 HTTP 或 HTTPS' }, 400, corsHeaders);
    }

    const headers = {};
    if (contentType) headers['Content-Type'] = contentType;
    if (username || password) {
        headers.Authorization = `Basic ${btoa(unescape(encodeURIComponent(`${username || ''}:${password || ''}`)))}`;
    }

    let response;
    try {
        response = await fetch(targetUrl.toString(), {
            method: normalizedMethod,
            headers,
            body: normalizedMethod === 'DELETE' ? undefined : body,
        });
    } catch (error) {
        return jsonResponse({
            error: `WebDAV 代理无法访问目标地址：${error.message}`,
            status: 502,
        }, 502, corsHeaders);
    }

    if (response.ok) {
        return jsonResponse({ success: true, status: response.status }, 200, corsHeaders);
    }

    const errorText = await response.text();
    return jsonResponse({
        error: errorText || `WebDAV 请求失败：HTTP ${response.status}`,
        status: response.status,
    }, response.status, corsHeaders);
}
