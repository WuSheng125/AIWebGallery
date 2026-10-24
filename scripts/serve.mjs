import http from 'node:http';
import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const site = path.join(root, '_site');
const prefix = '/AIWebGallery/';
const port = Number(process.env.PORT || 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function withinSite(target) {
  const relative = path.relative(site, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function reply(request, response, status, message, headers = {}) {
  const body = Buffer.from(message);
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

try {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是 1–65535 之间的整数。');
  const info = await lstat(site);
  if (info.isSymbolicLink() || !info.isDirectory() || await realpath(site) !== site) {
    throw new Error('_site 必须是本项目内的普通发布目录。');
  }
} catch (error) {
  console.error(error.code === 'ENOENT' ? '尚未生成 _site，请先执行 npm run build。' : error.message);
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    reply(request, response, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return;
  }

  let url;
  let pathname;
  try {
    if (!request.url?.startsWith('/') || request.url.startsWith('//') || request.url.includes('#')) throw new Error();
    url = new URL(request.url, `http://127.0.0.1:${port}`);
    pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) throw new Error();
  } catch {
    reply(request, response, 400, 'Bad request');
    return;
  }

  if (pathname === '/' || pathname === prefix.slice(0, -1)) {
    reply(request, response, 302, 'Redirecting', { Location: prefix + url.search });
    return;
  }
  if (!pathname.startsWith(prefix)) {
    reply(request, response, 404, 'Not found');
    return;
  }

  let file = path.resolve(site, pathname.slice(prefix.length));
  if (!withinSite(file)) {
    reply(request, response, 403, 'Forbidden');
    return;
  }

  try {
    let info = await stat(file);
    if (info.isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        reply(request, response, 302, 'Redirecting', { Location: url.pathname + '/' + url.search });
        return;
      }
      file = path.join(file, 'index.html');
      info = await stat(file);
    }
    if (!info.isFile() || !withinSite(await realpath(file))) {
      reply(request, response, 403, 'Forbidden');
      return;
    }
    const body = request.method === 'HEAD' ? undefined : await readFile(file);
    response.writeHead(200, {
      'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      reply(request, response, 404, 'Not found');
    } else {
      console.error(`读取发布资源失败：${error.message}`);
      reply(request, response, 500, 'Unable to read file');
    }
  }
});

server.on('error', (error) => {
  console.error(`无法启动预览服务：${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`AI Web Gallery: http://127.0.0.1:${port}${prefix}`);
  console.log('按 Ctrl+C 停止服务。');
});
