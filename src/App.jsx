import { useState, useEffect, useCallback, useRef } from 'react';
import Layout from './components/Layout';
import SearchBar from './components/SearchBar';
import Settings from './components/Settings';
import ShortcutGrid from './components/ShortcutGrid';
import NotesPanel from './components/NotesPanel';
import DataManagement from './components/DataManagement';
import { Toast } from './components/Toast';
import { Settings as SettingsIcon, Cloud, StickyNote, Plus, Database, Menu } from 'lucide-react';

// 触摸测试工具（开发环境使用）
if (import.meta.env.DEV) {
  import('./utils/touchTestTool').then(module => {
    console.log('%c📱 触摸测试工具已加载！', 'color: #3b82f6; font-size: 16px; font-weight: bold;');
    console.log('运行 %cnew TouchTestTool().createUI()', 'color: #10b981; font-family: monospace;', '在控制台启动测试面板');
    window.TouchTestTool = module.TouchTestTool;
  });
}

import { fetchRandomPhoto, cacheImage } from './utils/unsplash';
import { removeIconFromCache } from './utils/icons';
import syncService from './services/syncService';

const DEFAULT_BG_URL = 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=2070&auto=format&fit=crop';

function App() {
  // 动态更新视口高度
  useEffect(() => {
    const updateViewportHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    return () => window.removeEventListener('resize', updateViewportHeight);
  }, []);

  const [bgUrl, setBgUrl] = useState(localStorage.getItem('bg_url') || DEFAULT_BG_URL);
  const [gridConfig, setGridConfig] = useState(() => {
    const saved = localStorage.getItem('grid_config');
    return saved ? JSON.parse(saved) : { cols: 8, rows: 4, iconSize: 80, showSearchBar: true };
  });
  const [bgConfig, setBgConfig] = useState(() => {
    const saved = localStorage.getItem('bg_config');
    return saved ? JSON.parse(saved) : { blur: 2, overlay: 30 };
  });

  // 👍 修复位置 1：通过惰性加载，彻底移除了后续 Effect 中对 setShortcuts 的同步调用
  const [shortcuts, setShortcuts] = useState(() => {
    const saved = localStorage.getItem('shortcuts');
    if (saved) {
      return JSON.parse(saved);
    } else {
      const defaults = [{ id: 1, title: 'Google', url: 'https://google.com' }];
      localStorage.setItem('shortcuts', JSON.stringify(defaults));
      return defaults;
    }
  });

  const [isDivVisible, setDivVisible] = useState(false);
  const menuRef = useRef(null);

  const handleToggleDiv = () => setDivVisible(!isDivVisible);

  const handleClickOutside = (event) => {
    if (menuRef.current && !menuRef.current.contains(event.target)) {
      setDivVisible(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [settingsTrigger, setSettingsTrigger] = useState(null);

  const [todos, setTodos] = useState(() => {
    const saved = localStorage.getItem('todos');
    return saved ? JSON.parse(saved) : [];
  });
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('notes');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isDataManagementOpen, setIsDataManagementOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isLoggedIn, setIsLoggedIn] = useState(syncService.isLoggedIn());

  const isPullingRef = useRef(false);

  const updateLocalTimestamp = () => {
    localStorage.setItem('last_local_update', String(Date.now()));
  };

  const createBackupData = useCallback(() => syncService.createBackupData({
    todos,
    notes,
    shortcuts,
    gridConfig,
    bgConfig,
    bgUrl
  }), [todos, notes, shortcuts, gridConfig, bgConfig, bgUrl]);

  useEffect(() => {
    const raw = localStorage.getItem('last_local_update');
    if (raw !== null) {
      const numeric = Number(raw);
      if (!Number.isFinite(numeric)) {
        const parsed = Date.parse(raw);
        if (Number.isFinite(parsed)) {
          localStorage.setItem('last_local_update', String(parsed));
        } else {
          localStorage.removeItem('last_local_update');
        }
      }
    }
  }, []);

  const pullFromCloud = useCallback(async () => {
    if (!syncService.isLoggedIn()) return;

    try {
      isPullingRef.current = true;
      const cloudData = await syncService.pullData();
      if (!cloudData) {
        isPullingRef.current = false;
        return;
      }

      const lastRaw = localStorage.getItem('last_local_update');
      const lastLocalUpdate = lastRaw !== null && Number.isFinite(Number(lastRaw)) ? Number(lastRaw) : null;
      const cloudUpdatedAt = Number.isFinite(Number(cloudData.updatedAt)) ? Number(cloudData.updatedAt) : null;

      const shouldApplyCloud = cloudUpdatedAt ? (!lastLocalUpdate || cloudUpdatedAt > lastLocalUpdate) : !lastLocalUpdate;

      if (shouldApplyCloud) {
        let updated = false;

        if (cloudData.shortcuts) {
          setShortcuts(cloudData.shortcuts);
          localStorage.setItem('shortcuts', JSON.stringify(cloudData.shortcuts));
          updated = true;
        }
        if (cloudData.gridConfig) {
          setGridConfig(cloudData.gridConfig);
          localStorage.setItem('grid_config', JSON.stringify(cloudData.gridConfig));
          updated = true;
        }
        if (cloudData.bgConfig) {
          setBgConfig(cloudData.bgConfig);
          localStorage.setItem('bg_config', JSON.stringify(cloudData.bgConfig));
          updated = true;
        }
        if (cloudData.bgUrl) {
          setBgUrl(cloudData.bgUrl);
          localStorage.setItem('bg_url', cloudData.bgUrl);
          updated = true;
        }
        if (cloudData.todos) {
          setTodos(cloudData.todos);
          localStorage.setItem('todos', JSON.stringify(cloudData.todos));
          updated = true;
        }
        if (cloudData.notes) {
          setNotes(cloudData.notes);
          localStorage.setItem('notes', JSON.stringify(cloudData.notes));
          setActiveNoteId(null);
          updated = true;
        }

        if (updated) {
          if (cloudUpdatedAt) {
            localStorage.setItem('last_local_update', String(cloudUpdatedAt));
          }
        }
      }

      setTimeout(() => { isPullingRef.current = false; }, 100);
    } catch (error) {
      console.error('Failed to pull from cloud:', error);
      isPullingRef.current = false;
    }
  }, []);

  // 👍 修复位置 2：原第 179 行报错的 Effect。通过精简同步赋值并添加微任务隔离彻底修复
  useEffect(() => {
    const timer = setTimeout(() => {
      pullFromCloud();
    }, 0);

    const handleStorageChange = (e) => {
      if (e.key === 'shortcuts' && e.newValue) {
        setShortcuts(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [pullFromCloud]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const checkLoginStatus = () => setIsLoggedIn(syncService.isLoggedIn());
    const interval = setInterval(checkLoginStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAddShortcut = (newShortcut) => {
    const updated = [...shortcuts, newShortcut];
    setShortcuts(updated);
    localStorage.setItem('shortcuts', JSON.stringify(updated));
    updateLocalTimestamp();
  };

  const handleRemoveShortcut = (id) => {
    const target = shortcuts.find(s => s.id === id);
    if (target) removeIconFromCache(target);
    const updated = shortcuts.filter(s => s.id !== id);
    setShortcuts(updated);
    localStorage.setItem('shortcuts', JSON.stringify(updated));
    updateLocalTimestamp();
  };

  const handleEditShortcut = (updatedShortcut) => {
    const newShortcuts = shortcuts.map(s => s.id === updatedShortcut.id ? updatedShortcut : s);
    setShortcuts(newShortcuts);
    localStorage.setItem('shortcuts', JSON.stringify(newShortcuts));
    updateLocalTimestamp();
  };

  const handleReorderShortcuts = (newShortcuts) => {
    setShortcuts(newShortcuts);
    localStorage.setItem('shortcuts', JSON.stringify(newShortcuts));
    updateLocalTimestamp();
  };

  const handleBgConfigChange = (newConfig) => {
    setBgConfig(prev => {
      const updated = { ...prev, ...newConfig };
      localStorage.setItem('bg_config', JSON.stringify(updated));
      updateLocalTimestamp();
      return updated;
    });
  };

  const handleConfigChange = (newConfig) => {
    setGridConfig(prev => {
      const updated = { ...prev, ...newConfig };
      localStorage.setItem('grid_config', JSON.stringify(updated));
      updateLocalTimestamp();
      return updated;
    });
  };

  useEffect(() => {
    const loadBackground = async () => {
      const lastFetch = localStorage.getItem('bg_last_fetch');
      const today = new Date().toDateString();
      const currentBg = localStorage.getItem('bg_url') || DEFAULT_BG_URL;
      const isUsingBing = currentBg.includes('bing.com');

      if (lastFetch !== today) {
        if (isUsingBing) {
          try {
            const baseUrl = syncService.getWorkerUrl();
            if (baseUrl) {
              const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/bing`);
              if (response.ok) {
                const data = await response.json();
                if (data && data.url) {
                  setBgUrl(data.url);
                  localStorage.setItem('bg_url', data.url);
                  localStorage.setItem('bg_last_fetch', today);
                  return;
                }
              }
            }
          } catch (error) {
            console.error('自动刷新必应壁纸失败:', error);
          }
        }

        const photo = await fetchRandomPhoto();
        if (photo) {
          setBgUrl(photo.url);
          localStorage.setItem('bg_url', photo.url);
          localStorage.setItem('bg_last_fetch', today);
          cacheImage(photo.url);
        }
      }
    };

    loadBackground();
  }, []);

  useEffect(() => {
    const preventBrowserGesture = (e) => {
      if (Math.abs(e.deltaX) > 0) e.preventDefault();
    };
    window.addEventListener('wheel', preventBrowserGesture, { passive: false });
    return () => window.removeEventListener('wheel', preventBrowserGesture);
  }, []);

  useEffect(() => {
    if (!syncService.isLoggedIn() || isPullingRef.current) return;
    const syncData = async () => {
      try {
        const data = { shortcuts, gridConfig, bgConfig, bgUrl, todos, notes };
        const result = await syncService.pushData(data);
        if (result && result.updatedAt) {
          const numeric = Number(result.updatedAt);
          if (Number.isFinite(numeric)) localStorage.setItem('last_local_update', String(numeric));
        }
      } catch (error) {
        console.error('Auto-sync failed:', error);
      }
    };
    const timeoutId = setTimeout(syncData, 2000);
    return () => clearTimeout(timeoutId);
  }, [shortcuts, gridConfig, bgConfig, bgUrl, todos, notes]);

  useEffect(() => {
    if (!syncService.shouldAutoSyncWebDav() || isPullingRef.current) return;
    const syncData = async () => {
      try {
        await syncService.uploadBackupToWebDav(createBackupData());
      } catch (error) {
        console.error('WebDAV auto-sync failed:', error);
      }
    };
    const timeoutId = setTimeout(syncData, 3000);
    return () => clearTimeout(timeoutId);
  }, [createBackupData]);

  useEffect(() => { localStorage.setItem('todos', JSON.stringify(todos)); }, [todos]);

  useEffect(() => {
    localStorage.setItem('notes', JSON.stringify(notes));
    const timer = setTimeout(() => {
      if (notes.length > 0 && !activeNoteId) {
        setActiveNoteId(notes[0].id);
      } else if (activeNoteId && !notes.some(n => n.id === activeNoteId)) {
        setActiveNoteId(notes[0]?.id || null);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [notes, activeNoteId]);

  const handleAddTodo = (text) => {
    const newTodo = { id: Date.now(), text, completed: false, createdAt: new Date().toISOString(), completedAt: null };
    setTodos(prev => [newTodo, ...prev]);
    updateLocalTimestamp();
  };

  const handleToggleTodo = (id) => {
    setTodos(prev => prev.map(todo => {
      if (todo.id !== id) return todo;
      const completed = !todo.completed;
      return { ...todo, completed, completedAt: completed ? new Date().toISOString() : null };
    }));
    updateLocalTimestamp();
  };

  const handleDeleteTodo = (id) => {
    setTodos(prev => prev.filter(todo => todo.id !== id));
    updateLocalTimestamp();
  };

  const handleAddNote = () => {
    const newNote = { id: Date.now(), title: '未命名笔记', content: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setNotes(prev => [newNote, ...prev]);
    setActiveNoteId(newNote.id);
    setIsNotesOpen(true);
    updateLocalTimestamp();
  };

  const handleUpdateNote = (id, content) => {
    setNotes(prev => prev.map(note => {
      if (note.id !== id) return note;
      const firstLine = content.split('\n').find(line => line.trim() !== '') || '未命名笔记';
      return { ...note, content, title: firstLine.slice(0, 40), updatedAt: new Date().toISOString() };
    }));
    updateLocalTimestamp();
  };

  const handleDeleteNote = (id) => {
    setNotes(prev => prev.filter(note => note.id !== id));
    if (activeNoteId === id) setActiveNoteId(null);
    updateLocalTimestamp();
  };

  const handleSelectNote = (id) => {
    setActiveNoteId(id);
    setIsNotesOpen(true);
  };

  const handleImportNotes = (importedNotes) => {
    if (!Array.isArray(importedNotes)) throw new Error('无效的笔记数据');
    const existingIds = new Set(notes.map(n => n.id));
    const newNotes = importedNotes.filter(note => !existingIds.has(note.id));
    if (newNotes.length === 0) {
      setToast({ message: '没有新的笔记需要导入', type: 'error' });
      return 0;
    }
    const allNotes = [...notes, ...newNotes];
    setNotes(allNotes);
    localStorage.setItem('notes', JSON.stringify(allNotes));
    updateLocalTimestamp();
    setToast({ message: `成功导入 ${newNotes.length} 条笔记`, type: 'success' });
    return newNotes.length;
  };

  const handleExportData = () => {
    const data = createBackupData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `newtab-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSyncBackupToWebDav = async () => {
    const result = await syncService.uploadBackupToWebDav(createBackupData());
    setToast({ message: `备份已同步到 WebDAV：${result.fileName}`, type: 'success' });
    return result;
  };

  const handleImportData = (data) => {
    if (!data || typeof data !== 'object') throw new Error('无效的数据格式');
    const hasValidData =
        (data.todos && Array.isArray(data.todos)) || (data.notes && Array.isArray(data.notes)) ||
        (data.shortcuts && Array.isArray(data.shortcuts)) || (data.gridConfig && typeof data.gridConfig === 'object') ||
        (data.bgConfig && typeof data.bgConfig === 'object') || (data.bgUrl && typeof data.bgUrl === 'string');

    if (!hasValidData) throw new Error('文件不包含有效的备份数据。');

    let importedCount = 0;
    if (data.todos && Array.isArray(data.todos)) { setTodos(data.todos); localStorage.setItem('todos', JSON.stringify(data.todos)); importedCount++; }
    if (data.notes && Array.isArray(data.notes)) { setNotes(data.notes); localStorage.setItem('notes', JSON.stringify(data.notes)); setActiveNoteId(null); importedCount++; }
    if (data.shortcuts && Array.isArray(data.shortcuts)) { setShortcuts(data.shortcuts); localStorage.setItem('shortcuts', JSON.stringify(data.shortcuts)); importedCount++; }
    if (data.gridConfig && typeof data.gridConfig === 'object') { setGridConfig(data.gridConfig); localStorage.setItem('grid_config', JSON.stringify(data.gridConfig)); importedCount++; }
    if (data.bgConfig && typeof data.bgConfig === 'object') { setBgConfig(data.bgConfig); localStorage.setItem('bg_config', JSON.stringify(data.bgConfig)); importedCount++; }
    if (data.bgUrl && typeof data.bgUrl === 'string') { setBgUrl(data.bgUrl); localStorage.setItem('bg_url', data.bgUrl); importedCount++; }

    setToast({ message: `数据导入成功！已导入 ${importedCount} 项数据。`, type: 'success' });
  };

  return (
      <Layout backgroundUrl={bgUrl} bgConfig={bgConfig}>
        <Settings
            gridConfig={gridConfig}
            bgConfig={bgConfig}
            onConfigChange={handleConfigChange}
            onBgConfigChange={handleBgConfigChange}
            onBgUpdate={setBgUrl}
            onAddShortcut={handleAddShortcut}
            shortcuts={shortcuts}
            todos={todos}
            notes={notes}
            bgUrl={bgUrl}
            onEditShortcut={handleEditShortcut}
            onRemoveShortcut={handleRemoveShortcut}
            onSyncPull={pullFromCloud}
            triggerTab={settingsTrigger}
            onOpenChange={() => {}}
        />
        <div className="fixed right-6 bottom-6 z-30 flex flex-col items-center gap-3 liquid-glass-fixed rounded-2xl p-3 shadow-xl transition-all ">
          <div ref={menuRef}>
            {isDivVisible && (
                <div className="opacity-100 pointer-events-auto scale-100">
                  <button onClick={() => setSettingsTrigger({ tab: 'shortcuts', at: Date.now() })} className="w-12 h-12 rounded-xl liquid-glass-mini hover:scale-110 hover:border-white/40 text-white flex items-center justify-center transition-all active:scale-95" title="添加"><Plus className="h-5 w-5" /></button>
                  <button onClick={() => setIsNotesOpen(prev => !prev)} className="w-12 h-12 rounded-xl liquid-glass-mini hover:scale-110 hover:border-white/40 text-white flex items-center justify-center transition-all active:scale-95" title="笔记"><StickyNote className="h-5 w-5" /></button>
                  <button onClick={() => setSettingsTrigger({ tab: 'general', at: Date.now() })} className="w-12 h-12 rounded-xl liquid-glass-mini hover:scale-110 hover:border-white/40 text-white flex items-center justify-center transition-all active:scale-95" title="通用"><SettingsIcon className="h-5 w-5" /></button>
                  <button onClick={() => setSettingsTrigger({ tab: 'sync', at: Date.now() })} className="w-12 h-12 rounded-xl liquid-glass-mini hover:scale-110 hover:border-white/40 flex items-center justify-center transition-all active:scale-95" title="同步">
                    <Cloud className={`h-5 w-5 transition-colors ${!isLoggedIn ? 'text-white' : !isOnline ? 'text-red-400' : 'text-green-400'}`} />
                  </button>
                  <button onClick={() => setIsDataManagementOpen(prev => !prev)} className="w-12 h-12 rounded-xl liquid-glass-mini hover:scale-110 hover:border-white/40 text-white flex items-center justify-center transition-all active:scale-95" title="数据管理"><Database className="h-5 w-5" /></button>
                </div>
            )}
            <button onClick={handleToggleDiv} className="w-12 h-12 rounded-xl liquid-glass-mini hover:scale-110 hover:border-white/40 text-white flex items-center justify-center transition-all active:scale-95" title="切换面板"><Menu className="h-5 w-5" /></button>
          </div>
        </div>

        <NotesPanel
          notes={notes}
          activeNoteId={activeNoteId}
          onSelectNote={handleSelectNote}
          onAddNote={handleAddNote}
          onDeleteNote={handleDeleteNote}
          onUpdateNote={handleUpdateNote}
          onImportNotes={handleImportNotes}
          todos={todos}
          onAddTodo={handleAddTodo}
          onToggleTodo={handleToggleTodo}
          onDeleteTodo={handleDeleteTodo}
          isOpen={isNotesOpen}
          onOpenChange={setIsNotesOpen}
        />
        <DataManagement
          isOpen={isDataManagementOpen}
          onClose={() => setIsDataManagementOpen(false)}
          onExport={handleExportData}
          onImport={handleImportData}
          onSyncToWebDav={handleSyncBackupToWebDav}
        />

        <div className="w-full flex flex-col items-center mt-2">
          {gridConfig.showSearchBar && (
              <div className="w-full flex justify-center">
                <div style={{ width: 'clamp(260px, 75vw, 720px)', maxWidth: '75vw', transition: 'max-width 300ms ease, width 300ms ease' }} >
                  <SearchBar />
                </div>
              </div>
          )}

          <ShortcutGrid config={gridConfig} shortcuts={shortcuts} onRemoveShortcut={handleRemoveShortcut} onEditShortcut={handleEditShortcut} onReorder={handleReorderShortcuts} leftOffset={0} />
        </div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </Layout>
  );
}

export default App;
