import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Check, ChevronLeft, ChevronRight, Trash2, Edit2 } from 'lucide-react';
import { useIconSource } from '../hooks/useIconSource';
import EditShortcutModal from './EditShortcutModal';
import FolderIcon from './FolderIcon';
import FolderModal from './FolderModal';
import {
    DndContext,
    closestCenter,
    rectIntersection,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragOverlay,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    rectSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ⚡ 核心优化：列距根据宽度动态弹性分配，行距则卡死合理上限，防止 4 行以内上下隔得太开
const calculateGaps = (cols, rows, screenWidth, iconSize, leftOffset = 0) => {
    const isMobile = screenWidth < 768; // 阈值：小于 768px 判定为移动端

    let colGap = 48;
    let rowGap = 44;

    if (isMobile) {
        // 📱 移动端/小屏：保持紧凑布局
        colGap = cols <= 4 ? 16 : 20;
        rowGap = 16;
    } else {
        // 💻 PC 端/宽屏 (1024px - 1920px+)
        const containerPadding = 48; // 容器两侧内边距
        const itemRealWidth = iconSize + 24; // 单个图标项的真实总宽度

        // 1. 【列间距弹性拉开】算出所有图标占用的物理宽度，将屏幕多余宽度均分给列距
        const totalItemsWidth = cols * itemRealWidth;
        const usedWidthWithoutGaps = totalItemsWidth + containerPadding + leftOffset;
        const remainingSpace = screenWidth - usedWidthWithoutGaps;

        if (remainingSpace > 0 && cols > 1) {
            colGap = Math.min(180, Math.floor(remainingSpace / (cols - 1)));
            colGap = Math.max(56, colGap);
        } else {
            colGap = 56;
        }

        // 2. 【行间距卡住上限】⚡ 针对目前最多只有 4 行的情况进行收紧
        // 不再让行距盲目跟随宽屏放大，而是设定一个最大限制 40px - 48px
        if (rows <= 4) {
            rowGap = 40; // ⚡ 4行以内时，行距固定在精致大气的 40px，绝不溢出和过空
        } else {
            // 如果未来增加了更多行，为了防止垂直溢出，行数越多间距越收紧
            rowGap = Math.max(24, 48 - (rows - 4) * 4);
        }
    }

    return { colGap, rowGap };
};

const MERGE_PREVIEW_RATIO = 0.01;
const MERGE_PREVIEW_DISTANCE_RATIO = 0.55;

const getShortcutElement = (id) => {
    const idString = String(id);
    return Array.from(document.querySelectorAll('[data-shortcut-id]'))
        .find(element => element.getAttribute('data-shortcut-id') === idString) || null;
};

const getIntersectionRatio = (a, b) => {
    if (!a || !b) return 0;

    const left = Math.max(a.left, b.left);
    const right = Math.min(a.right, b.right);
    const top = Math.max(a.top, b.top);
    const bottom = Math.min(a.bottom, b.bottom);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);

    if (width === 0 || height === 0) return 0;

    const intersectionArea = width * height;
    const aArea = Math.max(1, a.width * a.height);
    const bArea = Math.max(1, b.width * b.height);
    return intersectionArea / Math.min(aArea, bArea);
};

const toComparableRect = (rect) => {
    if (!rect) return null;

    return {
        left: rect.left,
        right: rect.right ?? rect.left + rect.width,
        top: rect.top,
        bottom: rect.bottom ?? rect.top + rect.height,
        width: rect.width,
        height: rect.height,
    };
};

const getDragRect = (active, delta) => {
    const initial = active?.rect?.current?.initial;

    if (initial && delta) {
        return toComparableRect({
            left: initial.left + delta.x,
            top: initial.top + delta.y,
            width: initial.width,
            height: initial.height,
        });
    }

    return toComparableRect(active?.rect?.current?.translated || initial);
};

const getRectCenter = (rect) => {
    if (!rect) return null;
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    };
};

const isPointInsideRect = (point, rect, insetRatio = 0.08) => {
    if (!point || !rect) return false;
    const insetX = rect.width * insetRatio;
    const insetY = rect.height * insetRatio;

    return point.x >= rect.left + insetX &&
        point.x <= rect.right - insetX &&
        point.y >= rect.top + insetY &&
        point.y <= rect.bottom - insetY;
};

