import { useState, useRef, useEffect } from 'react';
import { Edit2, Trash2 } from 'lucide-react';
import {
    useDroppable,
} from '@dnd-kit/core';
import {
    SortableContext,
    rectSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useIconSource } from '../hooks/useIconSource';


/**
 * 结合了 dnd-kit 拖拽监听器、单击和长按功能的 Hook。
 * @param {object} options
 * @param {object} options.dndListeners - 从 dnd-kit 的 useSortable 返回的 listeners 对象。
 * @param {function} options.onClick - 单击时触发的回调。
 * @param {function} options.onLongPress - 长按时触发的回调。
 * @param {number} [options.delay=2000] - 长按的延迟时间（毫秒）。
 * @returns {object} - 需要应用到组件上的事件处理器。
 */
export const useCombinedPress = ({ dndListeners, onClick, onLongPress, delay = 2000 }) => {
    const timerRef = useRef(null);
    const isLongPressTriggeredRef = useRef(false);
    const hasMovedRef = useRef(false);

    const clearTimer = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const handlePointerDown = useCallback((e) => {
        // 优先调用 dnd-kit 的事件处理器，让它开始监听
        if (dndListeners && dndListeners.onPointerDown) {
            dndListeners.onPointerDown(e);
        }
        
        // 重置状态
        isLongPressTriggeredRef.current = false;
        hasMovedRef.current = false;

        // 启动长按计时器
        timerRef.current = setTimeout(() => {
            // 如果在计时器触发前已经移动，则不执行长按
            if (hasMovedRef.current) {
                return;
            }
            isLongPressTriggeredRef.current = true;
            onLongPress(e);
        }, delay);
    }, [dndListeners, onLongPress, delay]);

    const handlePointerMove = useCallback(() => {
        // 一旦检测到移动，就设置移动标志位并清除计时器
        if (!hasMovedRef.current) {
            hasMovedRef.current = true;
            clearTimer();
        }
    }, []);

    const handlePointerUp = useCallback((e) => {
        // 松开时，无论如何都清除计时器
        clearTimer();
        
        // 调用 dnd-kit 的事件处理器
        if (dndListeners && dndListeners.onPointerUp) {
            dndListeners.onPointerUp(e);
        }
    }, [dndListeners]);

    const handleClick = useCallback((e) => {
        // 如果长按已经触发，则阻止单击事件
        if (isLongPressTriggeredRef.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        // 否则，执行单击回调
        onClick(e);
    }, [onClick]);

    return {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onClick: handleClick,
        // 防止在拖动时意外触发右键菜单
        onContextMenu: (e) => {
            if (hasMovedRef.current) {
                e.preventDefault();
            }
        }
    };
};

// 长按 Hook
const useLongPress = (callback, { delay = 300 } = {}) => {
    const [isLongPress, setIsLongPress] = useState(false);
    const timeoutRef = useRef(null);

    const start = () => {
        timeoutRef.current = setTimeout(() => {
            setIsLongPress(true);
            callback();
        }, delay);
    };

    const clear = () => {
        clearTimeout(timeoutRef.current);
        setIsLongPress(false);
    };

    return {
        onMouseDown: start,
        onMouseUp: clear,
        onMouseLeave: clear,
        onTouchStart: start,
        onTouchEnd: clear,
    };
};

const SortableFolderItem = ({ shortcut, onRemove, onEdit, isContextOpen, setContextShortcutId }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: shortcut.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0 : 1,
    };

    const iconSrc = useIconSource(shortcut);
    const iconRef = useRef(null);

    // 动态光泽效果
    useEffect(() => {
        const element = iconRef.current;
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

    const handleOpen = () => {
        if (isContextOpen) {
            setContextShortcutId(null);
            return;
        }
        if (shortcut.url) {
            window.open(shortcut.url, '_self');
        }
    };

    const handleLongPress = () => {
        onEdit(shortcut); // 触发编辑功能
    };

    // 使用新的 Hook 来整合所有事件
    const combinedEvents = useCombinedPress({
        dndListeners: listeners, // 传入 dnd-kit 的 listeners
        onClick: handleOpen,
        onLongPress: handleLongPress,
        delay: 2000, // 2秒长按
    });

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...combinedEvents} // 关键改动：使用 combinedEvents 替代原来的 listeners 和 longPressEvents
            className="group relative flex flex-col items-center gap-2 p-2 rounded-xl transition-colors cursor-pointer"
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextShortcutId(shortcut.id);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpen();
                }
            }}
            role="button"
            tabIndex={0}
        >
            <div className="relative w-16 h-16">
                <div ref={iconRef} className="w-full h-full rounded-xl liquid-glass-icon flex items-center justify-center overflow-hidden">
                    <div className="glass-refraction" />
                    {shortcut.customIcon?.type === 'letter' ? (
                        <div className="flex items-center justify-center bg-linear-to-br from-blue-500 to-purple-600 rounded-xl" style={{ width: '80%', height: '80%' }}>
                            <span className="text-xl font-bold text-white">
                                {(shortcut.customIcon.letter || shortcut.title?.[0] || 'A').toUpperCase()}
                            </span>
                        </div>
                    ) : (
                        iconSrc ? (
                            <img
                                src={iconSrc}
                                alt={shortcut.title}
                                className="w-4/5 h-4/5 object-contain rounded-lg"
                                draggable={false}
                            />
                        ) : (
                            <div className="w-full h-full bg-white/5 animate-pulse" />
                        )
                    )}
                </div>
                
                {isContextOpen && (
                    <>
                        <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] pointer-events-none rounded-xl" />
                        <button
                            type="button"
                            className="absolute -top-2 -right-2 p-1.5 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-400 transition z-20"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove(shortcut.id);
                                setContextShortcutId(null);
                            }}
                        >
                            <Trash2 className="h-3 w-3" />
                        </button>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <button
                                type="button"
                                className="w-full h-full rounded-xl bg-black/40 border border-white/20 text-white hover:text-blue-200 backdrop-blur-sm pointer-events-auto flex items-center justify-center transition"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(shortcut);
                                    setContextShortcutId(null);
                                }}
                            >
                                <Edit2 className="h-6 w-6 drop-shadow-lg" />
                            </button>
                        </div>
                    </>
                )}
            </div>
            <span className="text-xs text-white/90 truncate w-full text-center select-none">
                {shortcut.title}
            </span>
        </div>
    );
};

