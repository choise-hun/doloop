'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const load=()=>{
 const ctx={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('frontend/src/lib/recentSongCache.mts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 return ctx.exports;
};
const store=(init={})=>{const m=new Map(Object.entries(init));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),m}};
const song={videoId:'v1',title:'곡',a:1,b:2,pos:null,rate:0.75,memo:'m'};

test('peekStoredUid: ulp:auth의 user.id만 읽고 깨진 값은 null', ()=>{
 const {peekStoredUid}=load();
 assert.equal(peekStoredUid(store({'ulp:auth':JSON.stringify({user:{id:'A'},access_token:'x'})})),'A');
 assert.equal(peekStoredUid(store()),null);
 assert.equal(peekStoredUid(store({'ulp:auth':'{bad'})),null);
 assert.equal(peekStoredUid(store({'ulp:auth':JSON.stringify({user:{id:5}})})),null);
 assert.equal(peekStoredUid(null),null);
});

test('다른 uid의 캐시는 읽지 않는다(계정 전환·공용 기기)', ()=>{
 const {readRecentSongCache,writeRecentSongCache}=load();
 const st=store();
 writeRecentSongCache('A',song,st);
 assert.deepEqual({...readRecentSongCache('A',st)},song);
 assert.equal(readRecentSongCache('B',st),null);
 assert.equal(readRecentSongCache(null,st),null);
});

test('성공 0곡(null) 저장은 캐시를 지운다', ()=>{
 const {readRecentSongCache,writeRecentSongCache}=load();
 const st=store();
 writeRecentSongCache('A',song,st);
 writeRecentSongCache('A',null,st);
 assert.equal(readRecentSongCache('A',st),null);
});

test('깨진·필드 누락 캐시는 null, 숫자 필드는 정규화', ()=>{
 const {readRecentSongCache}=load();
 assert.equal(readRecentSongCache('A',store({'ulp:recentSong':'{bad'})),null);
 assert.equal(readRecentSongCache('A',store({'ulp:recentSong':JSON.stringify({uid:'A',song:{title:'x'}})})),null);
 const r=readRecentSongCache('A',store({'ulp:recentSong':JSON.stringify({uid:'A',song:{videoId:'v',title:'t',a:'x',rate:1}})}));
 assert.equal(r.a,null);assert.equal(r.rate,1);assert.equal(r.memo,'');
});
