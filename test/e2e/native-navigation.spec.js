'use strict';
const { test, expect } = require('@playwright/test');
const { mockApp, STATES } = require('./support/mock-app');

async function app(page) {
  await page.addInitScript(() => {
    window.__swipeMessages = [];
    window.webkit = { messageHandlers: { redoNavigation: { postMessage: state => window.__swipeMessages.push(state) } } };
  });
  await mockApp(page, STATES.guest);
  await page.goto('/practice.html?v=jNQXAC9IVRw');
  await page.locator('#seekRow').waitFor();
}

test('NAVG-1: 마이크 권한 대기 중 잠금, 거부 후 해제', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: () => new Promise((_resolve, reject) => { window.__denyMic = () => reject(new DOMException('denied', 'NotAllowedError')); }),
    } });
  });
  await app(page);
  await expect.poll(() => page.evaluate(() => window.__redoSwipeState?.blocked)).toBe(false);
  await page.locator('#recBtn').click();
  await expect.poll(() => page.evaluate(() => window.__redoSwipeState?.blocked)).toBe(true);
  await page.evaluate(() => window.__denyMic());
  await expect(page.locator('#recMsg')).toContainText('마이크 권한');
  await expect.poll(() => page.evaluate(() => window.__redoSwipeState?.blocked)).toBe(false);
});

test('NAVG-2: 녹음 중 및 정지 후 미완료 take가 있는 동안 잠금을 유지한다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [{ stop() {} }] });
    window.MediaRecorder = class {
      static isTypeSupported() { return true; }
      state = 'inactive'; mimeType = 'audio/webm';
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['recording']) }); this.onstop(); }
    };
  });
  await app(page);
  await page.locator('#recBtn').click();
  await expect(page.locator('#recBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__redoSwipeState?.blocked)).toBe(true);
  await page.locator('#recBtn').click();
  await expect(page.locator('#recBtn')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => page.evaluate(() => window.__redoSwipeState?.blocked)).toBe(true);
});

test('NAVG-3: 보이는 모달만 잠그고 숨기면 해제하며 순번이 증가한다', async ({ page }) => {
  await app(page);
  await page.evaluate(() => {
    const modal = document.createElement('div'); modal.id = 'guardModal'; modal.setAttribute('aria-modal', 'true'); modal.textContent = 'guard'; document.body.append(modal);
  });
  await expect.poll(() => page.evaluate(() => window.__redoSwipeState?.blocked)).toBe(true);
  const state = await page.evaluate(() => window.__redoSwipeState);
  await page.evaluate(() => { document.getElementById('guardModal').hidden = true; });
  await expect.poll(() => page.evaluate(() => window.__redoSwipeState?.blocked)).toBe(false);
  expect((await page.evaluate(() => window.__redoSwipeState)).sequence).toBeGreaterThan(state.sequence);
});

test('NAVG-4: 마이크 권한 대기 중 SPA 이탈하면 잠금을 해제하고 늦은 스트림을 정지한다', async ({ page }) => {
  await page.addInitScript(() => {
    window.__stoppedTracks = 0;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: () => new Promise(resolve => { window.__allowMic = () => resolve({ getTracks: () => [{ stop() { window.__stoppedTracks++; } }] }); }),
    } });
  });
  await app(page);
  await page.locator('#recBtn').click();
  await expect.poll(() => page.evaluate(() => window.__redoSwipeState?.blocked)).toBe(true);
  await page.evaluate(() => { history.pushState({}, '', '/settings.html'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.locator('#recBtn')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__redoSwipeState?.blocked)).toBe(false);
  await page.evaluate(() => window.__allowMic());
  await expect.poll(() => page.evaluate(() => window.__stoppedTracks)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__redoSwipeState?.blocked)).toBe(false);
});
