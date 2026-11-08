'use strict';
const {fs,path,assert,chromium,expect,DIR,actor,api,goto,shot,rows,literal}=require('./support.cjs');
const report={startedAt:new Date().toISOString()};
(async()=>{
 const browser=await chromium.launch();
 try{
  const A=await actor(browser,'A');
  const playlist='PLBCF2DAC6FFB574DE';
  const preview=await A.page.evaluate(async id=>{
   const token=await window.ULAuth.getAccessToken();
   const r=await fetch('/api/v1/songs/import-playlist/preview?url='+encodeURIComponent('https://www.youtube.com/playlist?list='+id),{headers:{Authorization:'Bearer '+token}});
   return {status:r.status,body:await r.json()};
  },playlist);
  report.playlist={previewStatus:preview.status,code:preview.body.code,itemCount:preview.body.itemCount};
  if(preview.status===200 && preview.body.itemCount<=20){
   const r=await api(A,'POST','/api/v1/songs/import-playlist',{url:'https://www.youtube.com/playlist?list='+playlist,newCategory:true,categoryName:'AV3 실재생목록'});
   const count=rows(`SELECT count(*)::int AS count FROM song_categories WHERE user_id=${literal(A.id)} AND category_id=${literal(r.categoryId)}`)[0].count;
   assert.equal(count,r.imported+r.alreadyInLibrary);
   await goto(A,'/log.html#songs');
   await expect(A.page.locator('#songList')).toBeVisible();
   await shot(A,'J8-real-playlist-library');
   report.playlist={...report.playlist,status:'pass',imported:r.imported,alreadyInLibrary:r.alreadyInLibrary,skippedLimit:r.skippedLimit,skippedUnavailable:r.skippedUnavailable,persistedCount:count};
  }else { report.playlist.status=preview.status===200?'preview-pass-import-not-run-large-fixture':'external-blocked'; process.exitCode=1; }
  try{
   await goto(A,'/practice.html?v=M7lc1UVf-VE&a=10&b=13&r=0.75');
   await expect(A.page.locator('#playBtn')).toBeEnabled({timeout:45000});
   await A.page.locator('#playBtn').click();
   let frame;
   await expect.poll(()=>{frame=A.page.frames().find(f=>f.url().startsWith('https://www.youtube.com/embed/'));return !!frame},{timeout:15000}).toBe(true);
   const video=frame.locator('video');await video.waitFor({timeout:30000});
   const samples=[];
   await expect.poll(async()=>{
    const state=await video.evaluate(v=>({time:v.currentTime,paused:v.paused,rate:v.playbackRate,ready:v.readyState,muted:v.muted,duration:v.duration}));
    samples.push(state);
    return samples.some((s,i)=>i>0 && samples[i-1].time>11.5 && s.time<11.5 && !s.paused);
   },{timeout:45000,intervals:[250]}).toBe(true);
   const playing=samples.filter(s=>!s.paused&&s.ready>=2);
   assert.ok(playing.length>2);assert.ok(playing.some(s=>s.rate===.75));
   report.player={video:'M7lc1UVf-VE',status:'pass',playingSamples:playing.length,rate:.75,loopObserved:true,unmuted:playing.some(s=>!s.muted),limitation:'real video pipeline/time/rate verified, physical sound output not human-confirmed'};
   await A.page.locator('#playBtn').click();await shot(A,'J8-real-youtube-player');
  }catch(error){process.exitCode=1;report.player={video:'M7lc1UVf-VE',status:'blocked-or-failed',error:error.message.split('\n')[0]};await shot(A,'J8-youtube-blocker');}
 }finally{
  fs.writeFileSync(path.join(DIR,'youtube-live.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));await browser.close();
 }
})().catch(error=>{console.error(error.message);process.exitCode=1});
