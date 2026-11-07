import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url));
const [shell,core,app]=await Promise.all(['site-shell.html','csv-core.mjs','web-app.js'].map(name=>readFile(join(root,name),'utf8')));
const bundle='\n'+core.replace(/^export /gm,'')+'\n'+app+'\n';
if(bundle.toLowerCase().includes('</script'))throw new Error('Unexpected inline script terminator');
await writeFile(join(root,'index.html'),shell.replace('/* APP_BUNDLE */',bundle));
console.log('Built index.html');
