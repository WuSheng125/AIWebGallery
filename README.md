# AI Web Gallery

集中展示 7 个 AI 生成的卡冈图雅黑洞交互网页，通过统一入口浏览、打开原页并比较效果。模型名称沿用原始目录标签。

## 本地使用

使用 Node.js 22.12 或更高版本。根目录没有第三方依赖，仓库已保留 Kimi 的 `dist/`，浏览现有作品无需安装依赖。

在仓库根目录执行：

```powershell
npm run build
npm run serve
```

打开 [本地展示入口](http://127.0.0.1:4173/AIWebGallery/)。服务只监听本机 `127.0.0.1`，仅提供 `_site/` 中的发布文件，并使用 `/AIWebGallery/` 子路径，便于实际浏览 GitHub 项目站点的路径行为。不存在的资源返回 404。

端口被占用时，在 PowerShell 中执行：

```powershell
$env:PORT = '4174'
npm run serve
```

`npm run preview` 与 `npm run serve` 相同。修改入口、清单或原作资源后，重新执行 `npm run build` 并刷新浏览器；修改 Kimi 源码时，先重新构建 Kimi。根构建会替换本项目的 `_site/` 目录。

仅在修改 Kimi 源码后，或需要重新生成其发布产物时执行：

```powershell
npm --prefix kimi-k3.1-pro-max ci
npm --prefix kimi-k3.1-pro-max run build
npm run build
```

提交 Kimi 源码更新时，一并提交重新生成的 `dist/`。首页封面采自各作品默认状态、1280 × 800 视口；如果原作画面发生变化，使用真实页面重新采集对应的 `previews/` 图片。

## 文件与发布来源

| 位置 | 用途 |
| --- | --- |
| `index.html`、`gallery.css`、`gallery.js` | 统一展示入口 |
| `works.json` | 作品名称、说明、预览图与发布入口清单 |
| `previews/` | 首页使用的静态预览图 |
| 7 个原始模型目录 | 保留各作品的原有内容 |
| `scripts/build-gallery.mjs` | 按明确的资源清单组装 `_site/` |
| `scripts/serve.mjs` | 在本机预览 `_site/` |
| `.github/workflows/pages.yml` | 构建并发布 GitHub Pages |
| `_site/` | 可发布的生成目录 |

每个作品在发布目录中都使用 `demos/<原目录名>/index.html`，入口与资源使用相对路径，可适配 GitHub Pages 的仓库子路径。

| 原始目录 | 发布时采用的文件 |
| --- | --- |
| `claude-opus-5.5-medium` | `index.html`、`css/`、`js/` |
| `deepseek-v41-flash-1017-high` | `index.html`、`styles.css`、`app.js` |
| `deepseek-v41-flash-1017-max` | `index.html`、`styles.css`、`js/` |
| `gemini-4-argon-high` | `index.html`、`styles.css`、`js/`、`vendor/three.min.js` |
| `gpt-6-astra-ultra` | `index.html`、`style.css`、`renderer.js`、`app.js` |
| `gpt-6.1-sol-ultra` | 顶层 `gargantua.html`，发布副本命名为 `index.html` |
| `kimi-k3.1-pro-max` | `dist/` 的全部内容 |

Sol 的 `src/` 保留源码与原有构建工具。当前发布源为顶层 `gargantua.html`；如果修改 `src/`，其构建结果位于 `src/outputs/gargantua.html`，需将确认采用的产物更新到顶层后再组装展示站。

Kimi 的运行依赖由其锁文件固定。Git 跟踪源码、配置、公共资源、`package-lock.json` 与构建后的 `dist/`；`node_modules/`、下载缓存和开发临时产物已清理，后续生成时也会被忽略。原目录中的历史脚本与截图保留在本地并忽略，不随展示入口扩张。

## 维护作品

调整已有作品的展示名称、说明和预览图时，编辑 `works.json` 及对应的 `previews/` 文件。新增作品时，同时更新作品清单与 `scripts/build-gallery.mjs` 中的资源清单；明确指定静态入口及其实际依赖，避免把开发工具和缓存复制到站点。

更新后通过本地入口实际打开原页，检查默认画面、拖动与缩放、参数控制、截图、全屏及窄屏布局。WebGL 页面依赖浏览器硬件加速；同时打开多个作品标签页时，帧率会受设备和运行页面数量影响。入口本身只运行当前选中的一个作品，返回总览会移除它。

## GitHub Pages

当前目录尚未关联远程仓库，站点尚未上线。准备好 GitHub 仓库后：

1. 将项目提交到仓库的 `main` 分支。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
3. 推送 `main`，或在 **Actions** 中手动运行 **Publish gallery to GitHub Pages**。
4. 工作流先安装并构建 Kimi，再组装 `_site/`、上传 Pages 产物并发布。完成后，从工作流的部署结果打开实际站点地址。

项目仓库名为 `AIWebGallery` 时，通常通过 `https://<账号>.github.io/AIWebGallery/` 访问；实际地址以仓库 Pages 设置与部署输出为准。若使用其他仓库名，静态资源的相对路径仍适用，本地服务保留 `/AIWebGallery/` 作为子路径预览入口。

工作流使用 `github-pages` environment；若仓库为该环境配置了审批或分支限制，按仓库设置完成发布。有关工作流和发布权限可参考 [GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
