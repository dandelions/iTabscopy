import React, { useState } from 'react';
import { GripVertical, Edit2, Trash2 } from 'lucide-react';
import { getIconUrl } from '../utils/icons';
import EditShortcutModal from './EditShortcutModal';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SortableShortcutRow = ({ shortcut, onEdit, onRemove }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: shortcut.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const icons = getIconUrl(shortcut.url);
    const iconSrc = shortcut.customIcon?.type === 'custom'
        ? shortcut.customIcon.data
        : (shortcut.customIcon?.url || icons?.clearbit);

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
        >
            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-white/40 hover:text-white/60"
            >
                <GripVertical className="h-5 w-5" />
            </div>

            {/* Icon */}
            <div className="w-10 h-10 rounded-lg bg-white overflow-hidden shrink-0">
                <img
                    src={iconSrc}
                    alt={shortcut.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.classList.add('bg-blue-500');
                        e.target.parentElement.innerHTML = `<span class="text-sm font-bold text-white flex items-center justify-center h-full">${shortcut.title[0].toUpperCase()}</span>`;
                    }}
                />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{shortcut.title}</div>
                <div className="text-xs text-white/50 truncate">{shortcut.url}</div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                <button
                    onClick={() => onEdit(shortcut)}
                    className="p-2 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    title="Edit"
                >
                    <Edit2 className="h-4 w-4" />
                </button>
                <button
                    onClick={() => onRemove(shortcut.id)}
                    className="p-2 rounded-lg hover:bg-red-500/20 text-white/60 hover:text-red-400 transition-colors"
                    title="Delete"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};

const ShortcutManager = ({ shortcuts, onReorder, onRemove, onEdit }) => {
    const [editingShortcut, setEditingShortcut] = useState(null);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;

        if (active.id !== over.id) {
            const oldIndex = shortcuts.findIndex(s => s.id === active.id);
            const newIndex = shortcuts.findIndex(s => s.id === over.id);
            const newShortcuts = arrayMove(shortcuts, oldIndex, newIndex);
            onReorder(newShortcuts);
        }
    };

    const handleEdit = (shortcut) => {
        setEditingShortcut(shortcut);
    };

    const handleSave = (updatedShortcut) => {
        onEdit(updatedShortcut);
        setEditingShortcut(null);
    };

    if (shortcuts.length === 0) {
        return (
            <div className="text-center py-8 text-white/40 text-sm">
                还没有快捷方式。在上方添加一个开始使用。
            </div>
        );
    }

    return (
        <>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={shortcuts.map(s => s.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-2">
                        {shortcuts.map((shortcut) => (
                            <SortableShortcutRow
                                key={shortcut.id}
                                shortcut={shortcut}
                                onEdit={handleEdit}
                                onRemove={onRemove}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>

            <EditShortcutModal
                isOpen={!!editingShortcut}
                onClose={() => setEditingShortcut(null)}
                shortcut={editingShortcut}
                onSave={handleSave}
            />
        </>
    );
};

export default ShortcutManager;
