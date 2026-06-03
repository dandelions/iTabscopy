// Sync service for communicating with Cloudflare Worker
class SyncService {
    constructor() {
        this.token = localStorage.getItem('sync_token');
        this.email = localStorage.getItem('sync_email');
    }

    // Check if online
    isOnline() {
        return navigator.onLine;
    }

    // Get worker URL from localStorage
    getWorkerUrl() {
        return localStorage.getItem('sync_worker_url') || '';
    }

    // Set custom worker URL
    setWorkerUrl(url) {
        if (!url) {
            localStorage.removeItem('sync_worker_url');
        } else {
            localStorage.setItem('sync_worker_url', url);
        }
    }

    getWebDavConfig() {
        const saved = localStorage.getItem('webdav_config');
        if (!saved) {
            return {
                url: '',
                username: '',
                password: '',
                fileName: 'itabs-backup.json',
                autoSync: false,
            };
        }

        try {
            return {
                url: '',
                username: '',
                password: '',
                fileName: 'itabs-backup.json',
                autoSync: false,
                ...JSON.parse(saved),
            };
        } catch {
            localStorage.removeItem('webdav_config');
            return {
                url: '',
                username: '',
                password: '',
                fileName: 'itabs-backup.json',
                autoSync: false,
            };
        }
    }

    setWebDavConfig(config) {
        const nextConfig = {
            url: (config.url || '').trim(),
            username: (config.username || '').trim(),
            password: config.password || '',
            fileName: (config.fileName || 'itabs-backup.json').trim(),
            autoSync: !!config.autoSync,
        };

        if (!nextConfig.url && !nextConfig.username && !nextConfig.password) {
            localStorage.removeItem('webdav_config');
        } else {
            localStorage.setItem('webdav_config', JSON.stringify(nextConfig));
        }

        return nextConfig;
    }

    isWebDavConfigured() {
        const config = this.getWebDavConfig();
        return !!config.url;
    }

    shouldAutoSyncWebDav() {
        const config = this.getWebDavConfig();
        return !!config.url && !!config.autoSync;
    }

    createBackupData(data) {
        return {
            version: '1.0',
            exportDate: new Date().toISOString(),
            updatedAt: Date.now(),
            todos: data.todos || [],
            notes: data.notes || [],
            shortcuts: data.shortcuts || [],
            gridConfig: data.gridConfig || {},
            bgConfig: data.bgConfig || {},
            bgUrl: data.bgUrl || '',
        };
    }

    requireWebDavConfig() {
        const config = this.getWebDavConfig();
        if (!config.url) {
            throw new Error('请先配置 WebDAV 地址');
        }
        return config;
    }

    getWebDavTargetUrl(config, overrideFileName) {
        const fileName = (overrideFileName || config.fileName || 'itabs-backup.json').trim();
        if (!fileName || fileName.includes('/')) {
            throw new Error('WebDAV 备份文件名不能包含路径分隔符');
        }

        const baseUrl = config.url.trim();
        const separator = baseUrl.endsWith('/') ? '' : '/';
        return `${baseUrl}${separator}${encodeURIComponent(fileName)}`;
    }

    getWebDavHeaders(config, contentType = 'application/json') {
        const headers = {
            'Content-Type': contentType,
        };

        if (config.username || config.password) {
            const credentials = `${config.username || ''}:${config.password || ''}`;
            headers.Authorization = `Basic ${btoa(unescape(encodeURIComponent(credentials)))}`;
        }

        return headers;
    }

    shouldProxyWebDav(config) {
        try {
            const targetUrl = new URL(config.url);
            return targetUrl.protocol === 'http:' && !!this.getWorkerUrl();
        } catch {
            return false;
        }
    }

