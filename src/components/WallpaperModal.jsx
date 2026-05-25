import { useState, useEffect, useCallback } from 'react';
import { X, Upload, Image as ImageIcon, Loader2 } from 'lucide-react';
import { fetchPopularPhotos } from '../utils/unsplash';
import syncService from '../services/syncService'; // 导入同步服务以获取 Worker URL

const CATEGORY_MAP = {
    '必应每日壁纸': 'bing', // ✨ 新增 Bing 映射标识
    '壁纸': 'desktop wallpaper',
    '自然': 'nature',
    '3D渲染': '3d renders',
    '旅行': 'travel',
    '建筑': 'architecture',
    '纹理': 'textures',
    '动物': 'animals',
    '动漫': 'anime',
    '极简': 'minimalist'
};

const CATEGORIES = Object.keys(CATEGORY_MAP);

const WallpaperModal = ({ isOpen, onClose, onSelectWallpaper }) => {
    // State for tabs and photos
    const [activeTab, setActiveTab] = useState('unsplash');
    const [unsplashPhotos, setUnsplashPhotos] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('必应每日壁纸'); // ✨ 默认选中必应

    // ✨ 新增 State：存储必应壁纸的 URL 和版权信息
    const [bingData, setBingData] = useState({ url: '', copyright: '' });

    // ✨ 新增：请求 Worker 代理获取 Bing 壁纸
    const fetchBingWallpaper = async () => {
        try {
            const baseUrl = syncService.getWorkerUrl();
            if (!baseUrl) {
                console.warn('未检测到云同步 Worker URL，请在设置 - 高级设置中配置。');
                return null;
            }
            // 确保 URL 拼接正确
            const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/bing`);
            if (!response.ok) throw new Error('Failed to fetch');
            return await response.json();
        } catch (error) {
            console.error('获取必应壁纸失败:', error);
            return null;
        }
    };

    const loadUnsplashPhotos = useCallback(async (category) => {
        setIsLoading(true);

        // ✨ 如果选中的是必应每日壁纸
        if (category === '必应每日壁纸') {
            const data = await fetchBingWallpaper();
            if (data) {
                setBingData({ url: data.url, copyright: data.copyright });
            }
        } else {
            // 原有的 Unsplash 逻辑
            const query = CATEGORY_MAP[category];
            const photos = await fetchPopularPhotos(query);
            setUnsplashPhotos(photos);
        }

        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (isOpen && activeTab === 'unsplash') {
            loadUnsplashPhotos(selectedCategory);
        }
    }, [isOpen, activeTab, selectedCategory, loadUnsplashPhotos]);

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result) {
                onSelectWallpaper(event.target.result);
                onClose();
            }
        };
        reader.readAsDataURL(file);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div className="bg-zinc-900 border border-white/10 w-full max-w-4xl h-[80vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <ImageIcon className="h-5 w-5 text-blue-500" />
                        <h3 className="text-base font-semibold text-white">选择背景壁纸</h3>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/5 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 px-6 border-b border-white/5 bg-zinc-900/50">
                    <button
                        onClick={() => setActiveTab('unsplash')}
                        className={`py-3 text-sm font-medium transition-all relative ${
                            activeTab === 'unsplash' ? 'text-white' : 'text-white/40 hover:text-white/60'
                        }`}
                    >
                        在线壁纸
                        {activeTab === 'unsplash' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />}
                    </button>
                    <button
                        onClick={() => setActiveTab('local')}
                        className={`py-3 text-sm font-medium transition-all relative ${
                            activeTab === 'local' ? 'text-white' : 'text-white/40 hover:text-white/60'
                        }`}
                    >
                        本地上传
                        {activeTab === 'local' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />}
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6" onWheel={(e) => e.stopPropagation()}>
                    {activeTab === 'unsplash' && (
                        <div className="space-y-6">
                            {/* Categories */}
                            <div className="flex flex-wrap gap-2">
                                {CATEGORIES.map((cat) => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all border ${
                                            selectedCategory === cat
                                                ? 'bg-white text-black border-white shadow-lg'
                                                : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                                        }`}
                                    >
                                        {cat === '必应每日壁纸' ? '🌟 ' + cat : cat}
                                    </button>
                                ))}
                            </div>

                            {/* Main Gallery or Bing View */}
                            {isLoading ? (
                                <div className="flex items-center justify-center py-24">
                                    <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                                </div>
                            ) : selectedCategory === '必应每日壁纸' ? (
                                /* ✨ 新增：选中的是必应壁纸时的专用渲染 UI */
                                <div className="max-w-xl mx-auto py-4">
                                    {bingData.url ? (
                                        <div className="space-y-4">
                                            <div
                                                className="relative aspect-video rounded-xl overflow-hidden border border-white/10 shadow-2xl group cursor-pointer"
                                                onClick={() => {
                                                    onSelectWallpaper(bingData.url);
                                                    onClose();
                                                }}
                                            >
                                                <img
                                                    src={bingData.url}
                                                    alt="Bing Daily Wallpaper"
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-100 p-4 flex flex-col justify-end">
                                                    <p className="text-white text-xs font-medium drop-shadow-md">今日必应壁纸</p>
                                                    <p className="text-white/70 text-[11px] mt-1 line-clamp-2 leading-relaxed drop-shadow-sm">
                                                        {bingData.copyright}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    onSelectWallpaper(bingData.url);
                                                    onClose();
                                                }}
                                                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white rounded-xl transition-colors shadow-lg shadow-blue-600/20"
                                            >
                                                应用今日必应壁纸
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 px-4 rounded-xl border border-dashed border-white/10 bg-white/5">
                                            <p className="text-sm text-white/50">未能获取到必应壁纸</p>
                                            <p className="text-xs text-white/30 mt-2 leading-relaxed">
                                                提示：请确保您已在「云同步设置」的高级设置中填入了正确的 Cloudflare Worker URL 链接。
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* 原有的 Unsplash 图片渲染 */
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {unsplashPhotos.map((photo) => (
                                        <div
                                            key={photo.id}
                                            onClick={() => {
                                                onSelectWallpaper(photo.urls.regular);
                                                onClose();
                                            }}
                                            className="relative aspect-video rounded-xl overflow-hidden border border-white/5 hover:border-white/20 shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer group bg-zinc-800"
                                        >
                                            <img
                                                src={photo.urls.small}
                                                alt={photo.alt_description || 'Wallpaper'}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                loading="lazy"
                                            />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                                <p className="text-white text-[10px] truncate">
                                                    by {photo.user.name}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'local' && (
                        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-white/10 rounded-xl hover:border-white/30 transition-colors bg-white/5">
                            <Upload className="h-12 w-12 text-white/40 mb-4" />
                            <p className="text-white/80 font-medium mb-2">点击上传图片</p>
                            <p className="text-white/40 text-sm mb-6">支持 JPG、PNG、WebP</p>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="hidden"
                                id="file-upload"
                            />
                            <label
                                htmlFor="file-upload"
                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors cursor-pointer"
                            >
                                选择文件
                            </label>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WallpaperModal;
