# 🌌 AI Web Gallery — 卡冈图雅黑洞生成展馆

[![GitHub Pages](https://img.shields.io/badge/Live_Demo-GitHub_Pages-ffb23f?style=flat-square&logo=github)](https://wusheng125.github.io/AIWebGallery/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12.0-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

**AI Web Gallery** 是一个横向展示与对比不同大语言模型（LLM）及编程智能体（Coding Harness）Web 图形编程能力的交互式作品集。所有收录作品均基于**同一段自然语言提示词**，独立生成电影《星际穿越》（*Interstellar*）中超大质量黑洞**「卡冈图雅」（Gargantua）**的实时三维渲染网页。

点击展馆首页的任意作品卡片，即可在新标签页中打开该模型生成的独立交互页面，亲自体验光线追踪引力透镜、相对论吸积盘与实时物理参数调节。

---

## 🎯 测试基准与统一提示词

所有模型均在零人工手写前端代码的条件下，基于以下提示词完成开发：

> 在当前目录下，使用web技术制作一个图形化预览黑洞效果的网页，要求外观和样式要类似于电影《星际穿越》里面的黑洞卡冈图雅。黑洞背景要有其他星星，黑洞要有跟电影里类似的吸积盘效果和引力透镜效应。用户可以用鼠标旋转观察，并且在侧边栏可以调整相关参数体现不同参数黑洞的不同效果。你可以使用你认为必要的技术来实现这个网页，既要保证性能也要完成必要的效果。可以引入你觉得必要的第三方图形库比如three.js等等之类。

*注：本项目为娱乐与技术探索性质测试，展示结果仅代表对应模型在当时测试环境与工具链下的单次表现。*

---

## ✨ 展馆特性

- **多模型同台竞技**：涵盖 Claude、DeepSeek、Gemini、ChatGPT、Grok、混元（Hunyuan）、Kimi、MiMo、MiniMax、Muse Spark、Qwen、Step 等主流模型系列。
- **多维元数据看板**：每张作品卡片直观呈现**模型名称与推理强度（Effort）**、**实际耗时**、**API / 运行费用**、**使用的智能体工具（Harness）**、**测试日期**以及**技术栈标签**（WebGL 2、GLSL、Three.js、TypeScript、Vite 等）。
- **丝滑多选筛选**：支持按模型系列进行组合筛选（附带自适应过渡动画），快速对比同一家族不同档位或跨家族模型的视觉实现。
- **原汁原味独立运行**：所有作品均保存了完备的静态运行产物，点击卡片直接进入原作环境，互不干扰。

---

## 🚀 本地运行与预览

展馆本身采用纯静态架构，构建与预览脚本完全基于 Node.js 原生模块，无需安装额外第三方运行时依赖。

### 环境要求

- **Node.js**：`>= 22.12.0`

### 启动步骤

在项目根目录下执行：

```powershell
# 1. 将首页与各作品的静态发布资源组装至 _site/ 目录
npm run build

# 2. 启动本地静态预览服务器
npm run serve
```

服务启动后，在浏览器访问 **[http://127.0.0.1:4173/AIWebGallery/](http://127.0.0.1:4173/AIWebGallery/)** 即可浏览展馆。

- **修改与刷新**：修改首页文件、`works.json` 或封面图后，重新执行 `npm run build` 并刷新浏览器页面即可生效（每次构建会自动清空并重建 `_site/`）。
- **自定义端口**：默认端口为 `4173`。如需修改，可在运行前设置环境变量（例如 PowerShell 中执行 `$env:PORT = '4174'; npm run serve`）。`npm run preview` 与 `npm run serve` 功能完全一致。

---

## 📂 目录结构概览

```text
AIWebGallery/
├── index.html                 # 展馆首页结构（提示词面板、筛选栏、作品网格）
├── gallery.css                # 展馆深空琥珀主题样式与响应式布局
├── gallery.js                 # 作品数据校验、系列筛选、FLIP 动画与卡片渲染
├── works.json                 # 收录作品的元数据清单
├── assets/                    # 展馆公共资源（星空背景、站标及 assets/models/ 下的模型图标）
├── previews/                  # 统一规格（1280×800）的作品首页封面图
├── works/<id>/                # 各模型生成的原作源码及已固化的静态产物
├── scripts/
│   ├── build-gallery.mjs      # 静态站点组装脚本（白名单复制，输出至 _site/）
│   └── serve.mjs              # 本地安全预览服务（模拟 /AIWebGallery/ 子路径）
├── .github/workflows/
│   └── pages.yml              # GitHub Pages 自动构建与部署工作流
└── AGENTS.md                  # 面向 AI 智能体的项目架构说明与新作品入库指南
```

> 🤖 **给开发者与 AI 助手**：如需了解项目底层校验规则、构建映射机制，或需要将新测试的作品加入展馆，请查阅 **[AGENTS.md](./AGENTS.md)**。

---

## 🌐 部署到 GitHub Pages

本项目原生适配 GitHub Pages 子路径部署（如 `https://<username>.github.io/AIWebGallery/`），全站采用相对路径引用资源。

1. 将代码推送到 GitHub 仓库的 `main` 分支。
2. 进入仓库 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。
3. 每次推送到 `main` 分支（或在 **Actions** 页面手动触发 **Publish gallery to GitHub Pages** 工作流），GitHub Actions 会自动执行 `npm run build` 并将生成的 `_site/` 目录发布上线。
