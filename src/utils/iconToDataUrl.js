const MAX_ICON_DIMENSION = 128;
const MAX_ICON_BYTES = 120 * 1024;

const loadImage = (blob) => new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
    };
    image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to decode icon image'));
    };
    image.src = objectUrl;
});

// 将网络图标下载、缩放后转换为 base64 data URL，供本地保存和跨设备同步。
export const fetchIconAsDataUrl = async (url) => {
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) {
        throw new Error(`Failed to fetch icon: ${response.status}`);
    }

    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) {
        throw new Error('Icon response is not an image');
    }

    const image = await loadImage(blob);
    const scale = Math.min(1, MAX_ICON_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas not supported');
    }
    context.drawImage(image, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length > MAX_ICON_BYTES * 1.34) {
        throw new Error('Embedded icon exceeds size limit');
    }
    return dataUrl;
};

// 便捷方法：将 URL 图标转为 base64；失败时改为首字母，避免把图标链接同步到远程。
export const tryEmbedIcon = async (icon, fallbackLetter = 'A') => {
    if (!icon || icon.type === 'custom' || icon.type === 'letter') return icon;

    if (icon.url) {
        try {
            const dataUrl = await fetchIconAsDataUrl(icon.url);
            return { type: 'custom', data: dataUrl, source: icon.source };
        } catch (error) {
            console.warn('Failed to embed icon, using a letter icon instead:', error);
        }
    }

    return { type: 'letter', letter: (fallbackLetter || 'A')[0].toUpperCase() };
};
