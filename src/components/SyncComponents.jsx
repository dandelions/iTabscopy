// Login Form Component
const LoginForm = ({ onLogin, showToast }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            if (isRegistering) {
                await syncService.register(email, password);
                showToast('Account created successfully!', 'success');
            } else {
                await syncService.login(email, password);
            }
            onLogin(email);
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <h3 className="text-sm font-medium text-white mb-4">
                {isRegistering ? 'Create Account' : 'Login to Sync'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <label className="text-xs text-white/60">Email</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="w-full bg-black/10 border border-white/10 rounded-lg py-2.5 px-4 text-white text-sm focus:outline-none focus:border-white/30 transition-colors placeholder-white/30"
                        required
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-xs text-white/60">Password</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-black/10 border border-white/10 rounded-lg py-2.5 px-4 text-white text-sm focus:outline-none focus:border-white/30 transition-colors placeholder-white/30"
                        required
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white rounded-lg transition-colors shadow-lg disabled:opacity-50"
                >
                    {isLoading ? 'Please wait...' : (isRegistering ? 'Create Account' : 'Login')}
                </button>

                <button
                    type="button"
                    onClick={() => setIsRegistering(!isRegistering)}
                    className="w-full text-xs text-white/60 hover:text-white transition-colors"
                >
                    {isRegistering ? 'Already have an account? Login' : "Don't have an account? Register"}
                </button>
            </form>

            <div className="mt-6 p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-xs text-white/60 leading-relaxed">
                    Sync your shortcuts, settings, and background across all your devices. Your data is securely stored and only accessible with your account.
                </p>
            </div>
        </div>
    );
};

// Sync Panel Component
const SyncPanel = ({ email, isSyncing, onSync, onLogout, lastSync }) => {
    const formatLastSync = (timestamp) => {
        if (!timestamp) return 'Never';
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    return (
        <div>
            <h3 className="text-sm font-medium text-white mb-4">Sync Settings</h3>

            <div className="space-y-4">
                {/* User Info */}
                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-white/60">Logged in as</span>
                        <button
                            onClick={onLogout}
                            className="flex items-center gap-1 text-xs text-white/60 hover:text-red-400 transition-colors"
                        >
                            <LogOut className="h-3 w-3" />
                            Logout
                        </button>
                    </div>
                    <div className="text-sm text-white font-medium">{email}</div>
                </div>

                {/* Last Sync */}
                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="text-xs text-white/60 mb-1">Last Sync</div>
                    <div className="text-sm text-white">{formatLastSync(lastSync)}</div>
                </div>

                {/* Sync Button */}
                <button
                    onClick={onSync}
                    disabled={isSyncing}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white rounded-lg transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {isSyncing ? (
                        <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            Syncing...
                        </>
                    ) : (
                        <>
                            <Cloud className="h-4 w-4" />
                            Sync Now
                        </>
                    )}
                </button>

                {/* Info */}
                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                    <p className="text-xs text-white/60 leading-relaxed">
                        Clicking "Sync Now" will upload your current shortcuts, settings, and background to the cloud. Your data will be automatically synced when you make changes.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Settings;
