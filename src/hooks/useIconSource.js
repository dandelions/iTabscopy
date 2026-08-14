import { useState, useEffect, useRef } from 'react';
import { getAllIconUrls } from '../utils/icons';
import { fetchIconAsDataUrl } from '../utils/iconToDataUrl';

const createLetterIcon = (shortcut) => ({
    type: 'letter',
    letter: (shortcut.title?.[0] || 'A').toUpperCase(),
});

// 首次成功获取在线图标后，通过 onIconEmbedded 回写为本地 base64 数据。
export const useIconSource = (shortcut, onIconEmbedded) => {
    const [iconSrc, setIconSrc] = useState(null);
    const onIconEmbeddedRef = useRef(onIconEmbedded);

    useEffect(() => {
        onIconEmbeddedRef.current = onIconEmbedded;
    }, [onIconEmbedded]);

    useEffect(() => {
        let isMounted = true;

        const persistIcon = (icon) => {
            if (isMounted) onIconEmbeddedRef.current?.(icon);
        };

        const load = async () => {
            if (shortcut.customIcon?.type === 'custom') {
                if (isMounted) setIconSrc(shortcut.customIcon.data);
                return;
            }

            if (shortcut.customIcon?.type === 'letter') {
                if (isMounted) setIconSrc(false);
                return;
            }

            const candidates = shortcut.customIcon?.url
                ? [{ source: shortcut.customIcon.source, url: shortcut.customIcon.url }]
                : getAllIconUrls(shortcut.url);

            for (const candidate of candidates) {
                try {
                    const dataUrl = await fetchIconAsDataUrl(candidate.url);
                    if (!isMounted) return;

                    setIconSrc(dataUrl);
                    persistIcon({ type: 'custom', data: dataUrl, source: candidate.source });
                    return;
                } catch {
                    // 继续尝试下一个在线图标来源。
                }
            }

            if (isMounted) {
                setIconSrc(false);
                // 失败结果也落盘，防止之后每次打开 iTabs 都重新联网探测。
                persistIcon(createLetterIcon(shortcut));
            }
        };

        setIconSrc(null);
        load();

        return () => {
            isMounted = false;
        };
    }, [shortcut]);

    return iconSrc;
};
