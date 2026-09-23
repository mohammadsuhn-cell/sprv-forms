import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
const files = walk("dist")
  .filter((p) => !p.endsWith("sw.js"))
  .map((p) => "./" + p.slice(5));
const version = files
  .reduce(
    (hash, file) => hash.update(fs.readFileSync("dist/" + file.slice(2))),
    createHash("sha256"),
  )
  .digest("hex")
  .slice(0, 12);
fs.writeFileSync(
  "dist/sw.js",
  `const CACHE='sprv-forms-${version}';const FILES=${JSON.stringify(files)};self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));});self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('sprv-forms-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('./index.html')));return;}event.respondWith(caches.match(event.request,{ignoreVary:true}).then(hit=>hit||fetch(event.request)));});`,
);
console.log("Offline assets:", files.length);