    async fetchWebDav(targetUrl, config, options) {
        if (!this.shouldProxyWebDav(config)) {
            if (targetUrl.startsWith('http://') && window.location.protocol === 'https:') {
                throw new Error('HTTPS 页面访问 HTTP WebDAV 需要配置 Cloudflare Worker 代理');
            }

            return fetch(targetUrl, {
                method: options.method,
                headers: this.getWebDavHeaders(config, options.contentType),
                body: options.body,
            });
        }

        if (!this.token) {
            throw new Error('HTTP WebDAV 代理需要先登录云同步');
        }

        const workerUrl = this.requireWorkerUrl();
        return fetch(`${workerUrl}/api/webdav/request`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                method: options.method,
                url: targetUrl,
                username: config.username,
                password: config.password,
                contentType: options.contentType,
                body: options.body,
            }),
        });
    }

    async testWebDavConnection() {
        const config = this.requireWebDavConfig();
        if (!this.isOnline()) {
            throw new Error('当前离线，无法连接 WebDAV');
        }

        const testFileName = `.itabs-webdav-test-${Date.now()}.txt`;
        const targetUrl = this.getWebDavTargetUrl(config, testFileName);
        const response = await this.fetchWebDav(targetUrl, config, {
            method: 'PUT',
            contentType: 'text/plain',
            body: 'iTabs WebDAV test',
        });

        if (!response.ok) {
            throw new Error(`WebDAV 测试失败：HTTP ${response.status}`);
        }

        try {
            await this.fetchWebDav(targetUrl, config, {
                method: 'DELETE',
                contentType: 'text/plain',
            });
        } catch (error) {
            console.warn('Failed to remove WebDAV test file:', error);
        }

        return { success: true };
    }

    async uploadBackupToWebDav(data) {
        const config = this.requireWebDavConfig();
        if (!this.isOnline()) {
            throw new Error('当前离线，无法同步到 WebDAV');
        }

        const backupData = data?.version ? data : this.createBackupData(data || {});
        const targetUrl = this.getWebDavTargetUrl(config);
        const response = await this.fetchWebDav(targetUrl, config, {
            method: 'PUT',
            contentType: 'application/json',
            body: JSON.stringify(backupData, null, 2),
        });

        if (!response.ok) {
            throw new Error(`WebDAV 同步失败：HTTP ${response.status}`);
        }

        const syncedAt = Date.now();
        localStorage.setItem('last_webdav_sync', String(syncedAt));
        return { success: true, syncedAt, fileName: config.fileName };
    }

    // Ensure worker URL exists before network calls
    requireWorkerUrl() {
        const url = this.getWorkerUrl();
        if (!url) {
            throw new Error('请在同步设置中配置 Worker 地址');
        }
        return url;
    }

    // Register new user
    async register(email, password) {
        const workerUrl = this.requireWorkerUrl();
        const response = await fetch(`${workerUrl}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Registration failed');
        }

        const data = await response.json();
        this.saveAuth(data.token, data.email);
        return data;
    }

    // Login user
    async login(email, password) {
        const workerUrl = this.requireWorkerUrl();
        const response = await fetch(`${workerUrl}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Login failed');
        }

        const data = await response.json();
        this.saveAuth(data.token, data.email);
        return data;
    }

    // Logout user
    async logout() {
        // Call server to delete token
        if (this.token) {
            try {
                const workerUrl = this.getWorkerUrl();
                if (workerUrl) {
                    await fetch(`${workerUrl}/api/auth/logout`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                }
            } catch (error) {
                console.warn('Failed to delete token from server:', error);
                // Continue with local cleanup even if server request fails
            }
        }

        // Clear local data
        this.token = null;
        this.email = null;
        localStorage.removeItem('sync_token');
        localStorage.removeItem('sync_email');
        localStorage.removeItem('last_sync');
    }

    // Pull data from server
    async pullData() {
        if (!this.token) {
            throw new Error('Not logged in');
        }

        if (!this.isOnline()) {
            console.log('Offline: skipping pull request');
            return null;
        }

        const workerUrl = this.requireWorkerUrl();
        const response = await fetch(`${workerUrl}/api/sync/pull`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.token}`,
            },
        });

        if (!response.ok) {
            if (response.status === 401) {
                this.logout();
                throw new Error('Session expired. Please login again.');
            }
            const error = await response.json();
            throw new Error(error.error || 'Pull failed');
        }

        const result = await response.json();

        if (result.data) {
            localStorage.setItem('last_sync', String(Date.now()));
        }

        return result.data;
    }

    // Push data to server
    async pushData(data) {
        if (!this.token) {
            throw new Error('Not logged in');
        }

        if (!this.isOnline()) {
            console.log('Offline: skipping push request');
            return null;
        }

        const syncData = {
            ...data,
            updatedAt: Date.now()
        };

        const workerUrl = this.requireWorkerUrl();
        const response = await fetch(`${workerUrl}/api/sync/push`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(syncData),
        });

        if (!response.ok) {
            if (response.status === 401) {
                this.logout();
                throw new Error('Session expired. Please login again.');
            }
            const error = await response.json();
            throw new Error(error.error || 'Push failed');
        }

        const result = await response.json();
        localStorage.setItem('last_sync', String(Date.now()));
        return result;
    }

    // Check if user is logged in
    isLoggedIn() {
        return !!this.token && !!this.email;
    }

    // Get current user email
    getEmail() {
        return this.email;
    }

    // Get last sync time
    getLastSync() {
        const raw = localStorage.getItem('last_sync');
        if (raw === null) return null;
        const numeric = Number(raw);
        if (Number.isFinite(numeric)) {
            return numeric;
        }
        const parsed = Date.parse(raw);
        if (Number.isFinite(parsed)) {
            localStorage.setItem('last_sync', String(parsed));
            return parsed;
        }
        localStorage.removeItem('last_sync');
        return null;
    }

    // Save auth data
    saveAuth(token, email) {
        this.token = token;
        this.email = email;
        localStorage.setItem('sync_token', token);
        localStorage.setItem('sync_email', email);
    }
}

// Export singleton instance
export default new SyncService();
