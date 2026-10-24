import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
const [html,css,shaders,renderer,app]=await Promise.all(['index.html','styles.css','shaders.js','renderer.js','app.js'].map(name=>readFile(path.join(root,name),'utf8')));
const code=[shaders,renderer,app].map(source=>source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'')).join('\n');
const standalone=html
  .replace('<link rel="stylesheet" href="./styles.css">',()=>`<style>\n${css}\n</style>`)
  .replace('<script type="module" src="./app.js"></script>',()=>`<script type="module">\n${code}\n</script>`);
await mkdir(path.join(root,'outputs'),{recursive:true});
await writeFile(path.join(root,'outputs','gargantua.html'),standalone,'utf8');
console.log('Built outputs/gargantua.html — fully self-contained, no network dependencies.');
