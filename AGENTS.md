# AGENTS.md — AI 智能体项目指南与作品入库手册

本文档面向参与维护 **AI Web Gallery** 的 AI 编程智能体（Coding Agents）。阅读本文档即可快速掌握项目架构、数据契约、构建机制以及将新作品（例如 `tmp/` 下的待接入作品）标准化入库的完整工作流。

---

## 1. 项目定位与核心设计原则

- **项目功能**：展示并对比不同大模型基于同一《星际穿越》“卡冈图雅黑洞”提示词生成的交互式 Web 网页。
- **零外部构建依赖**：根目录 `package.json` 无任何第三方依赖（要求 `node >= 22.12.0`）。构建脚本 `scripts/build-gallery.mjs` 仅做**静态文件校验与白名单复制**，**不会**在根构建阶段替子项目执行 `npm install`、`vite build` 或 `tsc`。
- **静态产物固化入库**：所有需要编译/打包的作品（如 Vite / TypeScript / React / esbuild 项目），必须在接入时先在其自身目录内完成构建，并将生成的静态产物（如 `dist/` 或打包后的 `.js`）直接保留在 `works/<id>/` 下提交到 Git（根目录 `.gitignore` 已明确声明跟踪 `works/**/dist/`，同时忽略 `**/node_modules/`）。
- **子路径兼容**：线上通过 GitHub Pages 部署于 `/AIWebGallery/` 子路径，本地预览服务器 `scripts/serve.mjs` 同样强制挂载在 `http://127.0.0.1:4173/AIWebGallery/`。因此**所有展馆资源及各作品内部的静态资源引用必须使用相对路径（`./`）**，严禁使用根绝对路径（如 `/assets/...`），否则在子路径下会 404。

---

## 2. 目录与关键文件职责

| 路径 | 职责与技术要点 |
| --- | --- |
| `index.html` / `gallery.css` | 展馆首页骨架与深空琥珀主题样式。 |
| `gallery.js` | 前端核心逻辑：拉取并严格校验 `works.json`、生成模型系列多选筛选器、格式化指标数据、渲染卡片及执行 FLIP 筛选过渡动画。 |
| `works.json` | 展馆卡片元数据唯一数据源（JSON 数组）。 |
| `assets/models/<类别>.svg` | 筛选栏使用的模型系列图标，文件名与 `works.json` 中的 `类别` 字段一一对应。 |
| `previews/<id>.jpg`（或 `.png`） | 作品首页封面图，统一分辨率为 `1280×800`（16:10 比例）。 |
| `works/<id>/` | 已正式收录的作品目录，存放源码与已固化的浏览器端静态运行文件。 |
| `tmp/<id>/` | 待接入作品的暂存目录（未正式入库，不参与构建）。 |
| `scripts/build-gallery.mjs` | 构建脚本：校验 `galleryAssets` 与 `demos` 清单中的所有文件是否存在且非符号链接，清空并组装输出到 `_site/`，自动写入 `.nojekyll`。 |
| `scripts/serve.mjs` | 本地只读 HTTP 预览服务：仅暴露 `_site/` 目录，挂载前缀 `/AIWebGallery/`，带路径穿越防护。 |
| `.github/workflows/pages.yml` | GitHub Actions 工作流：在 `main` 分支推送时运行 `npm run build` 并发布 `_site/` 到 GitHub Pages。 |

---

## 3. 数据契约与硬性校验规则

`gallery.js` 中的 `validateDirectory()` 与 `scripts/build-gallery.mjs` 对数据格式有严格校验，任何一项不合规都会导致构建失败或前端报错中断渲染：

### 3.1 `works.json` 字段规范

每个作品对象包含以下字段（建议按 `id` 字典序排列以保持文件整洁）：

| 字段 | 类型与校验规则 | 说明与示例 |
| --- | --- | --- |
| `id` | `string`（必填，唯一） | 必须匹配正则 `/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/`，对应 `works/<id>/` 目录名。例：`"claude-opus-5.5-max"` |
| `model` | `string`（必填，非空） | 模型展示名称。例：`"Claude Opus 5.5"` |
| `类别` | `string`（必填） | 模型系列小写标识，用于聚合筛选按钮与加载 `./assets/models/<类别>.svg`。例：`"claude"`、`"chatgpt"`、`"gemini"`、`"qwen"`、`"hunyuan"` |
| `effort` | `string` | 推理强度或档位标签。例：`"High"`、`"XHigh"`、`"Max"`、`"Ultra"`、`"Medium"`、`"Extra"` |
| `durationSeconds` | `number \| null` | 实际生成耗时（单位：秒，非负数字，可含小数；`0` 为有效值）。未知填 `null`（前端显示 `—`） |
| `cost` | `string \| object \| null` | 实际费用。推荐直接填文本（如 `"2.59 CNY"`、`"4.22 USD"`、`"未记录"`），或填 `{ "amount": 2.4, "currency": "USD" }`；未知填 `null` |
| `harness` | `string \| null` | 运行环境或智能体工具名称。例：`"DSH"`、`"Claude Desktop"`、`"Codex"`、`"Kimi Code"`；未知填 `null` |
| `testDate` | `string \| null` | 测试日期，支持 `YYYY-MM-DD` 或 `YYYY/MM/DD`（会校验真实日历合法性，前端统一渲染为 `YYYY/MM/DD`）；未知填 `null` |
| `stack` | `string[]` | 技术栈标签数组。例：`["JavaScript", "WebGL 2"]`、`["Three.js", "GLSL"]`、`["TypeScript", "Three.js", "Vite"]` |
| `entry` | `string`（必填，强校验） | **必须严格等于** `"demos/" + id + "/index.html"` |
| `preview` | `string`（必填，强校验） | **必须严格等于** `"previews/" + id + ".jpg"` 或 `"previews/" + id + ".png"`（现有作品统一用 `.jpg`） |

