import { useIconSource } from '../hooks/useIconSource';
import { useCallback, useEffect, useRef } from 'react';

const MiniIcon = ({ item, onIconEmbedded }) => {
    const handleIconEmbedded = useCallback((icon) => {
        onIconEmbedded?.(item.id, icon);
    }, [item.id, onIconEmbedded]);
    const iconSrc = useIconSource(item, handleIconEmbedded);

    return (
        // pointer-events-none 确保点击能穿透到外层文件夹
        <div className="aspect-square rounded-md overflow-hidden liquid-glass-mini flex items-center justify-center pointer-events-none">
             {item?.customIcon?.type === 'letter' ? (
                <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-blue-500 to-purple-600 rounded-md">
                    <span className="text-[8px] font-bold text-white uppercase">
                        {(item.customIcon.letter || item.title?.[0] || 'A')}
                    </span>
                </div>
            ) : (
                iconSrc ? (
                    <img 
                        src={iconSrc} 
                        alt="" 
                        className="w-full h-full object-cover rounded-md"
                    />
                ) : (
                    <div className="w-full h-full bg-white/5 animate-pulse" />
                )
            )}
        </div>
    );
};

const FolderIcon = ({ folder, iconSize, onIconEmbedded }) => {
    // 修复点 1：增加空值保护，防止 folder.children 为空时崩溃
    const previewItems = folder?.children?.slice(0, 9) || [];
    const folderRef = useRef(null);
    
    // 动态网格布局：少于等于4个用 2x2，否则 3x3
    const gridCols = previewItems.length <= 4 ? 'grid-cols-2' : 'grid-cols-3';
    const padding = iconSize * 0.15;
    
    useEffect(() => {
        const element = folderRef.current;
        if (!element) return;

        const handleMouseMove = (e) => {
            const rect = element.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            element.style.setProperty('--mouse-x', `${x}%`);
            element.style.setProperty('--mouse-y', `${y}%`);
        };

        element.addEventListener('mousemove', handleMouseMove);
        return () => element.removeEventListener('mousemove', handleMouseMove);
    }, []);
    
    return (
        <div
            ref={folderRef}
            // 移除 pointer-events-none，允许点击事件穿透到外层 SortableShortcutItem
            className="relative liquid-glass-folder rounded-[22px] overflow-hidden select-none touch-none"
            style={{
                width: `${iconSize}px`,
                height: `${iconSize}px`,
                padding: `${padding}px`
            }}
        >
            <div className="glass-refraction pointer-events-none" />
            <div className={`w-full h-full grid ${gridCols} gap-1 content-center justify-items-center relative z-10`}>
                {previewItems.map((item, index) => (
                    <MiniIcon key={item.id || index} item={item} onIconEmbedded={onIconEmbedded} />
                ))}
            </div>
        </div>
    );
};

export default FolderIcon;
