// Optional local preview server. The page also works by opening index.html directly.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const port = Number(process.env.PORT || 8765);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((request,response) => {
  if (!['GET','HEAD'].includes(request.method)) {response.writeHead(405);response.end();return;}
  let pathname;
  try {pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);} catch {response.writeHead(400);response.end('Bad request');return;}
  const file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)){response.writeHead(403);response.end('Forbidden');return;}
  fs.stat(file,(error,stat)=>{
    if(error||!stat.isFile()){response.writeHead(404);response.end('Not found');return;}
    response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    if(request.method==='HEAD'){response.end();return;}
    const stream=fs.createReadStream(file);
    stream.on('error',()=>response.destroy());
    stream.pipe(response);
  });
});
server.on('error',error=>{console.error('无法启动本地服务：'+error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log('GARGANTUA is ready at http://127.0.0.1:'+port));
