import { useState, useEffect } from 'react';
import { getTimeAdjustedOverlay } from '../utils/background';

const Layout = ({ children, backgroundUrl, bgConfig }) => {
    const { blur = 2, overlay = 30 } = bgConfig || {};
    const [imageLoaded, setImageLoaded] = useState(false);
    const [currentBg, setCurrentBg] = useState(backgroundUrl);
    const [currentTime, setCurrentTime] = useState(() => new Date());
    const effectiveOverlay = getTimeAdjustedOverlay(overlay, currentTime);

    useEffect(() => {
        const updateTime = () => setCurrentTime(new Date());
        const interval = window.setInterval(updateTime, 60 * 1000);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') updateTime();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    // Preload background image
    useEffect(() => {
        if (!backgroundUrl) return;

        let cancelled = false;
        const img = new Image();
        img.onload = () => {
            if (cancelled) return;
            setCurrentBg(backgroundUrl);
            setImageLoaded(true);
        };
        img.onerror = () => {
            if (cancelled) return;
            setImageLoaded(true); // Keep the previous valid background visible.
        };
        img.src = backgroundUrl;

        return () => {
            cancelled = true;
            img.onload = null;
            img.onerror = null;
        };
    }, [backgroundUrl]);

    const displayedBg = backgroundUrl ? currentBg : '';
    const isBackgroundVisible = !backgroundUrl || imageLoaded;

    return (
        <div
            className="relative min-h-screen w-full overflow-hidden bg-gray-900 text-white"
            style={{ overscrollBehaviorX: 'none' }}
        >
            {/* Background Image */}
            <div
                className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-700 ease-in-out"
                style={{
                    backgroundImage: displayedBg ? `url(${displayedBg})` : 'none',
                    backgroundColor: !displayedBg ? '#111827' : 'transparent',
                    opacity: isBackgroundVisible ? 1 : 0,
                    // 模糊直接作用在壁纸图层上：只需栅格化一次。
                    // 之前用全屏 backdrop-filter，合成器每帧都要重新过滤下层内容，
                    // 在无 GPU 加速的设备上重新创建图层（例如切换深浅色重建界面）
                    // 会卡住数秒。放大一点是为了盖住模糊产生的透明边缘。
                    filter: displayedBg && blur > 0 ? `blur(${blur}px)` : 'none',
                    transform: displayedBg && blur > 0 ? 'scale(1.06)' : 'none'
                }}
            >
                <div
                    className="absolute inset-0 transition-all duration-300"
                    style={{
                        backgroundColor: `rgba(0, 0, 0, ${effectiveOverlay / 100})`
                    }}
                />
            </div>

            {/* Content */}
            <div className="relative z-10 flex min-h-screen flex-col items-center justify-start pt-16 p-8">
                {children}
            </div>
        </div>
    );
};

export default Layout;
