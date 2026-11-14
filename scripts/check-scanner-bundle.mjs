import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile('vendor/scanner/assets.json','utf8'));
const before=new Map();
for(const a of manifest.assets){const b=await readFile('vendor/scanner/'+a.file);assert.equal(hash(b),a.sha256,a.file+' manifest hash');assert.equal(b.length,a.bytes);before.set(a.file,hash(b));}
const r=spawnSync(process.execPath,['scripts/build-scanner.mjs'],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
for(const [name,sha]of before)assert.equal(hash(await readFile('vendor/scanner/'+name)),sha,name+' must reproduce from source');
assert.deepEqual(JSON.parse(await readFile('vendor/scanner/assets.json','utf8')),manifest,'Unchanged assets must produce stable metadata');
console.log('PASS pinned scanner source reproduces all checked-in runtime/model assets and metadata');