const RegularShortcutIcon = ({ shortcut }) => {
    const iconSrc = useIconSource(shortcut);
    const iconRef = useRef(null);

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

    return (
        <div
            ref={iconRef}
            className="rounded-[22px] liquid-glass-icon flex items-center justify-center overflow-hidden h-full w-full"
        >
            <div className="glass-refraction" />
            {(shortcut.customIcon?.type === 'letter' || iconSrc === false) ? (
                <div className="flex items-center justify-center bg-linear-to-br from-blue-500 to-purple-600 rounded-[22px]" style={{ width: '80%', height: '80%' }}>
                    <span className="text-3xl font-bold text-white">
                        {(shortcut.customIcon?.letter || shortcut.title?.[0] || 'A').toUpperCase()}
                    </span>
                </div>
            ) : (
                iconSrc ? (
                    <img
                        src={iconSrc}
                        alt={shortcut.title}
                        loading="lazy"
                        decoding="async"
                        className="select-none pointer-events-none transition-all duration-300 rounded-[18px]"
                        style={{
                            width: shortcut.iconPadding ? '60%' : '90%',
                            height: shortcut.iconPadding ? '60%' : '90%',
                            objectFit: 'contain',
                        }}
                        draggable={false}
                        onError={(e) => {
                            if (!e.target.parentElement) return;
                            e.target.style.display = 'none';
                            e.target.parentElement.innerHTML = `<div class="flex items-center justify-center bg-linear-to-br from-blue-500 to-purple-600 rounded-[22px]" style="width: 80%; height: 80%;"><span class="text-3xl font-bold text-white">${(shortcut.title?.[0] || 'A').toUpperCase()}</span></div>`;
                        }}
                    />
                ) : (
                    <div className="w-full h-full bg-gray-50 animate-pulse" />
                )
            )}
        </div>
    );
};

const ShortcutIcon = ({ shortcut, iconSize, isContextOpen, isEditMode = false, onRemove, onEdit, setContextShortcutId }) => {
    return (
        <div
            className="relative"
            style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
        >
            {shortcut.type === 'folder' ? (
                <FolderIcon folder={shortcut} iconSize={iconSize} />
            ) : (
                <RegularShortcutIcon shortcut={shortcut} />
            )}

            {isContextOpen && (
                <>
                    {!isEditMode && (
                        <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] pointer-events-none rounded-[22px]" />
                    )}
                    <button
                        type="button"
                        data-context-menu="true"
                        className="absolute -top-2 -right-2 p-2 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-400 transition z-20"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onRemove?.(shortcut.id);
                            setContextShortcutId?.(null);
                        }}
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        data-context-menu="true"
                        className={isEditMode
                            ? 'absolute -bottom-2 -right-2 p-2 rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-400 transition z-20'
                            : 'absolute inset-0 rounded-[22px] bg-black/40 border border-white/20 text-white hover:text-blue-200 backdrop-blur-sm flex items-center justify-center transition z-10'
                        }
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit?.(shortcut);
                            setContextShortcutId?.(null);
                        }}
                    >
                        <Edit2 className={`${isEditMode ? 'h-4 w-4' : 'h-6 w-6'} drop-shadow-lg`} />
                    </button>
                </>
            )}
        </div>
    );
};

const useLongPress = (callback = () => {}, { delay = 300, moveThreshold = 10 } = {}) => {
    const timeoutRef = useRef(null);
    const startPosRef = useRef({ x: 0, y: 0 });

    const getEventPoint = (e) => {
        if (e.touches?.[0]) return e.touches[0];
        if (e.changedTouches?.[0]) return e.changedTouches[0];
        return e;
    };

    const clearTimer = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const handlePointerDown = useCallback((e) => {
        const point = getEventPoint(e);
        clearTimer();
        startPosRef.current = { x: point.clientX, y: point.clientY };
        timeoutRef.current = setTimeout(() => {
            callback(e);
        }, delay);
    }, [callback, clearTimer, delay]);

    const handlePointerMove = useCallback((e) => {
        if (!timeoutRef.current) return;

        const point = getEventPoint(e);
        const dx = Math.abs(point.clientX - startPosRef.current.x);
        const dy = Math.abs(point.clientY - startPosRef.current.y);

        if (dx > moveThreshold || dy > moveThreshold) {
            clearTimer();
        }
    }, [clearTimer, moveThreshold]);

    return {
        onPointerDown: handlePointerDown,
        onPointerUp: clearTimer,
        onPointerLeave: clearTimer,
        onPointerMove: handlePointerMove,
        onTouchStartCapture: handlePointerDown,
        onTouchEndCapture: clearTimer,
        onTouchCancelCapture: clearTimer,
        onTouchMoveCapture: handlePointerMove,
    };
};

