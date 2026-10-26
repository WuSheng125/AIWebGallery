# AI Web Gallery

首页展示 8 个 AI 生成的卡冈图雅黑洞网页。点击卡片后，在新标签页打开独立原页。

## 本地使用

使用 Node.js 22.12 或更高版本，在项目根目录执行：

```powershell
npm run build
npm run serve
```

打开 [本地入口](http://127.0.0.1:4173/AIWebGallery/)。构建只将已保存的静态产物组装到 `_site/`；预览服务仅提供该目录，使用 `/AIWebGallery/` 子路径。修改入口、卡片数据或封面后，重新执行 `npm run build` 并刷新页面。每次构建会替换 `_site/`。

端口可通过 PowerShell 的 `$env:PORT = '4174'` 调整；`npm run preview` 与 `npm run serve` 相同。

## 文件

| 位置 | 用途 |
| --- | --- |
| `index.html`、`gallery.css`、`gallery.js` | 首页结构、提示词与声明、样式和卡片展示 |
| `assets/` | 首页宇宙背景图片 |
| `works.json` | 卡片信息、元数据、封面及原页地址 |
| `previews/` | 首页封面的统一存放目录 |
| `works/<id>/` | 各原作的文件与已保存静态产物 |
| `_site/` | 构建生成的发布目录 |
| `scripts/build-gallery.mjs` | 组装入口、封面与原页 |
| `scripts/serve.mjs` | 本地预览服务 |
| `.github/workflows/pages.yml` | GitHub Pages 发布工作流 |

原作集中存放在 `works/`，发布地址保持 `demos/<id>/index.html`，`works.json` 的 `entry` 仍使用该地址。

## 卡片数据

在 `works.json` 中填写卡片信息：

| 字段 | 填写方式 |
| --- | --- |
| `id` | 作品唯一标识，对应 `works/` 下的目录名 |
| `model` | 模型展示名称 |
| `effort` | 推理强度或档位标签 |
| `stack` | 技术栈字符串数组 |
| `entry` | 原页地址：`demos/<id>/index.html` |
| `preview` | 封面地址：`previews/<id>.jpg` |
| `durationSeconds` | 实际耗时，非负数字，单位为秒，可含小数；未知填 `null` |
| `cost` | 实际费用，可直接填写文本（如 `"2.59 CNY"`、`"未记录"`）或费用对象；未知填 `null` |
| `harness` | 实际使用的工具或运行环境名称，字符串；未知填 `null` |
| `testDate` | 测试日期，填写 `YYYY-MM-DD` 或 `YYYY/MM/DD`，卡片统一显示为 `YYYY/MM/DD`；未知填 `null` |

费用对象由非负数字 `amount` 和 ISO 4217 三字母货币代码 `currency` 组成。例如 `{"amount": 0, "currency": "USD"}` 仅表示填写格式，不是现有作品的实际费用。

各项信息按实际记录填写。缺失值显示 `—`（未提供）；`0` 秒和零费用都是有效记录，会正常显示。费用保留填写的文本或币种，不自动换算。测试日期不包含时区，不会随浏览者所在地区改变。

## GitHub Pages

1. 将项目提交到 GitHub 仓库的 `main` 分支。
2. 在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。
3. 推送 `main`，或在 **Actions** 中手动运行 **Publish gallery to GitHub Pages**。
4. 工作流组装 `_site/`、上传发布产物并部署。完成后，从部署结果打开站点地址。

仓库名为 `AIWebGallery` 时，项目站点地址通常为 `https://<账号>.github.io/AIWebGallery/`，以实际部署输出为准。静态资源使用相对路径，可适配仓库子路径。

发布流程使用 `github-pages` environment，按仓库设置处理审批或分支限制。详见 [GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
