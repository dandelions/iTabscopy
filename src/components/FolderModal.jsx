import { useState, useEffect, useRef } from 'react';
import { Edit2, Trash2, X, Pencil } from 'lucide-react';
import { DndContext, useDroppable, TouchSensor, MouseSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    rectSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useIconSource } from '../hooks/useIconSource';

// --- 内部图标项组件 ---
const SortableItem = ({ shortcut, onRemove, onEdit, isContextOpen, setContextShortcutId, isDraggable = true }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: shortcut.id,
        disabled: !isDraggable
    });

    const iconSrc = useIconSource(shortcut);
    const itemRef = useRef(null);

    useEffect(() => {
        if (!isContextOpen || !shortcut) return;
        const handleClickOutside = (e) => {
            if (itemRef.current && itemRef.current.contains(e.target)) return;
            setContextShortcutId(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside, { passive: true });
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, [isContextOpen, setContextShortcutId, shortcut]);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 100 : 'auto',
        opacity: isDragging ? 0.2 : 1,
        // ✨ 未拖拽时允许垂直滑屏滚动，激活拖拽时锁定
        touchAction: isDragging ? 'none' : 'pan-y',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
    };

    return (
        <div
            ref={node => {
                setNodeRef(node);
                itemRef.current = node;
            }}
            style={style}
            {...attributes}
            // ✨ 关键点：由整个外盒子接受 dnd-kit 的 listeners。配合传感器，实现长按 250ms 顺畅拖拽！
            {...(isDraggable && !isContextOpen ? listeners : {})}
            onClick={(e) => {
                if (isContextOpen) {
                    e.stopPropagation();
                    return;
                }
                if (shortcut.url) window.open(shortcut.url, '_self');
            }}
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setContextShortcutId(shortcut.id);
            }}
            className="group relative flex flex-col items-center justify-center gap-2 p-2 rounded-xl cursor-pointer select-none"
        >
            <div className="relative w-16 h-16 pointer-events-none">
                <div className={`w-full h-full rounded-xl liquid-glass-icon flex items-center justify-center overflow-hidden bg-white/5 ${isDragging ? 'ring-2 ring-blue-500' : ''}`}>
                    {shortcut.customIcon?.type === 'letter' ? (
                        <div className="flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl w-[80%] h-[80%]">
                            <span className="text-xl font-bold text-white uppercase">
                                {shortcut.customIcon.letter || shortcut.title?.[0] || 'A'}
                            </span>
                        </div>
                    ) : (
                        iconSrc && <img src={iconSrc} alt="" className="w-4/5 h-4/5 object-contain rounded-lg" draggable={false} />
                    )}
                </div>

                {/* 悬浮控制层需要恢复指针交互 */}
                {isContextOpen && (
                    <div className="absolute inset-0 flex flex-col gap-2 items-center justify-center bg-black/50 backdrop-blur-sm rounded-xl pointer-events-auto" style={{ zIndex: 10002 }}>
                        <button
                            type="button"
                            data-context-menu="true"
                            className="p-1.5 bg-red-500 rounded-full text-white shadow-lg"
                            onClick={(e) => { e.stopPropagation(); onRemove(shortcut.id); setContextShortcutId(null); }}
                        >
                            <Trash2 size={12} />
                        </button>
                        <button
                            type="button"
                            data-context-menu="true"
                            className="p-1.5 bg-blue-500 rounded-full text-white shadow-lg"
                            onClick={(e) => { e.stopPropagation(); onEdit(shortcut); setContextShortcutId(null); }}
                        >
                            <Edit2 size={12} />
                        </button>
                    </div>
                )}
            </div>

            <span className="text-xs text-white/90 truncate w-full text-center px-1 block pointer-events-none">
                {shortcut.title}
            </span>
        </div>
    );
};