const SortableShortcutItem = ({
                                  shortcut,
                                  iconSize,
                                  contextShortcutId,
                                  setContextShortcutId,
                                  onRemoveShortcut,
                                  setEditingShortcut,
                                  onOpenFolder,
                                  isMergeTarget,
                                  isDropCandidate,
                                  isEditing,
                                  setIsEditing
                              }) => {
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

    const longPressEvents = useLongPress(() => {
        setIsEditing(false);
        setContextShortcutId(shortcut.id);
    }, {
        delay: 420
    });

    const isContextOpen = contextShortcutId === shortcut.id;
    const dndListeners = isContextOpen ? {} : listeners;

    const itemWidth = iconSize + 24;

    return (
        <div
            data-shortcut-id={shortcut.id}
            ref={setNodeRef}
            style={{ ...style, width: `${itemWidth}px`, touchAction: isContextOpen ? 'pan-y' : 'none' }}
            {...attributes}
            {...dndListeners}
            {...(isEditing ? {} : longPressEvents)}
            data-dragging={isDragging ? 'true' : undefined}
            className="sortable-item"
            onClick={(e) => {
                if (isDragging) {
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }

                if (isContextOpen) {
                    const isEditButton = e.target.closest('button[data-context-menu]');
                    if (isEditButton) return;
                    e.stopPropagation();
                    e.preventDefault();
                    return;
                }

                if (shortcut.type === 'folder') {
                    e.stopPropagation();
                    onOpenFolder(shortcut);
                    return;
                }

                window.location.href = shortcut.url;
            }}
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsEditing(false);
                setContextShortcutId(shortcut.id);
            }}
            tabIndex={0}
            role="button"
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    if (shortcut.type === 'folder') {
                        onOpenFolder(shortcut);
                    } else {
                        window.location.href = shortcut.url;
                    }
                }
            }}
        >
            <div className={`relative flex justify-center ${isContextOpen && !isDragging ? 'animate-jiggle' : ''}`}>
                <ShortcutIcon
                    shortcut={shortcut}
                    iconSize={iconSize}
                    isContextOpen={isContextOpen}
                    onRemove={onRemoveShortcut}
                    onEdit={setEditingShortcut}
                    setContextShortcutId={setContextShortcutId}
                    isEditMode={false}
                />
                {isMergeTarget && (
                    <div
                        className="absolute -inset-2 border-2 border-dashed border-blue-400 rounded-[28px] pointer-events-none animate-pulse bg-blue-500/10 z-50"
                        style={{ zIndex: 60 }}
                    />
                )}
                {isDropCandidate && !isMergeTarget && (
                    <div
                        className="absolute -inset-2 border border-white/45 rounded-[28px] pointer-events-none bg-white/5 z-40"
                        style={{ zIndex: 55 }}
                    />
                )}
            </div>
            <span className="text-sm font-medium text-white/90 drop-shadow-md truncate text-center block mt-2 px-1 select-none" style={{ width: '100%' }}>
                {shortcut.title}
            </span>
        </div>
    );
};

