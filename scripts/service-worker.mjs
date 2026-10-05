import {readdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const assets=await readdir('dist/assets');const files=['/','/index.html','/logo.svg','/sql-wasm.wasm','/manifest.webmanifest','/icon-192.png','/icon-512.png','/apple-touch-icon.png',...assets.map(a=>'/assets/'+a)];
const version=createHash('sha256').update(await readFile('dist/index.html')).digest('hex').slice(0,16);
await writeFile('dist/sw.js',`const CACHE='tandem-${version}'; const FILES=${JSON.stringify(files)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(caches.match(event.request,{ignoreVary:true}).then(cached=>cached||fetch(event.request)));});`);