### 3.2 模型系列注册表（`gallery.js`）

`gallery.js` 顶部维护了两个集合：
1. `modelSeriesNames`（Map）：将 `类别` 映射为筛选按钮显示文本（目前已内置 `claude`、`deepseek`、`gemini`、`glm`、`chatgpt`、`grok`、`hunyuan`、`kimi`、`mimo`、`minimax`、`muse-spark`、`qwen`、`step`）。
2. `monochromeSeries`（Set）：单色深色 SVG 图标集合（如 `chatgpt`、`glm`、`grok`、`kimi`），前端会为其添加 `.is-monochrome` 类（通过 `filter: brightness(0) invert(1)` 转为亮白色以适应暗色背景）。

> 若新作品属于全新的模型家族，需将对应图标放入 `assets/models/<类别>.svg`，并在 `gallery.js` 的 `modelSeriesNames`（及必要时的 `monochromeSeries`）中补充注册。

---

## 4. `scripts/build-gallery.mjs` 的三种作品打包模式

`scripts/build-gallery.mjs` 中的 `demos` 数组决定了每个 `works/<id>` 下哪些文件会被复制到 `_site/demos/<id>/`（开发服务脚本如 `serve.mjs`、源码目录、说明文档等不在此列表中的文件不会进入发布目录）。目前支持三种配置模式：

1. **普通资源白名单模式（`assets: string[]`）**
   适用于纯静态单文件或多文件项目（文件或子目录原样复制）：
   ```js
   // 单文件作品
   { id: 'claude-sonnet-5.5-medium', assets: ['index.html'] },
   // 多文件/目录作品
   { id: 'claude-opus-5.5-max', assets: ['index.html', 'css', 'js'] },
   { id: 'gemini-4-argon-high', assets: ['index.html', 'styles.css', 'js', 'vendor/three.min.js'] },
   ```
2. **文件重命名映射模式（`assets: Array<string | { source, target }>`）**
   适用于入口 HTML 文件名不是 `index.html` 的单页作品：
   ```js
   { id: 'gpt-6.1-sol-ultra', assets: [{ source: 'gargantua.html', target: 'index.html' }] },
   ```
3. **构建产物目录直出模式（`directory: string`）**
   适用于 Vite 等打包工具构建的工程项目，将该子目录（如 `dist`）下的全部内容平铺复制到 `_site/demos/<id>/`：
   ```js
   { id: 'kimi-k3.1-pro-max', directory: 'dist' },
   ```

---

## 5. 添加新作品入库的标准操作流程（SOP）

当用户要求将新作品（例如当前位于 `tmp/` 下的待接入作品）加入展馆时，请严格按照以下 6 个步骤执行：

### 步骤 1：盘点作品结构与分类预处理

检查目标作品的源码结构，参照当前 `tmp/` 中几个典型作品的形态进行针对性处理：

- **形态 A：单文件内联 HTML**（参考 `tmp/claude-fable-5.2-extra`）
  - 仅有一个包含所有样式与脚本的 `index.html`。
  - 无需任何构建，`demos` 配置使用 `assets: ['index.html']`。
- **形态 B：纯静态多文件原生 WebGL / 本地 Vendor 项目**（参考 `tmp/hy4-high`、`tmp/qwen4-max-xhigh`、`tmp/qwen4-max-preview-xhigh`）
  - 根目录下直接是 `index.html`，配合 `css/`、`js/` 以及可选的 `vendor/three.min.js`。
  - 检查 `index.html` 中引用的脚本、样式和外部资源路径是否均为相对路径，无需构建。
  - `demos` 配置只挑选运行时必需的浏览器资源（例如 `assets: ['index.html', 'css', 'js']` 或加上 `'vendor/three.min.js'`），排除 `README.md`、`docs/`、`preview.png` 等非运行文件。
