// 笔记同步合并工具
// 每条笔记都带 updatedAt；删除不直接移除条目，而是留下 deleted 墓碑并更新时间，
// 这样两端同步时可以直接按时间比较，判断「这条是被删除了」还是「这条被更新了」。
export const NOTE_TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const normalizeNoteEntry = (note) => {
    if (!note || typeof note !== 'object') return null;
    if (note.id === undefined || note.id === null || note.id === '') return null;
    const created = Number(note.createdAt) || 0;
    const updated = Number(note.updatedAt) || created || 0;
    // 保留 id 的原始类型：上层用严格相等匹配时，数字 id 不能被悄悄改成字符串
    return {
        ...note,
        createdAt: created || updated,
        updatedAt: updated,
    };
};

// 同一 id 取 updatedAt 较新的那份（删除以墓碑参与比较）
export const mergeNoteLists = (primaryNotes = [], secondaryNotes = []) => {
    const byId = new Map();
    const put = (raw) => {
        const note = normalizeNoteEntry(raw);
        if (!note) return;
        // 用字符串 key 做去重，避免数字 id 与字符串 id 被当成两条
        const key = String(note.id);
        const existing = byId.get(key);
        if (!existing || note.updatedAt >= existing.updatedAt) {
            byId.set(key, note);
        }
    };
    (secondaryNotes || []).forEach(put);
    (primaryNotes || []).forEach(put);
    return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
};

// 仅在上传前清理超期墓碑，读取阶段保留，否则本地回推会抹掉云端墓碑
export const pruneExpiredTombstones = (notes = [], now = Date.now()) => (
    (notes || []).filter((note) => (
        !note?.deleted || (Number(note.updatedAt) || 0) > now - NOTE_TOMBSTONE_TTL_MS
    ))
);

// 对外展示用：去掉墓碑
export const getVisibleNotes = (notes = []) => (
    mergeNoteLists(notes, []).filter((note) => !note.deleted)
);

// 生成删除墓碑
export const buildNoteTombstone = (note, now = Date.now()) => ({
    id: note?.id,
    title: note?.title || '',
    content: '',
    createdAt: Number(note?.createdAt) || now,
    updatedAt: now,
    deleted: true,
});
