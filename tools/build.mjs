import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFile(resolve(root,path),'utf8');
function stripModule(text){return text.replace(/^import .*?;\s*$/gm,'').replace(/^export /gm,'').replace("new URL('./worker.js',import.meta.url)","'./src/worker.js'");}
const core=['math','kernel','document'];
const worker=(await Promise.all([...core,'worker'].map(n=>read(`src/${n}.js`)))).map(stripModule).join('\n');
const main=(await Promise.all([...core,'renderer','icons','app'].map(n=>read(`src/${n}.js`)))).map(stripModule).join('\n');
const css=await read('src/style.css');
let html=await read('index.html');
const script=`globalThis.__ALLOY_WORKER_SOURCE__=${JSON.stringify(worker).replaceAll('<','\\u003c')};\n(()=>{'use strict';\n${main}\n})();`;
html=html.replace('<link rel="stylesheet" href="./src/style.css">',()=>`<style>\n${css}\n</style>`).replace('<script type="module" src="./src/app.js"></script>',()=>`<script>\n${script.replaceAll('</script','<\\/script')}\n</script>`);
await mkdir(resolve(root,'dist'),{recursive:true});
await writeFile(resolve(root,'dist/index.html'),html);
await writeFile(resolve(root,'dist/AlloyStudio.html'),html);
await writeFile(resolve(root,'dist/.nojekyll'),'');
console.log(`Built dependency-free standalone app: ${(Buffer.byteLength(html)/1024).toFixed(1)} KiB`);
