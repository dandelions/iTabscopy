// Get the best icon URL for a website (Clearbit as primary)
export const getIconUrl = (url) => {
    try {
        const domain = new URL(url).hostname;
        return `https://logo.clearbit.com/${domain}`;
    } catch (e) {
        return null;
    }
};

// Get all available icon URLs for fallback
export const getAllIconUrls = (url) => {
    try {
        const domain = new URL(url).hostname;
        return [
            { source: 'clearbit', url: `https://logo.clearbit.com/${domain}`, name: 'Clearbit' },
            { source: 'google', url: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`, name: 'Google' }
        ];
    } catch (e) {
        return [];
    }
};

// Get icon sources object for fallback handling
export const getIconSources = (url) => {
    try {
        const domain = new URL(url).hostname;
        return {
            clearbit: `https://logo.clearbit.com/${domain}`,
            google: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
        };
    } catch (e) {
        return null;
    }
};

// Remove icon from cache
export const removeIconFromCache = async (shortcut) => {
    if (!shortcut) return;
    
    try {
        const cache = await caches.open('icon-cache');
        
        // 1. If it has a specific custom icon URL
        if (shortcut.customIcon?.url) {
            await cache.delete(shortcut.customIcon.url);
        }
        
        // 2. Also try to clean up potential auto-detected URLs
        if (shortcut.url) {
            const candidates = getAllIconUrls(shortcut.url);
            for (const candidate of candidates) {
                await cache.delete(candidate.url);
            }
        }
    } catch (e) {
        console.warn('Failed to remove icon from cache:', e);
    }
};

/**
 * 判断快捷方式图标是否为本地离线图标
 * 
 * 本地离线图标定义：
 * 1. 首字母图标（本地即时计算生成，无需网络）
 * 2. 用户本地上传的自定义图标（source 为 'custom'/'local'/'upload'，或无 source 标记的 custom 类型）
 * 
 * 在线获取图标定义：
 * 1. 来源为网络抓取（如 clearbit / google / favicon 等）
 * 2. 带有在线 URL 的图标
 * 3. 尚未配置 customIcon、依赖网站 URL 在线获取的快捷方式
 */
export const isOfflineIcon = (shortcut) => {
    if (!shortcut || shortcut.type === 'folder') return false;
    const customIcon = shortcut.customIcon;

    // 没有设置 customIcon，默认会通过网络 URL 在线获取
    if (!customIcon) {
        return false;
    }

    // 首字母图标，纯本地生成，属于本地离线图标
    if (customIcon.type === 'letter') {
        return true;
    }

    // 自定义上传图标：source 为 'custom' / 'local' / 'upload'，或没有 source 字段的 custom 类型（本地上传图片）
    if (customIcon.type === 'custom') {
        if (!customIcon.source || ['custom', 'local', 'upload'].includes(customIcon.source)) {
            return true;
        }
    }

    return false;
};

/**
 * 获取快捷方式图标的来源类型：'offline' | 'online' | null
 */
export const getIconOriginType = (shortcut) => {
    if (!shortcut || shortcut.type === 'folder') return null;
    return isOfflineIcon(shortcut) ? 'offline' : 'online';
};

/**
 * 获取图标来源展示文本（用于 title 提示）
 */
export const getIconOriginLabel = (shortcut) => {
    if (!shortcut || shortcut.type === 'folder') return '';
    const isOffline = isOfflineIcon(shortcut);
    if (isOffline) {
        if (shortcut.customIcon?.type === 'letter') {
            return '本地离线图标 (首字母)';
        }
        return '本地离线图标 (自定义上传)';
    }

    const source = shortcut.customIcon?.source;
    if (source) {
        const sourceMap = {
            clearbit: 'Clearbit',
            google: 'Google',
            favicon: '网站 Favicon'
        };
        return `在线获取图标 (${sourceMap[source] || source})`;
    }
    return '在线获取图标';
};
