'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const defer = () => { let resolve,reject; const promise=new Promise((r,j)=>{resolve=r;reject=j});return {promise,resolve,reject}; };
const tick = () => new Promise(r=>setImmediate(r));

function setup(base='https://api.test') {
 let session={user:{id:'A'},access_token:'A-token'},generation=1;
 const requests=[], cache={};
 const auth={getSession:()=>session,getSessionGeneration:()=>generation,getAccessToken:async()=>session?.access_token||''};
 const ctx=vm.createContext({console,URL,window:{ULEVELP_CONFIG:{apiBaseUrl:base},ULAuth:auth},
  fetch:(url,opts)=>{const gate=defer();requests.push({url,opts,gate});return gate.promise;}});
 function load(name){
  if(name==='./auth')return {auth};
  if(name==='./i18n.mts')return {t:x=>x,getLang:()=> 'ja'};
  if(cache[name])return cache[name];
  const module={exports:{}};cache[name]=module.exports;
  const code=ts.transpileModule(fs.readFileSync(`frontend/src/lib/${name.replace('./','')}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInContext(`(function(require,exports){${code}\n})`,ctx)(load,module.exports);return module.exports;
 }
 return {api:load('./apiClient').apiClient,resolve:load('./apiUrl').resolveApiUrl,auth,requests,
  change(id){generation++;session=id?{user:{id},access_token:id+'-token'}:null;},
  reply(req,body={ok:true},blob='blob-A'){req.gate.resolve({ok:true,status:200,json:async()=>body,blob:async()=>blob,headers:{get:()=> 'attachment; filename="export-test.zip"'}});}};
}

for(const base of ['https://api.test',''])test(`A1 direct fetch paths use the configured base ${base||'web-relative'}`,async()=>{
 const h=setup(base);
 const calls=[()=>h.api.saveProgress({songId:'song',date:'2026-11-16'},{keepalive:true}),()=>h.api.nx.exportZip(false),()=>h.api.takes.downloadBlob('take-id')];
 const paths=['/api/v1/practice/save','/api/v1/export/zip?includeAudio=false','/api/v1/takes/take-id/download'];
 for(let i=0;i<calls.length;i++){
  const pending=calls[i]();await tick();const req=h.requests.shift();
  assert.equal(req.url,base+paths[i]);assert.equal(req.opts.headers.Authorization,'Bearer A-token');assert.equal(req.opts.headers['Accept-Language'],'ja');
  if(i===0)assert.equal(req.opts.keepalive,true);
  h.reply(req);const result=await pending;
  if(i===1){assert.equal(result.filename,'export-test.zip');assert.equal(result.blob,'blob-A');}
 }
});

for(const method of ['zip','take'])for(const stage of ['token','response','blob'])test(`A2 ${method} drops account changes during ${stage}`,async()=>{
 const h=setup(),gate=defer();
 if(stage==='token')h.auth.getAccessToken=()=>gate.promise;
 const result=(method==='zip'?h.api.nx.exportZip():h.api.takes.downloadBlob('take')).then(value=>({value}),error=>({error}));
 await tick();
 if(stage==='token'){h.change('B');gate.resolve('A-token');}
 else {
  const req=h.requests.shift();
  if(stage==='blob'){
   req.gate.resolve({ok:true,status:200,headers:{get:()=>''},blob:()=>gate.promise});await tick();
   h.change('B');gate.resolve('A-blob');
  }else{h.change('B');h.reply(req);}
 }
 assert.equal((await result).error.name,'AbortError');
 assert.equal(h.requests.length,0);
});

test('A1 URL resolver rejects alternate hosts and API traversal',async()=>{
 const h=setup();
 for(const value of ['https://evil.test/api/v1/me','//evil.test/api/v1/me','/api/v1/../secret','/api/v1/%2e%2e/secret','/api/v1/ok#secret','/api/v1/ok\\evil','/api/v1/a%2fb'])assert.throws(()=>h.resolve(value),value);
 h.change(null);await assert.rejects(()=>h.api.saveProgress({},{keepalive:true}),{code:'NOT_LOGGED_IN'});
});


test('A2 late transport errors and invalid keepalive config remain rejected Promises',async()=>{
 for(const method of ['zip','take','save']){
  const h=setup();const request=method==='zip'?h.api.nx.exportZip():method==='take'?h.api.takes.downloadBlob('id'):h.api.saveProgress({},{keepalive:true});
  const outcome=request.then(value=>({value}),error=>({error}));await tick();const req=h.requests.shift();h.change('B');req.gate.reject(new TypeError('offline'));
  assert.equal((await outcome).error.name,'AbortError');
 }
 const h=setup('http://insecure.test');
 await assert.rejects(()=>h.api.saveProgress({},{keepalive:true}),/Invalid API origin/);
 assert.equal(h.requests.length,0);
});
