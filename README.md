# iTabs (Chrome新标签页扩展)

> iTabs, 一个实用且美观的 Chrome 新标签页扩展

## ✨ 主要特点

- **快捷方式**: 轻松添加和管理您最常访问的网站快捷方式。
- **待办列表**: 集成简洁的待办事项列表，帮助您高效管理每日任务。
- **笔记功能**: 快速记录灵感和重要信息，支持Markdown语法以及搜索和导入导出。
- **数据备份与恢复**: 轻松备份和导入插件数据。
- **精美设计**: 采用类Liquid Glass视觉语言
- **自托管云端同步**: 基于Cloudflare Workers，在不同设备间无缝同步您的快捷方式和设置。

⚠️ bug消除中......

## 🚀 快速开始

### 源代码安装
1. 编译项目：
```bash
# 克隆仓库
git clone https://github.com/dandelions/iTabscopy.git
# 进入项目目录
cd iTabs
# 安装依赖
npm install
# 构建项目
npm run build
# 编译完成后，生成的文件位于dist目录
```
2. 载入扩展：
   - 打开 Chrome 浏览器，访问 `chrome://extensions/`。
   - 启用右上角的 **开发者模式 (Developer mode)**。
   - 点击 **加载已解压的扩展程序 (Load unpacked)**，选择项目中的 `dist` 文件夹。

### 发布版安装

1. 从[release](https://github.com/dandelions/iTabscopy/releases)下载最新版本。

2. 解压下载的文件。

3. 按照上述“载入扩展”步骤安装。

## ☁️ 使用Cloudflare部署同步服务 

同步功能依赖于 Cloudflare Worker。

1. 复制 [worker.js](https://github.com/dandelions/iTabscopy/tree/main/workers/workers.js)的内容到 Cloudflare Worker，部署一个新的workers项目。

2. 配置 KV 命名空间
   - 在 Cloudflare 控制台创建一个 KV 命名空间。
   - 将其绑定到您的 worker，名称设为 `NewTab_KV`。

3. 在iTabs同步面板高级设置中，输入您自己的 Cloudflare Worker URL 以启用同步功能。


## 🤝 致谢

本插件基于：[AestheticNewTab](https://github.com/jiangnan1224/AestheticNewTab) 和[iTabs](https://github.com/tenoms/iTabs)进行二次开发和定制，感谢原作者的辛勤付出！

## 开发者
- Claude Sonnet 4.5
- Gemini Pro 3.0
- GPT-5.1-Codex-Max

## 📸 一图胜千言

![主界面](https://github.com/user-attachments/assets/2bcb64ec-8517-4ee3-acfa-719d032bc05d)

![笔记界面](https://github.com/user-attachments/assets/43eea782-f7b5-476f-9225-eb5e4e196421)
