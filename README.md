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

## 🔄 更新与数据迁移

登录状态、快捷方式、待办、笔记都存在 Chrome 按**扩展 ID** 隔离的本地存储里。解压到新目录再加载会得到新的扩展 ID，等于换了一份空数据，所以会要求重新登录。

### 更新到新版本（推荐，登录和数据都保留）

1. 把新版本的文件**覆盖到原来加载的那个 `dist` 目录**（不要换目录）；
2. 打开 `chrome://extensions/`，在该扩展卡片上点 **重新加载**。

目录不变，扩展 ID 就不变，登录状态和所有数据都会原样保留。

### 重装 / 换机后免登录恢复

1. 旧插件：设置 → 同步 → **生成迁移码**（会自动复制到剪贴板）；
2. 新插件：设置 → 同步 → **“重装或换机？用迁移码免登录恢复”** → 粘贴迁移码 → **恢复登录并拉取云端数据**。

迁移码里包含服务器地址、账号和登录令牌，等同于登录凭据，请勿分享；在旧插件里点“登出”即可让迁移码失效。

### 只迁移数据（没有云端账号）

旧插件：数据管理 → **导出数据**（JSON，不含登录令牌）；新插件：数据管理 → **导入数据**。

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
- GPT-5.5-Codex

## 📸 一图胜千言

![主界面](https://github.com/user-attachments/assets/2bcb64ec-8517-4ee3-acfa-719d032bc05d)

![笔记界面](https://github.com/user-attachments/assets/43eea782-f7b5-476f-9225-eb5e4e196421)