// --- 外层背景 Droppable ---
const OutsideDroppable = ({ children, onClose, isVisible }) => {
    const { setNodeRef } = useDroppable({
        id: 'folder-modal-outside',
        disabled: !isVisible,
    });

    return (
        <div
            ref={setNodeRef}
            className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-300 ${isVisible ? 'bg-black/70 backdrop-blur-md opacity-100' : 'opacity-0'}`}
            onClick={onClose}
        >
            <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', zIndex: 10000 }}>
                {children}
            </div>
        </div>
    );
};

// --- 主组件 ---
const FolderModal = ({ isOpen, onClose, folder, onUpdate, onDeleteItem, onEditShortcut }) => {
    const [contextShortcutId, setContextShortcutId] = useState(null);
    const gridRef = useRef(null);
    const folderDragStartPosRef = useRef({ x: 0, y: 0 });
    const isMobileRef = useRef(false);

    const children = Array.isArray(folder?.children) ? folder.children : [];

    useEffect(() => {
        isMobileRef.current = window.innerWidth <= 768;
    });

    useEffect(() => {
        if (!isOpen) return;
        return () => { setTimeout(() => { setContextShortcutId(null); }, 0); };
    }, [isOpen]);

    // ✨ 核心调校：降低 Tolerance（容差为 5px），保证手指只要开始快速划过，立刻退还手势给网格容器支持原生垂直滚动
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 250, // 250ms 静止不动激活拖拽
                tolerance: 5,
            }
        })
    );

    const handleDragStart = (event) => {
        if (event.active.rect.current.translated) {
            folderDragStartPosRef.current = {
                x: event.active.rect.current.translated.left,
                y: event.active.rect.current.translated.top,
            };
        }
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (!over) return;

        // ✨ 修复问题 3：在文件夹内部，长按如果原地松手（位移极小），判定为呼出【编辑菜单】，并且支持大范围拖拽！
        if (isMobileRef.current) {
            const currentLeft = event.over?.rect?.left || 0;
            const currentTop = event.over?.rect?.top || 0;
            const deltaX = currentLeft - folderDragStartPosRef.current.x;
            const deltaY = currentTop - folderDragStartPosRef.current.y;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            if (distance < 15) {
                setContextShortcutId(active.id);
                return;
            }
        }

        if (active.id === over.id) return;

        const oldIndex = children.findIndex(s => s.id === active.id);
        const newIndex = children.findIndex(s => s.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
            onUpdate?.({ ...folder, children: arrayMove(children, oldIndex, newIndex) });
        }
    };

    // 独立支持 PC 鼠标滚轮
    const handleWheel = (e) => {
        if (gridRef.current) {
            e.stopPropagation();
            gridRef.current.scrollTop += e.deltaY;
        }
    };

    if (!isOpen || !folder) return null;

    return (
        <OutsideDroppable key={`folder-modal-root-${folder.id}`} onClose={onClose} isVisible={isOpen}>
            <div className="bg-white/10 border border-white/20 rounded-3xl p-6 w-[85vw] max-w-md backdrop-blur-2xl shadow-2xl animate-in zoom-in duration-300" style={{ position: 'relative', zIndex: 10001 }}>
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-white select-none">{folder.title || '文件夹'}</h2>
                        <button
                            onClick={() => onEditShortcut?.(folder)}
                            className="text-white/40 hover:text-white transition-colors p-1 hover:bg-white/10 rounded"
                        >
                            <Pencil size={14} />
                        </button>
                    </div>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div
                    ref={gridRef}
                    onWheel={handleWheel}
                    className="grid grid-cols-4 gap-4 min-h-[140px] max-h-[50vh] overflow-y-auto p-2 -m-2 folder-modal-grid"
                    style={{
                        touchAction: 'pan-y',
                        WebkitOverflowScrolling: 'touch'
                    }}
                >
                    {children.length === 0 ? (
                        <div className="col-span-4 flex items-center justify-center text-white/40 py-12">
                            文件夹为空
                        </div>
                    ) : (
                        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd} sensors={sensors}>
                            <SortableContext items={children.map(s => s.id)} strategy={rectSortingStrategy}>
                                {children.map((shortcut) => (
                                    <SortableItem
                                        key={shortcut.id}
                                        shortcut={shortcut}
                                        isContextOpen={isOpen && contextShortcutId === shortcut.id}
                                        setContextShortcutId={setContextShortcutId}
                                        onRemove={onDeleteItem}
                                        onEdit={onEditShortcut}
                                        isDraggable={true}
                                    />
                                ))}
                            </SortableContext>
                        </DndContext>
                    )}
                </div>
            </div>
        </OutsideDroppable>
    );
};

export default FolderModal;
