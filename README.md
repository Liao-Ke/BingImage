# BingImage

获取每日必应美图，保存在 Github 仓库

> ![今日诗词](https://v2.jinrishici.com/one.svg?font-size=50&color=SlateBlue)

### 今天的必应美图
![必应美图](https://lsk.icu/bigmg.php)

## 项目简介

BingImage 是一个自动化的必应每日壁纸档案项目：

- **每日自动抓取**：GitHub Actions 定时（UTC 00:00）运行 Python 脚本，从必应官方接口抓取当日 UHD 壁纸与元数据（标题、版权、测验链接等），自动提交入库
- **完整历史档案**：自 2023-11-19 起每日一档，现已积累 **1000+ 天**的壁纸存档，按日期归档在 `image/YYYYMMDD/`
- **沉浸式档案主页**：Vite + TypeScript 构建的全屏壁纸浏览器，支持滚轮 / 触摸 / 键盘 / 缩略图时间轴 / URL 直达任意日期
- **随机壁纸接口**：Cloudflare Workers 提供的 `bigmg.php` 随机图接口，README 顶部展示的"今天的必应美图"即由它输出

在线访问：[必应美图 · 每日壁纸档案](https://bingimage-7hq.pages.dev/)

## 目录结构

```
├── image/                  # 每日壁纸存档（图片 + data.json 元数据）
│   └── YYYYMMDD/           # 按日期归档，如 20260529/
├── script/                 # 抓取与工具脚本（Python）
│   ├── index.py            # 每日抓取主脚本（Bing 官方接口）
│   ├── cj.py               # 旧数据转换工具
│   └── gen_cf_random_img.py# Cloudflare Workers 随机图脚本
├── src/                    # 前端源码（TypeScript）
│   ├── main.ts             # 档案浏览页逻辑
│   └── style.css           # 深色沉浸式样式
├── .github/workflows/      # GitHub Actions 定时任务
├── index.html              # 前端入口
└── vite.config.ts          # Vite 构建配置
```

## 数据格式

每日目录 `image/YYYYMMDD/` 包含：

- 当日 UHD 壁纸原图（`.jpg`）
- `data.json`：必应官方返回的当日元数据，含标题（title）、版权信息（copyright）、版权链接（copyrightlink）、图片测验链接（quiz）与完整展示时间（fullstartdate）

前端构建时通过 `import.meta.glob` 打包全部 `data.json`，产物自包含（仅 index.html + JS + CSS），图片一律走远程 Bing URL，无需在站点根放置数据目录。

## 本地开发

```bash
pnpm install    # 安装依赖
pnpm dev        # 开发预览（http://localhost:5173）
pnpm build      # 生产构建（tsc 严格模式 + vite）
pnpm preview    # 预览构建产物
```

## 技术栈

| 模块 | 技术 |
|------|------|
| 抓取脚本 | Python 3.11 + requests / fake-useragent |
| 定时任务 | GitHub Actions（每日 cron） |
| 前端 | Vite + TypeScript（无框架，原生 DOM） |
| 部署 | Cloudflare Pages（档案页）/ Cloudflare Workers（随机图接口） |

## 说明

- 壁纸版权归必应 / 原版权方所有，本项目仅作存档与展示用途
- 抓取图片强依赖 `cn.bing.com` 可达性；生产部署需配置 SPA fallback（任意路径回退到 index.html），否则直接访问 `/YYYYMMDD` 日期路径会 404
