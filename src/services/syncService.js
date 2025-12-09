// Sync service for communicating with Cloudflare Worker
const DEFAULT_WORKER_URL = 'https://newtab.tenom.workers.dev';

class SyncService {
    constructor() {
        this.token = localStorage.getItem('sync_token');
        this.email = localStorage.getItem('sync_email');
    }

    // Check if online
    isOnline() {
        return navigator.onLine;
    }

    // Get worker URL from localStorage or use default
    getWorkerUrl() {
        return localStorage.getItem('sync_worker_url') || DEFAULT_WORKER_URL;
    }

    // Set custom worker URL
    setWorkerUrl(url) {
        if (!url) {
            localStorage.removeItem('sync_worker_url');
        } else {
            localStorage.setItem('sync_worker_url', url);
        }
    }

    // Register new user
    async register(email, password) {
        const response = await fetch(`${this.getWorkerUrl()}/api/auth/register`, {
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
        const response = await fetch(`${this.getWorkerUrl()}/api/auth/login`, {
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
                await fetch(`${this.getWorkerUrl()}/api/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    }
                });
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

        const response = await fetch(`${this.getWorkerUrl()}/api/sync/pull`, {
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
            localStorage.setItem('last_sync', new Date().toISOString());
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

        const response = await fetch(`${this.getWorkerUrl()}/api/sync/push`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
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
        localStorage.setItem('last_sync', new Date().toISOString());
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
        return localStorage.getItem('last_sync');
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
