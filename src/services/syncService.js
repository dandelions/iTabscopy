// Sync service for communicating with Cloudflare Worker
const LAST_CLOUD_UPDATE_KEY = 'last_cloud_update';
const LAST_LOCAL_UPDATE_KEY = 'last_local_update';
const LAST_SYNCED_SNAPSHOT_KEY = 'last_synced_snapshot';
const NETWORK_ERROR_MESSAGE = '无法连接同步服务器，请检查 Worker 地址或网络状态';

const normalizeWorkerUrl = (url = '') => {
    const trimmed = String(url).trim();
    if (!trimmed) return '';
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return withProtocol.replace(/\/+$/, '');
};

const createNetworkError = (error, workerUrl) => {
    const networkError = new Error(`${NETWORK_ERROR_MESSAGE}：${workerUrl}`);
    networkError.cause = error;
    networkError.isNetworkError = true;
    return networkError;
};

const readResponseError = async (response, fallback) => {
    try {
        const error = await response.json();
        return error.error || fallback;
    } catch {
        return fallback;
    }
};

const normalizeSyncData = (data = {}) => {
    const source = data && typeof data === 'object' ? data : {};
    return {
        shortcuts: Array.isArray(source.shortcuts) ? source.shortcuts : [],
        gridConfig: source.gridConfig && typeof source.gridConfig === 'object' ? source.gridConfig : {},
        bgConfig: source.bgConfig && typeof source.bgConfig === 'object' ? source.bgConfig : {},
        bgUrl: typeof source.bgUrl === 'string' ? source.bgUrl : '',
        todos: Array.isArray(source.todos) ? source.todos : [],
        notes: Array.isArray(source.notes) ? source.notes : [],
    };
};

const createSyncSnapshot = (data) => JSON.stringify(normalizeSyncData(data));

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
        return normalizeWorkerUrl(localStorage.getItem('sync_worker_url') || '');
    }

    // Set custom worker URL
    setWorkerUrl(url) {
        if (!url) {
            localStorage.removeItem('sync_worker_url');
        } else {
            localStorage.setItem('sync_worker_url', normalizeWorkerUrl(url));
        }
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

    // Ensure worker URL exists before network calls
    requireWorkerUrl() {
        const url = this.getWorkerUrl();
        if (!url) {
            throw new Error('请在同步设置中配置 Worker 地址');
        }
        localStorage.setItem('sync_worker_url', url);
        return url;
    }

    async requestWorker(path, options = {}) {
        const workerUrl = this.requireWorkerUrl();
        try {
            return await fetch(`${workerUrl}${path}`, options);
        } catch (error) {
            throw createNetworkError(error, workerUrl);
        }
    }

    // Register new user
    async register(email, password) {
        const response = await this.requestWorker('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            throw new Error(await readResponseError(response, 'Registration failed'));
        }

        const data = await response.json();
        this.saveAuth(data.token, data.email);
        return data;
    }

    // Login user
    async login(email, password) {
        const response = await this.requestWorker('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            throw new Error(await readResponseError(response, 'Login failed'));
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
                    await this.requestWorker('/api/auth/logout', {
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

        const response = await this.requestWorker('/api/sync/pull', {
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
            throw new Error(await readResponseError(response, 'Pull failed'));
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

        const response = await this.requestWorker('/api/sync/push', {
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
            throw new Error(await readResponseError(response, 'Push failed'));
        }

        const result = await response.json();
        const updatedAt = Number(result.updatedAt || syncData.updatedAt);
        if (Number.isFinite(updatedAt)) {
            localStorage.setItem(LAST_CLOUD_UPDATE_KEY, String(updatedAt));
            localStorage.setItem(LAST_LOCAL_UPDATE_KEY, String(updatedAt));
        }
        localStorage.setItem(LAST_SYNCED_SNAPSHOT_KEY, createSyncSnapshot(syncData));
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
