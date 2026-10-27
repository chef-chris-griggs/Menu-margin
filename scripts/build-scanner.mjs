import { build } from 'esbuild';
import { mkdir,copyFile,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const out='vendor/scanner';await mkdir(out,{recursive:true});
const shared={bundle:true,minify:true,target:'es2022',platform:'browser',legalComments:'eof',external:['fs','path','crypto','module','node:*'],logLevel:'info'};
await build({...shared,entryPoints:['scanner/engine.js'],outfile:`${out}/scanner.worker.js`,format:'esm'});
await build({...shared,entryPoints:['scanner/client.js'],outfile:`${out}/client.js`,format:'iife',globalName:'MenuMarginScanner'});
await build({...shared,entryPoints:['scanner/heic-decoder.js'],outfile:`${out}/heic-decoder.js`,format:'esm'});
for(const name of ['ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.mjs'])await copyFile(`node_modules/onnxruntime-web/dist/${name}`,`${out}/${name}`);
await mkdir(`${out}/licenses`,{recursive:true});
for(const [from,to] of [
  ['node_modules/heic-to/LICENSE','heic-to-LGPL-3.0.txt'],
  ['scanner/paddleocr/LICENSE','PaddleOCR-Apache-2.0.txt'],
  ['node_modules/@techstark/opencv-js/LICENSE','OpenCV-Apache-2.0.txt'],
  ['node_modules/js-yaml/LICENSE','js-yaml-MIT.txt'],
  ['node_modules/platform/LICENSE','platform-MIT.txt'],
  ['node_modules/long/LICENSE','long-Apache-2.0.txt'],
  ['node_modules/protobufjs/LICENSE','protobufjs-BSD-3-Clause.txt'],
  ['node_modules/flatbuffers/LICENSE','flatbuffers-Apache-2.0.txt'],
])await copyFile(from,`${out}/licenses/${to}`);
// The ONNX npm tarball omits its LICENSE. Canonical upstream notices and
// LGPL source archives are checked into this repository; never omit them
// silently or fetch unpinned license material during a build.
for(const file of [
  'NOTICE.md','licenses/README.md','licenses/onnxruntime-MIT.txt',
  'licenses/onnxruntime-ThirdPartyNotices.txt','licenses/clipper-lib-NOTICE.txt',
  'licenses/Boost-1.0.txt','licenses/JSBN-Tom-Wu.txt','licenses/GPL-3.0.txt',
  'licenses/libheif-LGPL-3.0.txt','licenses/libde265-LGPL-3.0.txt',
  'licenses/Emscripten-LICENSE.txt','source/README.md','source/manifest.json',
  'source/heic-to-1.6.7.tgz','source/libheif-1.23.7.tar.gz',
  'source/libde265-1.0.16.tar.gz','source/libheif-build-emscripten.sh',
])await readFile(`${out}/${file}`);
const models=JSON.parse(await readFile(`${out}/models/manifest.json`,'utf8'));
const files=['client.js','scanner.worker.js','heic-decoder.js','ort-wasm-simd-threaded.wasm','ort-wasm-simd-threaded.mjs',...models.assets.map(a=>`models/${a.name}`)];
const assets=[];for(const file of files){const data=await readFile(`${out}/${file}`);assets.push({file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
await writeFile(`${out}/assets.json`,JSON.stringify({engineVersion:'2.0.0-positioned-paddleocr',builtAt:new Date().toISOString(),assets},null,2));
console.log('All scanner assets are self-hosted. Invoice contents are never sent to a remote OCR API.');
