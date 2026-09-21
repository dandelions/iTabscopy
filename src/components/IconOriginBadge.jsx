import { Globe, HardDrive } from 'lucide-react';
import { isOfflineIcon, getIconOriginLabel } from '../utils/icons';

const IconOriginBadge = ({ shortcut, iconSize = 50, className = '' }) => {
    if (!shortcut || shortcut.type === 'folder') return null;

    const isOffline = isOfflineIcon(shortcut);
    const label = getIconOriginLabel(shortcut);

    // 动态根据主图标尺寸计算徽标大小，在 40px~100px 图标下都能保持优雅比例
    const badgeSize = Math.max(14, Math.min(20, Math.round(iconSize * 0.32)));
    const iconDimension = Math.max(8, Math.min(12, Math.round(badgeSize * 0.6)));
    const offset = Math.max(1, Math.round(badgeSize * 0.12));

    return (
        <span
            className={`absolute flex items-center justify-center rounded-full border border-white/80 shadow-md backdrop-blur-xs transition-transform duration-200 select-none z-10 ${
                isOffline
                    ? 'bg-emerald-500 text-white shadow-emerald-900/40 hover:bg-emerald-400'
                    : 'bg-sky-500 text-white shadow-sky-900/40 hover:bg-sky-400'
            } ${className}`}
            style={{
                width: `${badgeSize}px`,
                height: `${badgeSize}px`,
                right: `-${offset}px`,
                bottom: `-${offset}px`,
            }}
            title={label}
            aria-label={label}
        >
            {isOffline ? (
                <HardDrive
                    style={{ width: `${iconDimension}px`, height: `${iconDimension}px` }}
                    strokeWidth={2.5}
                />
            ) : (
                <Globe
                    style={{ width: `${iconDimension}px`, height: `${iconDimension}px` }}
                    strokeWidth={2.5}
                />
            )}
        </span>
    );
};

export default IconOriginBadge;