const ShortcutGrid = ({ config, shortcuts, onRemoveShortcut, onEditShortcut, onReorder, leftOffset = 0 }) => {
    const { cols = 4, rows = 4, iconSize = 50 } = config || {};
    const [currentPage, setCurrentPage] = useState(0);
    const [isEditing, setIsEditing] = useState(false);
    const [contextShortcutId, setContextShortcutId] = useState(null);
    const [editingShortcut, setEditingShortcut] = useState(null);
    const [responsiveCols, setResponsiveCols] = useState(cols);
    const [activeId, setActiveId] = useState(null);
    const [openFolder, setOpenFolder] = useState(null);
    const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
    const [dropCandidateId, setDropCandidateId] = useState(null);
    const [mergeTargetId, setMergeTargetId] = useState(null);
    const mergeTargetIdRef = useRef(null);
    const dragStartPosRef = useRef({ x: 0, y: 0 });
    const isTouchDragRef = useRef(false);

    const containerRef = useRef(null);
    const accumulatedRef = useRef(0);
    const lastTimeRef = useRef(0);
    const isChangingRef = useRef(false);

    const [screenWidth, setScreenWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1280);

    const { colGap, rowGap } = calculateGaps(responsiveCols, rows, screenWidth, iconSize, leftOffset);
    const [scale, setScale] = useState(1);

    const collisionDetectionStrategy = useCallback((args) => {
        const overlapCollisions = rectIntersection(args);
        if (overlapCollisions.length > 0) {
            return overlapCollisions;
        }
        return closestCenter(args);
    }, []);

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: { distance: 10 },
        }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 250, tolerance: 5 },
        })
    );

    const findShortcut = useCallback((id) => {
        const shortcut = shortcuts.find(s => s.id === id);
        if (shortcut) return { shortcut, container: 'root', index: shortcuts.indexOf(shortcut) };

        for (const s of shortcuts) {
            if (s.type === 'folder' && s.children) {
                const child = s.children.find(c => c.id === id);
                if (child) return { shortcut: child, container: s.id, parent: s, index: s.children.indexOf(child) };
            }
        }
        return null;
    }, [shortcuts]);

    const getMergeState = useCallback((active, delta) => {
        if (!active) {
            return { dropCandidateId: null, mergeTargetId: null };
        }

        const activeShortcut = shortcuts.find(s => s.id === active.id);
        const activeRect = getDragRect(active, delta);
        const activeCenter = getRectCenter(activeRect);
        if (!activeShortcut || activeShortcut.type === 'folder' || !activeCenter) {
            return { dropCandidateId: null, mergeTargetId: null };
        }

        let closestCandidate = null;

        // 不依赖 dnd-kit 的 over：排序动画会改变 over 的缓存位置，导致释放时误判为换位。
        for (const candidate of shortcuts) {
            if (candidate.id === active.id) continue;

            const candidateRect = toComparableRect(getShortcutElement(candidate.id)?.getBoundingClientRect());
            const candidateCenter = getRectCenter(candidateRect);
            if (!candidateRect || !candidateCenter) continue;

            const ratio = getIntersectionRatio(activeRect, candidateRect);
            const isCenteredOnTarget = isPointInsideRect(activeCenter, candidateRect);
            const centerDistance = Math.hypot(
                activeCenter.x - candidateCenter.x,
                activeCenter.y - candidateCenter.y
            );
            const mergeDistance = Math.hypot(candidateRect.width, candidateRect.height) * MERGE_PREVIEW_DISTANCE_RATIO;
            const isNearTarget = centerDistance <= mergeDistance;

            if (ratio < MERGE_PREVIEW_RATIO && !isCenteredOnTarget && !isNearTarget) continue;

            if (!closestCandidate || centerDistance < closestCandidate.centerDistance) {
                closestCandidate = { id: candidate.id, centerDistance };
            }
        }

        if (!closestCandidate) {
            return { dropCandidateId: null, mergeTargetId: null };
        }

        // 进入候选范围即展示虚线框，并在释放时执行合并而不是排序。
        return {
            dropCandidateId: closestCandidate.id,
            mergeTargetId: closestCandidate.id,
        };
    }, [shortcuts]);

    const resetMergeState = useCallback(() => {
        setDropCandidateId(null);
        setMergeTargetId(null);
        mergeTargetIdRef.current = null;
    }, []);

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
        setContextShortcutId(null);
        const initial = event.active.rect.current.initial;
        if (initial) {
            dragStartPosRef.current = { x: initial.left, y: initial.top };
        }
        isTouchDragRef.current = event.activatorEvent?.type?.startsWith('touch') || window.innerWidth <= 768;
    };

    const updateMergeState = useCallback((active, delta) => {
        const nextMergeState = getMergeState(active, delta);
        setDropCandidateId(nextMergeState.dropCandidateId);
        setMergeTargetId(nextMergeState.mergeTargetId);
        mergeTargetIdRef.current = nextMergeState.mergeTargetId;
    }, [getMergeState]);

    const handleDragMove = (event) => {
        updateMergeState(event.active, event.delta);
    };

    const handleDragOver = (event) => {
        updateMergeState(event.active, event.delta);
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;

        setActiveId(null);

        const activeRect = active.rect.current.translated || active.rect.current.initial;
        const deltaX = (activeRect?.left || 0) - dragStartPosRef.current.x;
        const deltaY = (activeRect?.top || 0) - dragStartPosRef.current.y;
        const dragDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const isStationaryTouchPress = isTouchDragRef.current && dragDistance < 15;

        const finalMergeState = getMergeState(active, event.delta);
        const finalMergeTargetId = finalMergeState.mergeTargetId || mergeTargetIdRef.current;
        const isMergeAction = Boolean(finalMergeTargetId);
        resetMergeState();
        isTouchDragRef.current = false;

        if (isStationaryTouchPress) {
            setIsEditing(false);
            setContextShortcutId(active.id);
            return;
        }

        if (!over) return;

        if (isMergeAction) {
            const activeShortcut = shortcuts.find(s => s.id === active.id);
            const targetShortcut = shortcuts.find(s => s.id === finalMergeTargetId);

            if (targetShortcut && targetShortcut.type === 'folder') {
                if (activeShortcut?.type === 'folder') return;

                const updatedFolder = {
                    ...targetShortcut,
                    children: [...(targetShortcut.children || []), activeShortcut]
                };

                const newShortcuts = shortcuts
                    .filter(s => s.id !== active.id)
                    .map(s => s.id === finalMergeTargetId ? updatedFolder : s);

                if (onReorder) onReorder(newShortcuts);
                return;
            }

            if (activeShortcut && targetShortcut && activeShortcut.type !== 'folder' && targetShortcut.type !== 'folder') {
                const newFolder = {
                    id: `folder-${targetShortcut.id}-${activeShortcut.id}`,
                    title: 'Folder',
                    type: 'folder',
                    children: [targetShortcut, activeShortcut]
                };

                const newShortcuts = shortcuts
                    .filter(s => s.id !== active.id)
                    .map(s => s.id === finalMergeTargetId ? newFolder : s);

                if (onReorder) onReorder(newShortcuts);
                return;
            }
        }

        if (active.id !== over.id) {
            const activeNode = findShortcut(active.id);
            const overNode = findShortcut(over.id);

            if (activeNode && overNode && activeNode.container === overNode.container && activeNode.container !== 'root') {
                const folder = activeNode.parent;
                const oldIndex = activeNode.index;
                const newIndex = overNode.index;

                if (oldIndex !== newIndex) {
                    const newChildren = arrayMove(folder.children, oldIndex, newIndex);
                    handleFolderUpdate({ ...folder, children: newChildren });
                }
                return;
            }

            const oldIndex = shortcuts.findIndex((s) => s.id === active.id);
            const newIndex = shortcuts.findIndex((s) => s.id === over.id);

            if (oldIndex !== -1 && newIndex !== -1 && onReorder) {
                onReorder(arrayMove(shortcuts, oldIndex, newIndex));
            }
        }
    };

    const handleFolderUpdate = (updatedFolder) => {
        if (updatedFolder.children.length === 0) {
            if (onRemoveShortcut) onRemoveShortcut(updatedFolder.id);
            setOpenFolder(null);
            setIsFolderModalOpen(false);
        } else {
            const newShortcuts = shortcuts.map(s => s.id === updatedFolder.id ? updatedFolder : s);
            if (onReorder) onReorder(newShortcuts);
            if (openFolder && openFolder.id === updatedFolder.id) {
                setOpenFolder(updatedFolder);
            }
        }
    };

    const handleFolderItemDelete = (itemId) => {
        if (!openFolder) return;

        const updatedFolder = {
            ...openFolder,
            children: (openFolder.children || []).filter(item => item.id !== itemId)
        };

        handleFolderUpdate(updatedFolder);
    };

    const handleFolderItemMoveOut = (itemId, position) => {
        if (!openFolder) return;

        const itemToMove = openFolder.children.find(i => i.id === itemId);
        if (!itemToMove) return;

        const updatedFolder = {
            ...openFolder,
            children: openFolder.children.filter(i => i.id !== itemId)
        };
        const sourceHasChildren = updatedFolder.children.length > 0;

        const findTargetShortcut = () => {
            if (!position) return null;
            const overlay = document.querySelector('[data-folder-modal-outside="true"]');
            const previousPointerEvents = overlay?.style.pointerEvents;

            if (overlay) {
                overlay.style.pointerEvents = 'none';
            }

            try {
                const el = document.elementFromPoint(position.x, position.y);
                const target = el?.closest?.('[data-shortcut-id]');
                if (!target) return null;
                const targetId = target.getAttribute('data-shortcut-id');
                if (!targetId || targetId === String(openFolder.id)) return null;
                return shortcuts.find(s => String(s.id) === targetId) || null;
            } finally {
                if (overlay) {
                    overlay.style.pointerEvents = previousPointerEvents || '';
                }
            }
        };
        const targetShortcut = findTargetShortcut();

        if (targetShortcut?.type === 'folder') {
            const newShortcuts = shortcuts.flatMap(shortcut => {
                if (shortcut.id === openFolder.id) {
                    return sourceHasChildren ? [updatedFolder] : [];
                }

                if (shortcut.id === targetShortcut.id) {
                    return [{ ...shortcut, children: [...(shortcut.children || []), itemToMove] }];
                }

                return [shortcut];
            });

            if (onReorder) onReorder(newShortcuts);
        } else if (targetShortcut) {
            const newFolder = {
                id: `folder-${targetShortcut.id}-${itemToMove.id}`,
                title: 'Folder',
                type: 'folder',
                children: [targetShortcut, itemToMove]
            };

            const newShortcuts = shortcuts.flatMap(shortcut => {
                if (shortcut.id === openFolder.id) {
                    return sourceHasChildren ? [updatedFolder] : [];
                }

                if (shortcut.id === targetShortcut.id) {
                    return [newFolder];
                }

                return [shortcut];
            });

            if (onReorder) onReorder(newShortcuts);
        } else {
            const folderIndex = shortcuts.findIndex(s => s.id === openFolder.id);
            const newShortcuts = [...shortcuts];

            if (sourceHasChildren) {
                newShortcuts[folderIndex] = updatedFolder;
                newShortcuts.splice(folderIndex + 1, 0, itemToMove);
            } else {
                newShortcuts.splice(folderIndex, 1, itemToMove);
            }

            if (onReorder) onReorder(newShortcuts);
        }

        if (sourceHasChildren) {
            setOpenFolder(updatedFolder);
        } else {
            setOpenFolder(null);
        }

        setIsFolderModalOpen(false);
    };

    const handleOpenFolder = (folder) => {
        setOpenFolder(folder);
        setIsFolderModalOpen(true);
    };

    useEffect(() => {
        const handleResize = () => {
            const currentWidth = window.innerWidth;
            setScreenWidth(currentWidth);

            const padding = 48;
            const availableWidth = Math.max(320, currentWidth - padding - leftOffset);

            const previewGap = calculateGaps(cols, rows, currentWidth, iconSize, leftOffset).colGap;
            const itemRealWidth = iconSize + 24;
            const maxColsFit = Math.max(1, Math.floor((availableWidth + previewGap) / (itemRealWidth + previewGap)));
            const newCols = Math.max(1, Math.min(cols, maxColsFit));
            setResponsiveCols(newCols);

            const gaps = calculateGaps(newCols, rows, currentWidth, iconSize, leftOffset);
            const requiredWidth = (newCols * itemRealWidth) + ((newCols - 1) * gaps.colGap);

            if (requiredWidth > availableWidth) {
                const newScale = availableWidth / requiredWidth;
                setScale(Math.min(1, newScale));
            } else {
                setScale(1);
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [cols, rows, iconSize, leftOffset]);

    const itemsPerPage = responsiveCols * rows;

    const { pages, totalPages } = useMemo(() => {
        const total = itemsPerPage > 0 ? Math.ceil(shortcuts.length / itemsPerPage) : 0;
        const resultPages = Array.from({ length: total }, (_, i) => {
            const start = i * itemsPerPage;
            return shortcuts.slice(start, start + itemsPerPage);
        });
        return { pages: resultPages, totalPages: total };
    }, [shortcuts, itemsPerPage]);

    const renderPage = totalPages > 0 ? Math.min(currentPage, totalPages - 1) : 0;

    useEffect(() => {
        if (!contextShortcutId || shortcuts.some(s => s.id === contextShortcutId)) return undefined;
        const timer = setTimeout(() => setContextShortcutId(null), 0);
        return () => clearTimeout(timer);
    }, [contextShortcutId, shortcuts]);

    useEffect(() => {
        if (!contextShortcutId || isEditing) return;
        const handleClickAway = () => setContextShortcutId(null);
        document.addEventListener('click', handleClickAway);
        return () => document.removeEventListener('click', handleClickAway);
    }, [contextShortcutId, isEditing]);

    useEffect(() => {
        if (!isEditing) return;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setIsEditing(false);
                setContextShortcutId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isEditing]);

    const goToPage = useCallback((targetPage) => {
        const clampedPage = Math.max(0, Math.min(totalPages - 1, targetPage));
        if (clampedPage !== currentPage) {
            isChangingRef.current = true;
            setCurrentPage(clampedPage);
            setTimeout(() => {
                isChangingRef.current = false;
                accumulatedRef.current = 0;
            }, 600);
        }
    }, [totalPages, currentPage]);

    useEffect(() => {
        if (totalPages <= 1) return;

        const handleWheel = (e) => {
            if (isChangingRef.current) return;
            const now = Date.now();

            if (now - lastTimeRef.current > 200) {
                accumulatedRef.current = 0;
            }
            lastTimeRef.current = now;

            let scrollDelta = 0;
            const isHorizontalSwipe = Math.abs(e.deltaX) > Math.abs(e.deltaY);
            const isMouseWheel = e.deltaX === 0 && e.deltaY !== 0;

            if (isHorizontalSwipe) {
                scrollDelta = e.deltaX;
            } else if (isMouseWheel) {
                scrollDelta = e.deltaY;
            } else {
                return;
            }

            accumulatedRef.current += scrollDelta;
            const threshold = 50;

            if (accumulatedRef.current > threshold) {
                goToPage(renderPage + 1);
                accumulatedRef.current = 0;
            } else if (accumulatedRef.current < -threshold) {
                goToPage(renderPage - 1);
                accumulatedRef.current = 0;
            }
        };

        window.addEventListener('wheel', handleWheel, { passive: true });
        return () => window.removeEventListener('wheel', handleWheel);
    }, [totalPages, renderPage, goToPage]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowLeft') {
                goToPage(renderPage - 1);
            } else if (e.key === 'ArrowRight') {
                goToPage(renderPage + 1);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [renderPage, goToPage]);

    if (shortcuts.length === 0) {
        return null;
    }

    const activeNodeShortcut = activeId ? findShortcut(activeId)?.shortcut : null;

    const exactGridWidth = (responsiveCols * (iconSize + 24)) + ((responsiveCols - 1) * colGap);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={collisionDetectionStrategy}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
                setActiveId(null);
                resetMergeState();
                isTouchDragRef.current = false;
            }}
        >
            <div
                ref={containerRef}
                className="w-full overflow-x-hidden"
            >
                <div
                    className="flex transition-transform duration-300 ease-out"
                    style={{
                        transform: `translateX(${-renderPage * 100}%)`,
                    }}
                >
                    {pages.map((pageShortcuts, pageIndex) => (
                        <div
                            key={pageIndex}
                            className="shrink-0 w-full flex justify-center"
                        >
                            <SortableContext
                                items={pageShortcuts.map(s => s.id)}
                                strategy={rectSortingStrategy}
                            >
                                <div
                                    className="grid px-4 py-4 transition-transform duration-300"
                                    style={{
                                        gridTemplateColumns: `repeat(${responsiveCols}, minmax(0, 1fr))`,
                                        columnGap: `${colGap}px`,
                                        rowGap: `${rowGap}px`,
                                        transform: `scale(${scale})`,
                                        transformOrigin: 'top center',
                                        width: `${exactGridWidth}px`,
                                        maxWidth: '100%'
                                    }}
                                >
                                    {pageShortcuts.map((shortcut) => (
                                        <SortableShortcutItem
                                            key={shortcut.id}
                                            shortcut={shortcut}
                                            iconSize={iconSize}
                                            contextShortcutId={contextShortcutId}
                                            setContextShortcutId={setContextShortcutId}
                                            onRemoveShortcut={onRemoveShortcut}
                                            setEditingShortcut={setEditingShortcut}
                                            onOpenFolder={handleOpenFolder}
                                            isEditing={isEditing}
                                            setIsEditing={setIsEditing}
                                            isDropCandidate={dropCandidateId === shortcut.id}
                                            isMergeTarget={mergeTargetId === shortcut.id}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </div>
                    ))}
                </div>
            </div>

            <DragOverlay>
                {activeId && activeNodeShortcut ? (
                    <div style={{ transform: 'scale(1.05)' }}>
                        <div className="flex flex-col items-center gap-3">
                            <ShortcutIcon
                                shortcut={activeNodeShortcut}
                                iconSize={iconSize}
                                isContextOpen={false}
                                isEditMode={false}
                            />
                            <span className="text-sm font-medium text-white/90 drop-shadow-md truncate w-full text-center px-1 select-none">
                                 {activeNodeShortcut.title}
                             </span>
                        </div>
                    </div>
                ) : null}
            </DragOverlay>

            {isEditing && (
                <button
                    type="button"
                    title="完成"
                    className="fixed bottom-8 left-6 z-40 h-11 w-11 rounded-full liquid-glass-fixed text-white flex items-center justify-center hover:scale-105 active:scale-95 transition"
                    onClick={() => {
                        setIsEditing(false);
                        setContextShortcutId(null);
                    }}
                >
                    <Check className="h-5 w-5" />
                </button>
            )}

            {totalPages > 1 && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 liquid-glass-fixed rounded-full px-4 py-2">
                    <button
                        onClick={() => goToPage(renderPage - 1)}
                        disabled={renderPage === 0}
                        className={`p-1.5 rounded-full transition-all ${renderPage === 0
                            ? 'opacity-30 cursor-not-allowed'
                            : 'liquid-glass-mini hover:scale-110 text-white active:scale-90'
                        }`}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>

                    <div className="flex gap-2">
                        {Array.from({ length: totalPages }).map((_, index) => (
                            <button
                                key={index}
                                onClick={() => goToPage(index)}
                                className={`h-2 rounded-full transition-all duration-300 ${index === renderPage
                                    ? 'bg-white/90 shadow-lg shadow-white/25 w-6'
                                    : 'bg-white/40 hover:bg-white/70 hover:shadow-md hover:shadow-white/20 w-2'
                                }`}
                            />
                        ))}
                    </div>

                    <button
                        onClick={() => goToPage(renderPage + 1)}
                        disabled={renderPage === totalPages - 1}
                        className={`p-1.5 rounded-full transition-all ${renderPage === totalPages - 1
                            ? 'opacity-30 cursor-not-allowed'
                            : 'liquid-glass-mini hover:scale-110 text-white active:scale-90'
                        }`}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            )}

            <EditShortcutModal
                isOpen={!!editingShortcut}
                onClose={() => setEditingShortcut(null)}
                shortcut={editingShortcut}
                onSave={(updated) => {
                    if (updated.type === 'folder') {
                        const newShortcuts = shortcuts.map(s =>
                            s.id === updated.id ? updated : s
                        );
                        onReorder(newShortcuts);
                        if (openFolder && openFolder.id === updated.id) {
                            setOpenFolder(updated);
                        }
                    } else if (openFolder && openFolder.children?.some(c => c.id === updated.id)) {
                        const newChildren = openFolder.children.map(c => c.id === updated.id ? updated : c);
                        const updatedFolder = { ...openFolder, children: newChildren };
                        handleFolderUpdate(updatedFolder);
                    } else {
                        onEditShortcut?.(updated);
                    }
                    setEditingShortcut(null);
                }}
            />

            <FolderModal
                isOpen={isFolderModalOpen}
                onClose={() => setIsFolderModalOpen(false)}
                folder={openFolder}
                onUpdate={handleFolderUpdate}
                onDeleteItem={handleFolderItemDelete}
                onMoveOut={handleFolderItemMoveOut}
                onEditShortcut={setEditingShortcut}
            />
        </DndContext>
    );
};

export default ShortcutGrid;
