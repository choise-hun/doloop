'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const tick=()=>new Promise(r=>setImmediate(r));
async function setup(holdInitial=false){
 let session={user:{id:'A'},access_token:'token-A'},change;
 const cache=new Map(),requests=[],langs=[],events=[];
 const ctx={exports:{},require:name=>name==='react'?{}:{syncLangFromProfile:x=>langs.push(x),t:x=>x},localStorage:{setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)},window:{ULEVELP_CONFIG:{supabaseUrl:'https://test',supabaseAnonKey:'test'},supabase:{createClient:()=>({auth:{getSession:async()=>({data:{session}}),onAuthStateChange:fn=>{change=fn},signOut:async()=>{session=null;change('SIGNED_OUT',null)}}})}},fetch:async(url,opts)=>{const d=defer();requests.push({url,opts,d});return d.promise}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('frontend/src/lib/auth.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 const auth=ctx.exports.auth;
 const profile=(id,locale='ko')=>({id,displayName:id,locale,keys:{notion:{hint:id}}});
 const reply=(req,id,ok=true)=>req.d.resolve({status:ok?200:500,ok,json:async()=>profile(id,id==='A'?'en':'ja')});
 await tick();if(!holdInitial){reply(requests.shift(),'A');await tick()}auth.onChange(s=>events.push(s.me?.id??null));
 return {auth,cache,langs,events,requests,reply,refresh(){session={user:{id:'A'},access_token:'refreshed-A'};change('TOKEN_REFRESHED',session)},async change(id){session=id?{user:{id},access_token:'token-'+id}:null;change(id?'SIGNED_IN':'SIGNED_OUT',session);await tick();if(id){reply(requests.shift(),id);await tick()}}};
}
for(const method of ['GET','PATCH'])for(const ok of [true,false])for(const transition of ['B','logout','relogin','reverse'])test(`${method} ${ok?'success':'failure'} ${transition} discards all stale effects`,async()=>{
 const h=await setup();
 const promise=method==='GET'?h.auth.fetchMe():h.auth.updateProfile({shareAutosync:true});
 const outcome=promise.then(value=>({value}),error=>({error}));
 await tick();const old=h.requests.shift();
 if(transition==='B')await h.change('B');
 if(transition==='logout')await h.auth.signOut();
 if(transition==='relogin'){await h.auth.signOut();await h.change('A')}
 if(transition==='reverse'){
  const latest=method==='GET'?h.auth.updateProfile({locale:'en'}):h.auth.fetchMe();
  await tick();h.reply(h.requests.shift(),'A');await latest;
 }
 const before={me:h.auth.getMe(),cache:[...h.cache],langs:[...h.langs],events:[...h.events]};
 h.reply(old,'A',ok);const result=await outcome;
 assert.deepEqual({me:h.auth.getMe(),cache:[...h.cache],langs:[...h.langs],events:[...h.events]},before);
 if(method==='GET')assert.equal(result.value,null);else assert.equal(result.error?.name,'AbortError');
});
test('current PATCH synchronizes locale, cache and caller result',async()=>{
 const h=await setup();const p=h.auth.updateProfile({locale:'ja'});await tick();h.requests.shift().d.resolve({status:200,ok:true,json:async()=>({id:'A',locale:'ja',keys:{notion:{hint:'new'}}})});const me=await p;
 assert.equal(me,h.auth.getMe());assert.equal(h.langs.at(-1),'ja');assert.equal(JSON.parse(h.cache.get('ulp:keys')).uid,'A');
});
for(const method of ['GET','PATCH'])test(`${method} token lookup delayed across account change never sends new account request`,async()=>{
 const h=await setup(),d=defer();const sdk=h.auth.getClient().auth;const original=sdk.getSession;
 sdk.getSession=()=>d.promise;
 const result=(method==='GET'?h.auth.fetchMe():h.auth.updateProfile({locale:'en'})).then(value=>({value}),error=>({error}));
 sdk.getSession=original;await h.change('B');
 const before={me:h.auth.getMe(),events:[...h.events],cache:[...h.cache],langs:[...h.langs]};
 d.resolve({data:{session:{user:{id:'A'},access_token:'old-A'}}});const outcome=await result;
 assert.equal(h.auth.getUser().id,'B');assert.equal(h.requests.length,0);
 assert.deepEqual({me:h.auth.getMe(),events:[...h.events],cache:[...h.cache],langs:[...h.langs]},before);
 if(method==='GET')assert.equal(outcome.value,null);else assert.equal(outcome.error?.name,'AbortError');
});
for(const method of ['GET','PATCH'])test(`${method} mismatched response uid never becomes active profile`,async()=>{
 const h=await setup();const result=(method==='GET'?h.auth.fetchMe():h.auth.updateProfile({locale:'en'})).then(value=>({value}),error=>({error}));await tick();h.reply(h.requests.shift(),'B');await result;
 assert.notEqual(h.auth.getMe()?.id,'B');assert.notEqual(h.cache.has('ulp:keys')?JSON.parse(h.cache.get('ulp:keys')).uid:null,'B');
});
test('logout in flight blocks SDK cached token; completion preserves new account storage and notifications',async()=>{
 const h=await setup(),d=defer();h.auth.getClient().auth.signOut=()=>d.promise;
 const logout=h.auth.signOut();assert.equal(await h.auth.getAccessToken(),'');assert.equal(h.auth.getMe(),null);
 await h.change('B');h.cache.set('ulp:auth','new-B-session');const before=[...h.events];
 d.resolve();await logout;
 assert.equal(h.auth.getUser().id,'B');assert.equal(h.cache.get('ulp:auth'),'new-B-session');assert.deepEqual(h.events,before);
});
for(const method of ['GET','PATCH'])test(`${method} current HTTP failure keeps its documented result`,async()=>{
 const h=await setup();const result=(method==='GET'?h.auth.fetchMe():h.auth.updateProfile({locale:'en'})).then(value=>({value}),error=>({error}));await tick();h.reply(h.requests.shift(),'A',false);const outcome=await result;
 if(method==='GET'){assert.equal(outcome.value,null);assert.equal(h.auth.getMe(),null);assert.equal(h.cache.has('ulp:keys'),false);assert.equal(h.langs.at(-1),null)}
 else{assert.equal(outcome.error.status,500);assert.equal(h.auth.getMe().id,'A')}
});

test('auth transition during initial GET is observed before the first profile completes',async()=>{
 const h=await setup(true);const old=h.requests.shift();await h.change('B');
 const before=[...h.events];h.reply(old,'A');await tick();
 assert.equal(h.auth.getUser().id,'B');assert.equal(h.auth.getMe().id,'B');assert.deepEqual(h.events,before);
});

test('same uid session refresh preserves an in-flight profile request',async()=>{
 const h=await setup();const p=h.auth.fetchMe();await tick();const pending=h.requests.shift();h.refresh();h.reply(pending,'A');
 assert.equal((await p).id,'A');assert.equal(h.auth.getMe().id,'A');
});
