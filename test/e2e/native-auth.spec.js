'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES, DEFAULT_ME } = require('./support/mock-app');
const fs = require('node:fs');

async function nativeApp(page) {
  await mockApp(page, STATES.guest);
  await page.addInitScript(() => {
    window.CapacitorCustomPlatform = { name: 'ios' };
    window.__nativeEvents = {};
    window.__nativeCalls = [];
    window.Capacitor = {
      PluginHeaders: ['App', 'Browser'].map(name => ({ name, methods: [
        { name: 'addListener', rtype: 'callback' },
        ...['removeListener','getLaunchUrl','open','close'].map(name => ({ name, rtype:'promise' })),
      ] })),
      nativeCallback(plugin, method, options, callback) {
        window.__nativeEvents[options.eventName] = callback;
        return options.eventName;
      },
      nativePromise: async (plugin, method, options) => { window.__nativeCalls.push({plugin,method,options}); return {}; },
    };
  });
  await page.route('**/supabase.js', route => route.fulfill({ contentType:'application/javascript', body: `
    window.supabase = {createClient() {
      let session=null, changed=()=>{};
      return {auth:{
        getSession:async()=>({data:{session}}),
        onAuthStateChange(cb){changed=cb;return{}},
        signInWithOAuth:async()=>({data:{provider:'google',url:'https://vefrfhafmiiivpgjhqiu.supabase.co/auth/v1/authorize?provider=google',flowId:'e2e-flow'}}),
        exchangeCodeForSession:async(code,options)=>{
          window.__exchanged={code,options};
          session={access_token:'fake-jwt-token',user:{id:${JSON.stringify(DEFAULT_ME.id)},email:'test@example.com'}};
          changed('SIGNED_IN',session);return {data:{session,user:session.user}};
        },
        signOut:async()=>{session=null;changed('SIGNED_OUT',null);return{}},
      }};
    }};` }));
}

for (const width of [390, 768, 1150, 1280]) {
  test(`M1A3 UI ${width}px native login pending, callback and cancellation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await nativeApp(page);
    await page.goto('/settings.html#account');
    const status = page.locator('main #nativeAuthStatus');
    await expect(status).toHaveCount(1);
    await expect(status).toHaveAttribute('role', 'status');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(status).toBeHidden();
    await page.locator('#btnLogin').click();
    await expect(status).toContainText('인증을 완료');
    await expect(page.locator('#btnLogin')).toBeDisabled();
    await expect.poll(() => page.evaluate(() => window.__nativeCalls.some(x=>x.method==='open'))).toBe(true);
    const main=await page.locator('main').boundingBox(),box=await status.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(main.x);expect(box.x+box.width).toBeLessThanOrEqual(main.x+main.width+1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if(process.env.LAYOUT_SHOTS){fs.mkdirSync('test-results/m1a3',{recursive:true});await page.screenshot({path:`test-results/m1a3/pending-${width}.png`,fullPage:true});}
    await page.evaluate(()=>window.__nativeEvents.browserFinished({}));
    await expect(status).toContainText('취소');
    await expect(page.locator('#btnLogin')).toBeEnabled();
    await page.locator('#btnLogin').click();
    await expect(page.locator('#btnLogin')).toBeDisabled();
    await page.evaluate(()=>window.__nativeEvents.appUrlOpen({url:'ulevelp://auth/callback?code=e2e-code'}));
    await expect(page.locator('#navAuth')).toHaveAttribute('data-auth-state','signed-in');
    await expect(status).toBeHidden();
    expect(await page.evaluate(()=>window.__exchanged.options.flowId)).toBe('e2e-flow');
  });
}

test('M1A3 native navigation login cancellation stays on the current page and announces retry',async({page})=>{
 await nativeApp(page);await page.goto('/');
 await page.locator('#navAuth').click();
 await expect(page.locator('#nativeAuthStatus')).toBeVisible();
 await page.evaluate(()=>window.__nativeEvents.browserFinished({}));
 await expect(page.locator('#nativeAuthStatus')).toContainText('취소');
 expect(new URL(page.url()).pathname).toBe('/');
 await expect(page.locator('#navAuth')).toHaveAttribute('data-auth-state','signed-out');
});