- **形态 C：工程化构建项目（Vite / TypeScript / React 等）**（参考 `tmp/gemini-4-hydrogen-xhigh`、`tmp/gemini-4-carbon-high` 以及已入库的 `works/kimi-k3.1-pro-max`）
  - **关键检查点 1（相对路径 `base: './'`）**：
    打开 `dist/index.html` 或 `vite.config.ts` 检查资源引用路径。
    - 例如 `tmp/gemini-4-hydrogen-xhigh` 虽然已有 `dist/index.html`，但其中写的是 `<script type="module" crossorigin src="/assets/index-DcMv_4Qe.js">`（根绝对路径）！在 `/AIWebGallery/demos/<id>/` 下访问会直接 404。
    - **修复方法**：确保其 `vite.config.ts`/`vite.config.js` 设置了 `base: './'`（或运行 `npx vite build --base=./` 重新构建，或将 `dist/index.html` 中的 `src="/assets/..."`、`href="/assets/..."` 修正为 `./assets/...`）。
  - **关键检查点 2（生成固化 `dist/`）**：
    - 例如 `tmp/gemini-4-carbon-high` 已配置 `base: './'`，但尚未生成 `dist/` 目录。
    - **处理方法**：进入该作品目录安装依赖并执行 `npm run build`，确认生成完整的 `dist/index.html` 及 `dist/assets/*`（构建完成后可清理临时安装的 `node_modules`，或依赖 `.gitignore` 自动忽略 `**/node_modules/`）。
  - `demos` 配置使用 `{ id: '<id>', directory: 'dist' }`。

### 步骤 2：迁移作品目录至 `works/<id>/`

确定规范的 `<id>`（通常与目录名一致，全小写字母、数字、连字符 `-` 或点号 `.`，格式为 `<模型名>-<effort>`），将作品目录从 `tmp/<id>` 移动（或复制整理）到 `works/<id>`。
> 注意：检查并确保作品目录内不含任何符号链接（`build-gallery.mjs` 遇到符号链接会主动报错退出）。

### 步骤 3：准备 1280×800 封面图放入 `previews/`

首页要求每个作品在 `previews/` 下有一张对应的封面图（优先统一保存为 `previews/<id>.jpg`，分辨率 `1280×800`）：
- 如果原作品自带截图（如 `tmp/hy4-high/preview.png`、`tmp/qwen4-max-xhigh/docs/preview.png`），可检查其画面与尺寸，裁剪/缩放转换保存为 `1280×800` 的 `previews/<id>.jpg`。
- 如果原作品没有现成截图（如 `tmp/claude-fable-5.2-extra`、`tmp/gemini-4-hydrogen-xhigh`、`tmp/gemini-4-carbon-high`），可在站点构建并启动预览服务后，使用浏览器工具以 `1280×800` 视口打开对应作品页面（待加载遮罩消失、黑洞正常渲染后，必要时隐藏侧边栏或保持默认美观构图）截取画面并保存为 `previews/<id>.jpg`。

### 步骤 4：注册构建白名单（`scripts/build-gallery.mjs`）

在 `scripts/build-gallery.mjs` 的 `demos` 数组中（建议按 `id` 字母序插入）添加新作品条目。以 `tmp/` 中的 6 个候选作品为例，其对应的配置方式如下：

```js
{ id: 'claude-fable-5.2-extra', assets: ['index.html'] },
{ id: 'gemini-4-carbon-high', directory: 'dist' },
{ id: 'gemini-4-hydrogen-xhigh', directory: 'dist' },
{ id: 'hy4-high', assets: ['index.html', 'css', 'js'] },
{ id: 'qwen4-max-preview-xhigh', assets: ['index.html', 'css', 'js', 'vendor/three.min.js'] },
{ id: 'qwen4-max-xhigh', assets: ['index.html', 'css', 'js'] },
```

### 步骤 5：登记作品元数据（`works.json`）

在 `works.json` 中新增对应的元数据对象（建议按 `id` 字母序插入）：
- 确认 `类别` 字段与现有系列标识一致（如 `claude`、`gemini`、`hunyuan`、`qwen`）。若遇到新模型系列，同步添加 `assets/models/<类别>.svg` 并更新 `gallery.js` 中的 `modelSeriesNames`。
- 确认 `entry` 为 `"demos/<id>/index.html"`，`preview` 为 `"previews/<id>.jpg"`。
- 根据作品实际使用的技术准确填写 `stack`（例如 `tmp/gemini-4-carbon-high` 使用了 `["React", "TypeScript", "Three.js", "Vite"]`，`tmp/qwen4-max-preview-xhigh` 使用了 `["Three.js", "GLSL"]`，`tmp/hy4-high` 使用了 `["JavaScript", "WebGL 2"]`）。
- `durationSeconds`、`cost`、`harness`、`testDate` 按用户提供的测试记录填写；若用户未提供某项具体数值，按现有规范填 `null`（或费用填 `"未记录"`），切勿编造测试数据。

### 步骤 6：构建与端到端验证

每次完成添加后，必须在项目根目录执行以下验证：

1. **构建测试**：
   ```powershell
   npm run build
   ```
   确认终端输出 `已组装 N 个作品：...\_site` 且退出码为 `0`。
2. **预览与功能核验**：
   启动 `npm run serve` 并通过 `http://127.0.0.1:4173/AIWebGallery/` 验证：
   - 首页作品总数、模型系列筛选按钮与卡片封面图正常显示，无 `validateDirectory` 报错。
   - 点击新作品卡片进入 `/AIWebGallery/demos/<id>/index.html`，确认黑洞 Canvas 正常渲染、无静态资源 404、无控制台致命报错。
