// M1A-2 R1: iOS 앱 원격 플레이어 분기 통합(명세 §8.1 R1, PR #38 리뷰 P1).
// 플랫폼 강제: @capacitor/core 8.6.2의 getPlatform()은 window.CapacitorCustomPlatform.name을 먼저 본다
// (node_modules/@capacitor/core/dist/index.js createCapacitor — 공식 문서에는 강제 방법이 없어 소스로 확인).
// 앱 번들처럼 페이지 CSP frame-src에 플레이어 출처를 더한다(scripts/build-app-web.mjs addFrameSrcOrigin과 같은 결과 —
// Playwright 작업자에서 .mjs 동적 import가 멈춰 여기서 직접 바꾼다. 실제 함수는 test/app_web_bundle.test.js B4가 검증).
'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES } = require('./support/mock-app');

const PLAYER_ORIGIN = 'https://player.m1a2.test';
const PLAYER_URL = `${PLAYER_ORIGIN}/player-embed.html`;

// 가짜 플레이어 페이지: ready를 보내고, 받은 명령을 기록하며, play를 받으면 재생 status를 보낸다
const addFrameSrcOrigin = (html, origin) => {
  const out = html.replace(/(Content-Security-Policy" content="[^"]*frame-src [^;"]*)/, `$1 ${origin}`);
  if (out === html) throw new Error('frame-src 지시문을 찾지 못함');
  return out;
};

const FAKE_PLAYER = `<!doctype html><html><body><script>
  window.__cmds = [];
  var parentOrigin = new URLSearchParams(location.search).get('parent');
  function send(m) { window.parent.postMessage(m, parentOrigin); }
  window.addEventListener('message', function (e) {
    if (e.origin !== parentOrigin || e.source !== window.parent) return;
    window.__cmds.push(e.data);
    // 재생 status는 첫 ready와 다른 지원 배속 목록을 싣는다(영상 전환 뒤 목록 갱신, PR #39 리뷰)
    if (e.data && e.data.cmd === 'play') send({ type: 'status', time: 42, duration: 200, state: 1, rate: 1, rates: [0.5, 1], title: 'Remote Song', author: 'Remote Band' });
  });
  send({ type: 'ready', duration: 200, rates: [0.25, 0.5, 0.75, 1], title: 'Remote Song', author: 'Remote Band' });
  send({ type: 'status', time: 0, duration: 200, state: 5, rate: 1, title: 'Remote Song', author: 'Remote Band' });
</script></body></html>`;

test('R1 iOS 원격 분기: YT 스크립트 없이 #player iframe이 플레이어 주소로 생기고 ▶가 play 명령, status가 시간 표시로', async ({ page }) => {
  const ytApiRequests = [];
  page.on('request', (req) => {
    if (req.url().startsWith('https://www.youtube.com/iframe_api')) ytApiRequests.push(req.url());
  });

  await page.addInitScript(() => {
    window.CapacitorCustomPlatform = { name: 'ios' };
  });
  await mockApp(page, STATES.userData);
  // mockApp의 HTML 처리(integrity 제거)에 더해 앱 번들과 같은 frame-src를 만든다(나중 등록이 먼저 매칭)
  await page.route(
    (url) => url.pathname.endsWith('.html') || url.pathname === '/',
    async (route) => {
      const response = await route.fetch();
      const body = addFrameSrcOrigin((await response.text()).replace(/\sintegrity="[^"]*"/g, ''), PLAYER_ORIGIN);
      await route.fulfill({ response, body, headers: { ...response.headers(), 'content-length': String(Buffer.byteLength(body)) } });
    }
  );
  await page.route((url) => url.pathname === '/config.js', async (route) => {
    const response = await route.fetch();
    const body = `${await response.text()}\nwindow.ULEVELP_CONFIG.playerEmbedUrl = ${JSON.stringify(PLAYER_URL)};\n`;
    await route.fulfill({ response, body, headers: { ...response.headers(), 'content-length': String(Buffer.byteLength(body)) } });
  });
  await page.route((url) => url.origin === PLAYER_ORIGIN, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FAKE_PLAYER })
  );

  await page.goto('/practice.html?v=jNQXAC9IVRw', { waitUntil: 'load' });

  const iframe = page.locator('iframe#player');
  await expect(iframe).toHaveCount(1);
  const src = new URL(await iframe.getAttribute('src'));
  expect(src.origin + src.pathname).toBe(PLAYER_URL);
  expect(src.searchParams.get('v')).toBe('jNQXAC9IVRw');
  expect(src.searchParams.get('parent')).toBe(new URL(page.url()).origin);

  const player = page.frame({ url: (u) => u.origin === PLAYER_ORIGIN });
  expect(player).not.toBeNull();
  // ready → onReady가 길이를 반영한 뒤에야 ▶가 명령을 보낸다(준비 전 클릭은 PracticePage가 무시)
  await expect(page.locator('#tDur')).toHaveText('3:20');
  const rateBtn = (label) => page.locator('#rates button', { hasText: new RegExp(`^${label.replace('.', '\\.')}$`) });
  await expect(rateBtn('0.25')).toBeEnabled();
  await expect(rateBtn('0.75')).toBeEnabled();
  await page.locator('#playBtn').click();
  await expect.poll(() => player.evaluate(() => window.__cmds.map((c) => c.cmd))).toContain('play');
  await expect(page.locator('#playBtn')).toHaveText('❚❚');
  await expect(page.locator('#tNow')).toHaveText(/^0:4[2-3]$/);
  await expect(rateBtn('0.25')).toBeDisabled();
  await expect(rateBtn('0.75')).toBeDisabled();
  await expect(rateBtn('0.5')).toBeEnabled();
  await expect(rateBtn('1.0')).toBeEnabled();

  expect(await page.evaluate(() => typeof window.YT)).toBe('undefined');
  expect(ytApiRequests).toEqual([]);
});
