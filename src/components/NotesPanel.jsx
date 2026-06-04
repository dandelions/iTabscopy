import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Check, Download, Upload, Search, StickyNote, ClipboardList, Circle, CheckCircle2, PanelLeftClose, PanelLeftOpen, RefreshCw } from 'lucide-react';
import { marked } from 'marked';

const formatTime = (iso) => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString([], {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    } catch {
        return '';
    }
};

const formatShortTime = (iso) => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString([], {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    } catch {
        return '';
    }
};

function TodoRow({ todo, onToggleTodo, onDeleteTodo }) {
    const [isConfirming, setIsConfirming] = useState(false);

    useEffect(() => {
        if (!isConfirming) return undefined;
        const timer = setTimeout(() => setIsConfirming(false), 2500);
        return () => clearTimeout(timer);
    }, [isConfirming]);

    return (
        <div className={`rounded-xl border border-white/10 bg-white/5 p-4 transition ${todo.completed ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-3">
                <button
                    type="button"
                    onClick={() => onToggleTodo?.(todo.id)}
                    className={`mt-0.5 rounded-full transition hover:scale-110 active:scale-95 ${todo.completed ? 'text-green-400' : 'text-white/60 hover:text-white'}`}
                    title={todo.completed ? '标记为未完成' : '标记为完成'}
                >
                    {todo.completed ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                </button>
                <div className="min-w-0 flex-1">
                    <div className={`text-sm leading-6 ${todo.completed ? 'text-white/50 line-through' : 'text-white/90'}`}>
                        {todo.text}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/40">
                        <span>创建: {formatTime(todo.createdAt)}</span>
                        {todo.completedAt && <span>完成: {formatTime(todo.completedAt)}</span>}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        if (isConfirming) {
                            onDeleteTodo?.(todo.id);
                        } else {
                            setIsConfirming(true);
                        }
                    }}
                    className={`rounded-lg p-2 transition hover:scale-110 active:scale-95 ${
                        isConfirming
                            ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                            : 'text-white/50 hover:bg-red-500/10 hover:text-red-400'
                    }`}
                    title={isConfirming ? '确认删除' : '删除待办'}
                >
                    {isConfirming ? <Check className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                </button>
            </div>
        </div>
    );
}

export default function NotesPanel({
  notes = [],
  activeNoteId,
  onSelectNote,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
  onImportNotes,
  todos = [],
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  onRefreshFromCloud,
  isOpen,
  onOpenChange,
}) {
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeSection, setActiveSection] = useState('notes');
    const [todoInput, setTodoInput] = useState('');
    const [isSidebarHidden, setIsSidebarHidden] = useState(false);
    const [refreshState, setRefreshState] = useState('idle');
    const activeNote = useMemo(() => notes.find(n => n.id === activeNoteId) || null, [notes, activeNoteId]);
    const activeNoteContent = activeNote?.content || '';
    const activeTodos = useMemo(() => todos.filter(todo => !todo.completed), [todos]);
    const completedTodos = useMemo(() => todos.filter(todo => todo.completed), [todos]);

    const filteredNotes = useMemo(() => {
        if (!searchQuery.trim()) return notes;
        const query = searchQuery.toLowerCase();
        return notes.filter(note =>
            (note.title || '').toLowerCase().includes(query) ||
            (note.content || '').toLowerCase().includes(query)
        );
    }, [notes, searchQuery]);

    marked.setOptions({
        breaks: true,
        gfm: true,
    });

    const renderedContent = useMemo(() => {
        if (!activeNoteContent) return '';
        return marked.parse(activeNoteContent);
    }, [activeNoteContent]);

    const handleExportNotes = () => {
        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            notes: notes
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notes-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleImportNotes = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                if (!data.notes || !Array.isArray(data.notes)) {
                    alert('无效的笔记备份文件格式');
                    return;
                }

                const isValid = data.notes.every(note =>
                    note.id &&
                    typeof note.title === 'string' &&
                    typeof note.content === 'string'
                );

                if (!isValid) {
                    alert('笔记数据格式不正确');
                    return;
                }

                const existingIds = new Set(notes.map(n => n.id));
                const newNotes = data.notes.filter(note => !existingIds.has(note.id));

                if (newNotes.length === 0) {
                    alert('没有新的笔记需要导入');
                    return;
                }

                if (onImportNotes) {
                    onImportNotes(newNotes);
                }
            } catch (error) {
                alert('导入失败：' + error.message);
            }
        };
        input.click();
    };

    const handleTodoSubmit = (e) => {
        e.preventDefault();
        const text = todoInput.trim();
        if (!text) return;
        onAddTodo?.(text);
        setTodoInput('');
    };

    const handleRefreshFromCloud = async () => {
        if (!onRefreshFromCloud || refreshState === 'loading') return;
        setRefreshState('loading');
        try {
            await onRefreshFromCloud();
            setRefreshState('success');
        } catch (error) {
            console.error('Failed to refresh notes from cloud:', error);
            setRefreshState('error');
        } finally {
            setTimeout(() => setRefreshState('idle'), 1500);
        }
    };

    const renderRefreshButton = (className = '') => (
        <button
            type="button"
            onClick={handleRefreshFromCloud}
            disabled={!onRefreshFromCloud || refreshState === 'loading'}
            className={`p-2 rounded-full hover:bg-white/10 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                refreshState === 'success'
                    ? 'text-green-400'
                    : refreshState === 'error'
                        ? 'text-red-400'
                        : 'text-white/70 hover:text-white'
            } ${className}`}
            title="从 CF 拉取最新数据"
        >
            <RefreshCw className={`h-4 w-4 ${refreshState === 'loading' ? 'animate-spin' : ''}`} />
        </button>
    );

    useEffect(() => {
        if (isOpen && activeSection === 'notes' && !activeNote && notes[0]) {
            onSelectNote?.(notes[0].id);
        }
    }, [isOpen, activeSection, activeNote, notes, onSelectNote]);

    useEffect(() => {
        const timer = setTimeout(() => setIsConfirmingDelete(false), 0);
        return () => clearTimeout(timer);
    }, [activeNoteId]);

    useEffect(() => {
        if (isConfirmingDelete) {
            const timer = setTimeout(() => setIsConfirmingDelete(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [isConfirmingDelete]);

    return (
        <div className={`fixed inset-0 z-40 transition-all duration-300 ${isOpen ? 'visible' : 'invisible'}`}>
            <div
                className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={() => onOpenChange?.(false)}
            />
            <div
                className={`absolute top-0 right-0 h-full w-full max-w-full overflow-hidden bg-white/10 backdrop-blur-2xl border-l border-white/15 shadow-2xl flex rounded-none sm:top-2 sm:right-2 sm:h-[calc(100%-1rem)] sm:w-[min(920px,calc(100vw-1rem))] sm:rounded-2xl md:top-0 md:right-0 md:h-full md:rounded-l-2xl transform transition-transform duration-300 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                <div className={`${isSidebarHidden ? 'hidden' : 'absolute inset-y-0 left-0 z-20 flex w-[min(18rem,85vw)] flex-col sm:relative sm:z-auto sm:w-72'} shrink-0 border-r border-white/10 bg-black/60 backdrop-blur-2xl sm:bg-black/20`}>
                    <div className="px-4 py-4 border-b border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-white">笔记中心</h3>
                            <div className="flex items-center gap-1">
                                {renderRefreshButton()}
                                <button
                                    onClick={() => setIsSidebarHidden(true)}
                                    className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition"
                                    title="隐藏左侧栏"
                                >
                                    <PanelLeftClose className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => onOpenChange?.(false)}
                                    className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition md:hidden"
                                    title="关闭"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 rounded-xl bg-black/20 p-1">
                            <button
                                type="button"
                                onClick={() => setActiveSection('notes')}
                                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs transition ${activeSection === 'notes' ? 'bg-white/15 text-white shadow' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
                            >
                                <StickyNote className="h-4 w-4" />
                                笔记
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveSection('todos')}
                                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs transition ${activeSection === 'todos' ? 'bg-white/15 text-white shadow' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
                            >
                                <ClipboardList className="h-4 w-4" />
                                待办
                            </button>
                        </div>

                        {activeSection === 'notes' ? (
                            <>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleImportNotes}
                                        className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                                        title="导入笔记"
                                    >
                                        <Upload className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={handleExportNotes}
                                        className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                                        title="导出笔记"
                                    >
                                        <Download className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={onAddNote}
                                        className="ml-auto p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition flex items-center gap-1 text-sm"
                                    >
                                        <Plus className="h-4 w-4" />
                                        新建
                                    </button>
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                                    <input
                                        type="text"
                                        placeholder="搜索笔记..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-lg py-2 pl-10 pr-3 text-white text-sm placeholder-white/40 focus:outline-none focus:border-white/30 transition-colors"
                                    />
                                </div>
                            </>
                        ) : (
                            <form onSubmit={handleTodoSubmit} className="space-y-2">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={todoInput}
                                        onChange={(e) => setTodoInput(e.target.value)}
                                        placeholder="添加一个待办..."
                                        className="min-w-0 flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/40 focus:outline-none focus:border-white/30 transition-colors"
                                    />
                                    <button
                                        type="submit"
                                        className="rounded-lg bg-white/10 px-3 py-2 text-white transition hover:bg-white/20"
                                        title="添加待办"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </div>
                                <div className="text-xs text-white/45">
                                    {activeTodos.length} 个未完成 · {completedTodos.length} 个已完成
                                </div>
                            </form>
                        )}
                    </div>

                    <div className="overflow-y-auto max-h-[calc(100%-60px)]" onWheel={(e) => e.stopPropagation()}>
                        {activeSection === 'notes' ? (
                            <>
                                {notes.length === 0 && (
                                    <div className="p-4 text-xs text-white/50">暂无笔记，点击“新建”开始。</div>
                                )}
                                {searchQuery && filteredNotes.length === 0 && (
                                    <div className="p-4 text-xs text-white/50">未找到匹配的笔记</div>
                                )}
                                {filteredNotes.map((note) => (
                                    <button
                                        key={note.id}
                                        onClick={() => onSelectNote?.(note.id)}
                                        className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/10 transition flex flex-col gap-1 ${note.id === activeNoteId ? 'bg-white/10' : ''}`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm text-white truncate">{note.title || '未命名笔记'}</span>
                                            <span className="text-[10px] text-white/40 whitespace-nowrap">{formatShortTime(note.updatedAt)}</span>
                                        </div>
                                        <span className="text-xs text-white/50 truncate">
                                            {(note.content || '').split('\n').find(l => l.trim() !== '') || '空白'}
                                        </span>
                                    </button>
                                ))}
                            </>
                        ) : (
                            <div className="p-3 space-y-2">
                                {todos.length === 0 ? (
                                    <div className="p-4 text-xs text-white/50">暂无待办，先添加一个任务吧。</div>
                                ) : (
                                    todos.map((todo) => (
                                        <button
                                            key={todo.id}
                                            type="button"
                                            onClick={() => onToggleTodo?.(todo.id)}
                                            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition hover:bg-white/10"
                                        >
                                            <div className={`text-sm truncate ${todo.completed ? 'text-white/45 line-through' : 'text-white/85'}`}>
                                                {todo.text}
                                            </div>
                                            <div className="mt-1 text-[10px] text-white/35">{formatShortTime(todo.createdAt)}</div>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {activeSection === 'notes' ? (
                    <div className="min-w-0 flex-1 flex flex-col">
                        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5 border-b border-white/10 bg-white/5">
                            <div className="flex min-w-0 items-start gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsSidebarHidden(prev => !prev)}
                                    className="shrink-0 p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition"
                                    title={isSidebarHidden ? '显示左侧栏' : '隐藏左侧栏'}
                                >
                                    {isSidebarHidden ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                                </button>
                                <div className="min-w-0">
                                    <div className="truncate text-white font-semibold text-lg">{activeNote?.title || '未命名笔记'}</div>
                                    {activeNote && (
                                        <div className="truncate text-[11px] text-white/40">
                                            更新: {formatTime(activeNote.updatedAt)} · 创建: {formatTime(activeNote.createdAt)}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                {renderRefreshButton()}
                                {activeNote && (
                                    <button
                                        onClick={() => {
                                            if (isConfirmingDelete) {
                                                onDeleteNote?.(activeNote.id);
                                                setIsConfirmingDelete(false);
                                            } else {
                                                setIsConfirmingDelete(true);
                                            }
                                        }}
                                        className={`p-2 rounded-lg transition ${
                                            isConfirmingDelete
                                                ? 'text-red-500 bg-red-500/10 hover:bg-red-500/20'
                                                : 'text-white/70 hover:text-red-400 hover:bg-red-500/10'
                                        }`}
                                        title={isConfirmingDelete ? '确认删除' : '删除笔记'}
                                    >
                                        {isConfirmingDelete ? <Check className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                                    </button>
                                )}
                                <button
                                    onClick={() => onOpenChange?.(false)}
                                    className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition"
                                    title="关闭"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        <div className="min-w-0 flex-1 flex overflow-hidden">
                            <div className={`${showPreview ? 'w-1/2 min-w-0 border-r border-white/10' : 'w-full min-w-0'} flex flex-col`}>
                                <div className="flex items-center justify-between px-5 py-2 border-b border-white/10 bg-white/5">
                                    <span className="text-xs text-white/50">编辑</span>
                                    <button
                                        onClick={() => setShowPreview(!showPreview)}
                                        className="px-3 py-1 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition"
                                    >
                                        {showPreview ? '隐藏预览' : '显示预览'}
                                    </button>
                                </div>
                                <textarea
                                    value={activeNote?.content || ''}
                                    onChange={(e) => activeNote && onUpdateNote?.(activeNote.id, e.target.value)}
                                    className="min-w-0 flex-1 bg-transparent text-white/90 p-4 outline-none resize-none text-sm leading-6 placeholder-white/30 font-mono sm:p-5"
                                    placeholder="开始记录你的笔记... 支持 Markdown 语法"
                                />
                            </div>

                            {showPreview && (
                                <div className="w-1/2 min-w-0 flex flex-col">
                                    <div className="flex items-center justify-between px-5 py-2 border-b border-white/10 bg-white/5">
                                        <span className="text-xs text-white/50">预览</span>
                                        <div className="h-[27px]"></div>
                                    </div>
                                    <div
                                        className="min-w-0 flex-1 overflow-auto p-4 sm:p-5"
                                        onWheel={(e) => e.stopPropagation()}
                                    >
                                        <div
                                            className="markdown-preview text-sm leading-6"
                                            dangerouslySetInnerHTML={{ __html: renderedContent }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="min-w-0 flex-1 flex flex-col">
                        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5 border-b border-white/10 bg-white/5">
                            <div className="flex min-w-0 items-start gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsSidebarHidden(prev => !prev)}
                                    className="shrink-0 p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition"
                                    title={isSidebarHidden ? '显示左侧栏' : '隐藏左侧栏'}
                                >
                                    {isSidebarHidden ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                                </button>
                                <div className="min-w-0">
                                    <div className="truncate text-white font-semibold text-lg">待办列表</div>
                                    <div className="truncate text-[11px] text-white/40">
                                        和笔记共用同一个侧边面板，任务数据仍会参与同步与导入导出。
                                    </div>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                {renderRefreshButton()}
                                <button
                                    onClick={() => onOpenChange?.(false)}
                                    className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition"
                                    title="关闭"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                        <div className="min-w-0 flex-1 overflow-auto p-4 sm:p-5" onWheel={(e) => e.stopPropagation()}>
                            <form onSubmit={handleTodoSubmit} className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <input
                                        type="text"
                                        value={todoInput}
                                        onChange={(e) => setTodoInput(e.target.value)}
                                        placeholder="添加一个新的待办事项..."
                                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-sm text-white placeholder-white/40 outline-none transition focus:border-white/30"
                                    />
                                    <button
                                        type="submit"
                                        className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/20 active:scale-95"
                                    >
                                        <Plus className="h-4 w-4" />
                                        添加
                                    </button>
                                </div>
                            </form>

                            {todos.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-white/50">
                                    暂无待办事项。
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <section>
                                        <div className="mb-3 flex items-center justify-between">
                                            <h4 className="text-sm font-semibold text-white">未完成</h4>
                                            <span className="text-xs text-white/45">{activeTodos.length}</span>
                                        </div>
                                        {activeTodos.length === 0 ? (
                                            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/45">全部完成啦。</div>
                                        ) : (
                                            <div className="space-y-3">
                                                {activeTodos.map((todo) => (
                                                    <TodoRow key={todo.id} todo={todo} onToggleTodo={onToggleTodo} onDeleteTodo={onDeleteTodo} />
                                                ))}
                                            </div>
                                        )}
                                    </section>

                                    {completedTodos.length > 0 && (
                                        <section>
                                            <div className="mb-3 flex items-center justify-between">
                                                <h4 className="text-sm font-semibold text-white/70">已完成</h4>
                                                <span className="text-xs text-white/45">{completedTodos.length}</span>
                                            </div>
                                            <div className="space-y-3">
                                                {completedTodos.map((todo) => (
                                                    <TodoRow key={todo.id} todo={todo} onToggleTodo={onToggleTodo} onDeleteTodo={onDeleteTodo} />
                                                ))}
                                            </div>
                                        </section>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