const OutsideDroppable = ({ children, onClose, isVisible }) => {
    const { setNodeRef } = useDroppable({
        id: 'folder-modal-outside',
    });

    return (
        <div 
            ref={setNodeRef}
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-200 ${isVisible ? 'bg-black/70 backdrop-blur-md opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            onClick={isVisible ? onClose : undefined}
        >
            <div className={isVisible ? '' : 'pointer-events-none'}>
                {children}
            </div>
        </div>
    );
};

const FolderModal = ({ isOpen, onClose, folder, onUpdate, onDelete, onMoveOut, onEditShortcut }) => {
    const [title, setTitle] = useState('');
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [isRendered, setIsRendered] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [cachedFolder, setCachedFolder] = useState(null);
    const [contextShortcutId, setContextShortcutId] = useState(null);
    const titleInputRef = useRef(null);

    useEffect(() => {
        if (isOpen && folder) {
            setCachedFolder(folder);
            setIsRendered(true);
            requestAnimationFrame(() => setIsVisible(true));
        } else {
            setIsVisible(false);
            const timer = setTimeout(() => {
                setIsRendered(false);
                setCachedFolder(null);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen, folder]);

    useEffect(() => {
        if (!contextShortcutId) return;
        const handleClickAway = () => setContextShortcutId(null);
        document.addEventListener('click', handleClickAway);
        return () => document.removeEventListener('click', handleClickAway);
    }, [contextShortcutId]);

    const currentFolder = folder || cachedFolder;
    const items = currentFolder?.children || [];

    const { setNodeRef: setContentRef } = useDroppable({
        id: 'folder-modal-content',
    });

    useEffect(() => {
        if (currentFolder) {
            setTitle(currentFolder.title || 'Folder');
        }
    }, [currentFolder]);

    useEffect(() => {
        if (isEditingTitle && titleInputRef.current) {
            titleInputRef.current.focus();
        }
    }, [isEditingTitle]);

    const handleTitleSave = () => {
        setIsEditingTitle(false);
        if (title.trim() !== currentFolder.title) {
            onUpdate({ ...currentFolder, title: title.trim() || 'Folder' });
        }
    };

    const handleRemoveItem = (itemId) => {
        const newItems = items.filter(i => i.id !== itemId);
        onUpdate({ ...currentFolder, children: newItems });
    };

    if (!isRendered && !isOpen) return null;

    return (
        <OutsideDroppable onClose={onClose} isVisible={isVisible}>
            <div 
                ref={setContentRef}
                className={`liquid-glass rounded-3xl w-full max-w-2xl p-6 shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3 flex-1">
                        {isEditingTitle ? (
                            <input
                                ref={titleInputRef}
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                onBlur={handleTitleSave}
                                onKeyDown={(e) => e.key === 'Enter' && handleTitleSave()}
                                className="liquid-glass-mini border border-white/30 rounded-lg px-3 py-1.5 text-white text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-white/40 w-full max-w-[200px] transition-all"
                            />
                        ) : (
                            <h2 
                                className="text-xl font-semibold text-white cursor-pointer hover:text-blue-400 flex items-center gap-2"
                                onClick={() => setIsEditingTitle(true)}
                            >
                                {title}
                                <Edit2 className="h-4 w-4 opacity-50" />
                            </h2>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onDelete}
                            className="p-2 rounded-full liquid-glass-mini hover:border-red-400/50 text-red-400 hover:text-red-300 transition-all hover:scale-110"
                            title="Delete Folder"
                        >
                            <Trash2 className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-4 min-h-[120px]">
                        {items.map((item) => (
                            <SortableFolderItem
                                key={item.id}
                                shortcut={item}
                                onRemove={handleRemoveItem}
                                onEdit={onEditShortcut}
                                isContextOpen={contextShortcutId === item.id}
                                setContextShortcutId={setContextShortcutId}
                            />
                        ))}
                    </div>
                </SortableContext>
            </div>
        </OutsideDroppable>
    );
};

export default FolderModal;
