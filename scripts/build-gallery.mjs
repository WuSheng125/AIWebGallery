import { copyFile, lstat, mkdir, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const output = path.join(root, '_site');

// Only these browser assets enter the published site. Source servers, caches,
// dependencies, and historical development scripts stay in the original folders.
const galleryAssets = ['index.html', 'gallery.css', 'gallery.js', 'works.json', 'previews'];
const demos = [
  { id: 'claude-opus-5.5-medium', assets: ['index.html', 'css', 'js'] },
  { id: 'deepseek-v41-flash-1017-high', assets: ['index.html', 'styles.css', 'app.js'] },
  { id: 'deepseek-v41-flash-1017-max', assets: ['index.html', 'styles.css', 'js'] },
  { id: 'gemini-4-argon-high', assets: ['index.html', 'styles.css', 'js', 'vendor/three.min.js'] },
  { id: 'gpt-6-astra-ultra', assets: ['index.html', 'style.css', 'renderer.js', 'app.js'] },
  { id: 'gpt-6.1-sol-ultra', assets: [{ source: 'gargantua.html', target: 'index.html' }] },
  { id: 'kimi-k3.1-pro-max', directory: 'dist' },
];

async function required(source) {
  try {
    const info = await lstat(source);
    if (info.isSymbolicLink()) throw new Error(`不复制符号链接：${path.relative(root, source)}`);
    if (!info.isFile() && !info.isDirectory()) throw new Error(`不支持的文件类型：${path.relative(root, source)}`);
    return info;
  } catch (error) {
    if (error.code === 'ENOENT') {
      const hint = source.startsWith(path.join(root, 'kimi-k3.1-pro-max', 'dist'))
        ? '；请先在 kimi-k3.1-pro-max 执行 npm ci 和 npm run build'
        : '';
      throw new Error(`缺少发布资源：${path.relative(root, source)}${hint}`);
    }
    throw error;
  }
}

async function copyAsset(source, target) {
  const info = await required(source);
  if (info.isDirectory()) {
    await mkdir(target, { recursive: true });
    for (const entry of await readdir(source)) {
      await copyAsset(path.join(source, entry), path.join(target, entry));
    }
  } else {
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
}

try {
  // Detect missing entry assets before replacing the previous build.
  for (const asset of galleryAssets) await required(path.join(root, asset));
  for (const demo of demos) {
    if (demo.directory) {
      await required(path.join(root, demo.id, demo.directory, 'index.html'));
    } else {
      for (const asset of demo.assets) {
        await required(path.join(root, demo.id, typeof asset === 'string' ? asset : asset.source));
      }
    }
  }

  // The sole deletion target is the direct _site child of this resolved project.
  if (path.dirname(output) !== root || path.basename(output) !== '_site') {
    throw new Error('发布目录不在预期位置，已停止构建。');
  }
  try {
    const info = await lstat(output);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new Error('_site 必须是项目内的普通目录，已停止构建。');
    }
    const resolved = await realpath(output);
    if (resolved !== output) throw new Error('_site 的实际路径不符合预期，已停止构建。');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  for (const asset of galleryAssets) {
    await copyAsset(path.join(root, asset), path.join(output, asset));
  }
  for (const demo of demos) {
    const destination = path.join(output, 'demos', demo.id);
    if (demo.directory) {
      await copyAsset(path.join(root, demo.id, demo.directory), destination);
    } else {
      for (const asset of demo.assets) {
        const source = typeof asset === 'string' ? asset : asset.source;
        const target = typeof asset === 'string' ? asset : asset.target;
        await copyAsset(path.join(root, demo.id, source), path.join(destination, target));
      }
    }
  }
  await writeFile(path.join(output, '.nojekyll'), '', 'utf8');
  console.log(`已组装 ${demos.length} 个作品：${output}`);
  console.log('执行 npm run serve 后访问 http://127.0.0.1:4173/AIWebGallery/');
} catch (error) {
  console.error(`构建失败：${error.message}`);
  process.exitCode = 1;
}
