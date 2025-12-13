import { useState } from 'react';
import { X, Download, Upload, Check, AlertCircle } from 'lucide-react';

const DataManagement = ({ isOpen, onClose, onExport, onImport }) => {
    const [importFile, setImportFile] = useState(null);
    const [message, setMessage] = useState({ type: '', text: '' });

    const handleExport = () => {
        try {
            onExport();
            setMessage({ type: 'success', text: '数据导出成功！' });
            setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        } catch (error) {
            setMessage({ type: 'error', text: '导出失败：' + error.message });
        }
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.type === 'application/json') {
                setImportFile(file);
                setMessage({ type: '', text: '' });
            } else {
                setMessage({ type: 'error', text: '请选择 JSON 文件' });
                e.target.value = ''; // 清空无效文件选择
            }
        }
    };

    const handleImport = async () => {
        if (!importFile) {
            setMessage({ type: 'error', text: '请先选择文件' });
            return;
        }

        try {
            const text = await importFile.text();
            const data = JSON.parse(text);
            onImport(data);
            setMessage({ type: 'success', text: '数据导入成功！' });
            setImportFile(null);
            // 清空文件输入，允许重新选择相同文件
            const fileInput = document.getElementById('import-file');
            if (fileInput) {
                fileInput.value = '';
            }
            setTimeout(() => setMessage({ type: '', text: '' }), 3000);
        } catch (error) {
            setMessage({ type: 'error', text: '导入失败：' + error.message });
        }
    };

    return (
        <div className={`fixed inset-0 z-50 transition-all duration-300 ${isOpen ? 'visible' : 'invisible'}`}>
            {/* Backdrop */}
            <div
                className={`absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
                onClick={onClose}
            />

            {/* Drawer Panel */}
            <div
                className={`absolute top-0 right-0 h-full w-[380px] bg-white/10 backdrop-blur-2xl border-l border-white/20 shadow-2xl transform transition-transform duration-300 ease-out flex flex-col rounded-l-2xl overflow-hidden ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <h2 className="text-xl font-semibold text-white tracking-tight">数据管理</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                        title="关闭"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Content */}
                <div 
                    className="flex-1 p-6 overflow-y-auto space-y-6"
                    onWheel={(e) => e.stopPropagation()}
                >
                    {/* Export Section */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-medium text-white">导出数据</h3>
                        <p className="text-sm text-white/60">
                            导出所有数据到 JSON 文件，包括：待办事项、笔记、快捷方式和设置。
                        </p>
                        <button
                            onClick={handleExport}
                            className="w-full px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400/50 text-white hover:text-blue-400 transition-all flex items-center justify-center gap-2"
                        >
                            <Download className="h-5 w-5" />
                            <span>导出数据</span>
                        </button>
                    </div>

                    {/* Import Section */}
                    <div className="space-y-4 pt-6 border-t border-white/10">
                        <h3 className="text-lg font-medium text-white">导入数据</h3>
                        <p className="text-sm text-white/60">
                            从 JSON 文件导入数据。注意：导入将覆盖当前所有数据。
                        </p>
                        
                        <div className="space-y-3">
                            <label className="block">
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    id="import-file"
                                />
                                <label
                                    htmlFor="import-file"
                                    className="cursor-pointer w-full px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 text-white transition-all flex items-center justify-center gap-2"
                                >
                                    <Upload className="h-5 w-5" />
                                    <span>{importFile ? importFile.name : '选择文件'}</span>
                                </label>
                            </label>

                            {importFile && (
                                <button
                                    onClick={handleImport}
                                    className="w-full px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-green-400/50 text-white hover:text-green-400 transition-all flex items-center justify-center gap-2"
                                >
                                    <Check className="h-5 w-5" />
                                    <span>确认导入</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Message */}
                    {message.text && (
                        <div className={`p-4 rounded-lg bg-white/5 border ${
                            message.type === 'success' 
                                ? 'border-green-400/50 text-green-400' 
                                : 'border-red-400/50 text-red-400'
                        } flex items-start gap-3`}>
                            {message.type === 'success' ? (
                                <Check className="h-5 w-5 shrink-0 mt-0.5" />
                            ) : (
                                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                            )}
                            <span className="text-sm">{message.text}</span>
                        </div>
                    )}

                    {/* Info Section */}
                    <div className="pt-6 border-t border-white/10 space-y-3">
                        <h3 className="text-lg font-medium text-white">导出内容说明</h3>
                        <ul className="text-sm text-white/60 space-y-2">
                            <li className="flex items-start gap-2">
                                <span className="text-blue-400 mt-1">•</span>
                                <span>待办列表：所有任务及其状态</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-blue-400 mt-1">•</span>
                                <span>笔记：所有笔记内容和标题</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-blue-400 mt-1">•</span>
                                <span>快捷方式：所有网站快捷标签和文件夹</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-blue-400 mt-1">•</span>
                                <span>设置项：网格配置、背景设置等</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DataManagement;
