'use strict';
const {fs,path,assert,chromium,expect,DIR,actor,goto,api,noWrite}=require('./support.cjs');
(async()=>{const browser=await chromium.launch(),report=[];
 try{for(const role of ['A','B']){
 const who=await actor(browser,role);
 for(const route of ['/settings.html','/notes.html','/practice.html','/log.html#community']){
  await goto(who,route);assert.equal(await who.page.locator('#root').count(),1);await expect(who.page.locator('#root')).not.toBeEmpty();
  assert.equal(await who.page.evaluate(()=>window.ULAuth.getMe()?.id),who.id);report.push({role,route,status:'pass'});
 }
 const other=role==='A'?'B':'A';
 const otherId=JSON.parse(fs.readFileSync(path.join(DIR,`identity-${other}.json`))).id;
 const {rows,literal}=require('./support.cjs');
 const song=rows(`SELECT id FROM songs WHERE user_id=${literal(otherId)} ORDER BY created_at LIMIT 1`)[0];assert.ok(song);
 await noWrite(async()=>{await api(who,'GET',`/api/v1/songs/${song.id}`,undefined,404);await api(who,'PATCH',`/api/v1/songs/${song.id}`,{memo:'unauthorized'},404)});
 report.push({role,ownership:'other account GET/PATCH song 404, full DB snapshot unchanged',status:'pass'});
 await noWrite(async()=>{for(const route of ['/api/v1/me','/api/v1/songs','/api/v1/notes','/api/v1/community/folders'])await api(who,'GET',route)});
 report.push({role,apis:'profile/songs/notes/community read; DB unchanged',status:'pass'});await who.context.close();
 }
 }finally{fs.writeFileSync(path.join(DIR,'profile-smoke.json'),JSON.stringify(report,null,2),{mode:0o600});await browser.close()}
 console.log(`${report.length} real-account smoke checks passed`);
})().catch(e=>{console.error(e.message);process.exitCode=1});
