// PF-1 프로필 화면 진입·인증 동선 분리 및 레이아웃 검사
// 명세: 개발산출물/명세/PF-1_구현명세.md
'use strict';
const { test, expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { mockApp, STATES } = require('../support/mock-app');

const USER_WITH_NAMES = {
  ...STATES.user,
  me: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'tester@example.com',
    displayName: '홍길동',
    publicName: 'gildong',
    role: 'user',
    storageProvider: 'supabase',
    driveFolderId: null,
    takeUsedBytes: 0,
    takeQuotaBytes: 209715200,
    migratedLocalAt: '2026-10-30T00:00:00Z',
    keys: { notion: null },
    tier: 'free',
    billingTier: 'free',
    limits: { songs: 10, categories: 2, takeBytes: 5242880, takeSongs: 2, takeDurationSec: 120, drive: false, ai: false, communityWrite: false },
    credits: { monthly: 0, purchased: 0 },
  },
};

const USER_LONG_TEXT = {
  ...STATES.user,
  me: {
    ...USER_WITH_NAMES.me,
    email: 'very-long-email-address-for-testing-profile-layout-overflow-handling@example.com',
    displayName: 'Very Long Display Name That Should Wrap Properly And Never Break Narrow Card Layout',
    publicName: 'VeryLongPublicNameWithoutAnySpacesToTestOverflowWrapAnywhereBehavior',
  },
};

async function profileReady(page, state) {
  await page.locator('#profileTitle').waitFor();
  if (state === 'guest') {
    await page.locator('#profileGuest').waitFor();
  } else {
    await page.locator('#profileUser').waitFor();
    if (['userWithNames', 'userLongText', 'logoutSuccess'].includes(state)) {
      await expect(page.locator('#profileDisplayName')).toBeVisible();
    }
    if (state === 'logoutSuccess') {
      await page.locator('#profileLogout').click();
      await expect(page.locator('#profileAuthMsg')).toHaveText('✓ 로그아웃했어요');
    }
    if (state === 'userEmptyNames') {
      await expect(page.locator('#profileEmail')).toContainText('tester@example.com');
      await expect(page.locator('#profileDisplayName, #profilePublicName')).toHaveCount(0);
    }
  }
}

// ---------------------------------------------------------------------------
// PF1-L: 레이아웃 검사 (상태 × 4폭 및 1280px 다크)
// ---------------------------------------------------------------------------
layoutSuite({
  name: 'profile',
  path: '/profile.html',
  states: [
    'guest',
    'user',
    { name: 'userWithNames', mock: USER_WITH_NAMES },
    { name: 'userLongText', mock: USER_LONG_TEXT },
    { name: 'userEmptyNames', mock: { ...USER_WITH_NAMES, me: { ...USER_WITH_NAMES.me, displayName: '', publicName: null } } },
    { name: 'logoutSuccess', mock: USER_WITH_NAMES },
  ],
  ready: profileReady,
  dark: 'userWithNames',
});

// ---------------------------------------------------------------------------
// PF1-01 ~ PF1-09: 단일 E2E 기능 및 상태·가드 검증
// ---------------------------------------------------------------------------
test.describe('PF1: 프로필 진입과 인증 동선', () => {
  test('PF1-01 signed-in entry: 홈 #navAuth 클릭 시 profile.html 이동 및 활성 표시', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockApp(page, STATES.user);
    await page.goto('/', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

    const navAuth = page.locator('#navAuth');
    await expect(navAuth).toBeVisible();
    await expect(navAuth).toHaveAttribute('href', 'profile.html');

    await navAuth.click();
    await expect(page).toHaveURL(/.*profile\.html/);
    await expect(page.locator('#profileTitle')).toHaveText('Profile');
    await expect(navAuth).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('nav.site-nav a[href="settings.html"]')).not.toHaveAttribute('aria-current', 'page');
  });

  test('PF1-02 route/reload: guest/user 각각 /profile.html 직접 진입, 새로고침, 뒤로/앞으로', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1) user 직접 진입 & 새로고침
    await mockApp(page, STATES.user);
    const respUser = await page.goto('/profile.html', { waitUntil: 'load' });
    expect(respUser.status()).toBe(200);
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');
    await expect(page.locator('#profileTitle')).toHaveText('Profile');
    await expect(page.locator('#profileUser')).toBeVisible();

    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('#profileTitle')).toHaveText('Profile');
    await expect(page.locator('#profileUser')).toBeVisible();

    // 2) 뒤로가기 / 앞으로가기 내비게이션
    await page.goto('/settings.html', { waitUntil: 'load' });
    await expect(page.locator('#account')).toBeVisible();
    await page.goBack({ waitUntil: 'load' });
    await expect(page.locator('#profileTitle')).toHaveText('Profile');
    await page.goForward({ waitUntil: 'load' });
    await expect(page.locator('#account')).toBeVisible();

    // 3) guest 직접 진입
    await mockApp(page, STATES.guest);
    const respGuest = await page.goto('/profile.html', { waitUntil: 'load' });
    expect(respGuest.status()).toBe(200);
    await expect(page.locator('#profileTitle')).toHaveText('Profile');
    await expect(page.locator('#profileGuest')).toBeVisible();
    await expect(page.locator('#profileUser')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('#profileGuest')).toBeVisible();
  });

  test('PF1-03 guest/embedded: guest 및 embedded 모드 분기 유지', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    // 1) 일반 guest 모드
    await mockApp(page, STATES.guest);
    await page.goto('/profile.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

    const navAuth = page.locator('#navAuth');
    await expect(navAuth).toHaveAttribute('href', 'settings.html#account');
    await expect(navAuth).not.toHaveAttribute('target', '_blank');

    const guestLogin = page.locator('#profileLoginLink');
    await expect(guestLogin).toBeVisible();
    await expect(guestLogin).toHaveAttribute('href', 'settings.html#account');
    await expect(guestLogin).not.toHaveAttribute('target', '_blank');
    await expect(guestLogin).toHaveText('Google로 로그인');

    // 2) embedded guest 모드 (iframe 내 진입: window.self !== window.top)
    const pageEmbed = await page.context().newPage();
    await pageEmbed.setViewportSize({ width: 1280, height: 900 });
    await mockApp(pageEmbed, STATES.guest);
    await pageEmbed.setContent('<iframe id="embedFrame" src="http://127.0.0.1:3000/profile.html" style="width:1280px;height:900px;border:none;"></iframe>');
    const frame = pageEmbed.frameLocator('#embedFrame');
    await frame.locator('#profileTitle').waitFor();

    const navAuthEmbed = frame.locator('#navAuth');
    await expect(navAuthEmbed).toHaveAttribute('target', '_blank');
    await expect(navAuthEmbed).toHaveAttribute('rel', 'noopener');

    const guestLoginEmbed = frame.locator('#profileLoginLink');
    await expect(guestLoginEmbed).toHaveAttribute('target', '_blank');
    await expect(guestLoginEmbed).toHaveAttribute('rel', 'noopener');
    await expect(guestLoginEmbed).toHaveText('새 창에서 로그인 ↗');
    await pageEmbed.close();
  });

  test('PF1-04 settings lock: 프로필에서 설정 이동 및 settings.html#account 계약 보존', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockApp(page, STATES.user);
    await page.goto('/profile.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

    const settingsLink = page.locator('#profileSettingsLink');
    await expect(settingsLink).toBeVisible();
    await expect(settingsLink).toHaveAttribute('href', 'settings.html');
    await settingsLink.click();

    await expect(page).toHaveURL(/.*settings\.html/);
    // Locked Contracts 셀렉터 유지 확인
    for (const id of [
      '#account',
      '#hAccount',
      '#accUser',
      '#accEmail',
      '#accName',
      '#accQuota',
      '#quotaText',
      '#quotaBar',
      '#driveStoragePanel',
      '#btnLogout',
      '#community',
      '#hCommunity',
      '#settingsPublicNameInput',
      '#settingsPublicNameSave',
      '#commAutosync',
      '#commPracticeLog',
    ]) {
      await expect(page.locator(id)).toBeVisible();
    }
    // #accMsg는 빈 텍스트 상태에서는 :empty로 display:none이나 DOM에 존재해야 함
    await expect(page.locator('#accMsg')).toBeAttached();
    await page.goto('/settings.html#account');
    await expect(page.locator('#accEmail')).toBeVisible();
  });

  test('PF1-05 logout: 로그아웃 성공 시 scope=local, ulp:keys 제거, guest 전환 및 성공 메시지', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockApp(page, {
      ...STATES.user,
      local: {
        'ulp:keys': JSON.stringify({ notion: 'notion-secret-token' }),
        'ulp:v:demo': JSON.stringify({ pos: 10 }),
      },
    });

    await page.goto('/profile.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

    // ulp:keys 존재 확인
    expect(await page.evaluate(() => localStorage.getItem('ulp:keys'))).toBeTruthy();

    const logoutBtn = page.locator('#profileLogout');
    await expect(logoutBtn).toBeVisible();
    await expect(page.locator('#profileUser')).toBeVisible();

    await logoutBtn.click();

    // 로그아웃 후 guest 동선 표시 및 성공 메시지
    await expect(page.locator('#profileGuest')).toBeVisible();
    await expect(page.locator('#profileUser')).toHaveCount(0);
    const authMsg = page.locator('#profileAuthMsg');
    await expect(authMsg).toHaveText('✓ 로그아웃했어요');
    await expect(authMsg).toHaveClass(/msg ok/);

    // navAuth 비로그인 복귀 확인
    const navAuth = page.locator('#navAuth');
    await expect(navAuth).toHaveAttribute('data-auth-state', 'signed-out');
    await expect(navAuth).toHaveAttribute('href', 'settings.html#account');

    // keys 캐시 제거 확인, 다른 로컬 데이터(ulp:v:demo)는 보존
    expect(await page.evaluate(() => localStorage.getItem('ulp:keys'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('ulp:v:demo'))).toBeTruthy();
  });

  test('PF1-06 A→B continuation & unmount guard: 계정 전환 시 이전 메시지 폐기 및 unmount 안전성', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockApp(page, USER_WITH_NAMES);
    await page.goto('/profile.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

    await expect(page.locator('#profileDisplayName')).toHaveText('홍길동');

    // B 계정으로 auth listener를 통해 이벤트 발생
    await page.evaluate(() => {
      if (typeof window.__supabaseAuthListener === 'function') {
        window.__supabaseAuthListener('SIGNED_IN', {
          access_token: 'fake-b-token',
          user: { id: '00000000-0000-4000-8000-000000000002', email: 'b@example.com', user_metadata: {} },
        });
      }
    });

    // 계정이 바뀌었으므로 이전 A 계정의 이름이나 메시지가 남지 않아야 함
    await expect(page.locator('#profileEmail')).toHaveText(/b@example\.com/);
    await expect(page.locator('#profileDisplayName')).toHaveCount(0);
    await expect(page.locator('#profileAuthMsg')).toHaveText('');

    // 문서 reload 대신 React 라우트만 바꾸고 같은 JS realm에서 지연 실패 완료.
    await page.evaluate(() => {
      window.ULAuth.signOut = () => new Promise((resolve, reject) => { window.__rejectUnmount = reject; });
    });
    await page.locator('#profileLogout').click();
    await page.evaluate(() => {
      history.pushState(null, '', '/privacy.html');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.locator('#profileTitle')).toHaveCount(0);
    await page.evaluate(() => {
      history.pushState(null, '', '/profile.html');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.locator('#profileLogout')).toBeEnabled();
    await page.evaluate(() => window.__rejectUnmount(new Error('UNMOUNTED_ERROR')));
    await expect(page.locator('#profileAuthMsg')).toHaveText('');

  });

  test('PF1-07 null/error/empty: /me 500 에러 또는 빈 이름 시 안전한 폴백', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    // /api/v1/me가 500을 반환하도록 route 지정
    await mockApp(page, {
      ...STATES.user,
      routes: [
        [
          (url) => url.pathname === '/api/v1/me',
          (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Server error' }) }),
        ],
      ],
    });

    await page.goto('/profile.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

    // user 이메일은 표시되고 이름 행은 생략됨
    await expect(page.locator('#profileEmail')).toHaveText(/a@example\.com/);
    await expect(page.locator('#profileDisplayName')).toHaveCount(0);
    await expect(page.locator('#profilePublicName')).toHaveCount(0);
    await expect(page.locator('#profileLogout')).toBeVisible();
    await expect(page.locator('#profileSettingsLink')).toBeVisible();
  });

  test('PF1-08 XSS/keyboard: HTML 페이로드 텍스트 렌더링 및 키보드 네비게이션', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const XSS_PAYLOAD = '<script id="xssScript">window.__xssExecuted = true;</script><img src=x onerror="window.__xssExecuted=true;">';
    await mockApp(page, {
      ...STATES.user,
      me: {
        ...USER_WITH_NAMES.me,
        email: XSS_PAYLOAD,
        displayName: XSS_PAYLOAD,
        publicName: 'xss<test>',
      },
    });

    await page.goto('/profile.html', { waitUntil: 'load' });
    test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

    // XSS 스크립트 실행되지 않음 확인
    const executed = await page.evaluate(() => Boolean(window.__xssExecuted));
    expect(executed).toBe(false);
    expect(await page.locator('#xssScript').count()).toBe(0);

    // 텍스트로만 렌더링됨 확인
    await expect(page.locator('#profileDisplayName')).toHaveText(XSS_PAYLOAD);
    await expect(page.locator('#profileEmail')).toContainText(XSS_PAYLOAD);

    // 키보드 탭 네비게이션
    await page.locator('#profileLogout').focus();
    await expect(page.locator('#profileLogout')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#profileSettingsLink')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/settings\.html$/);
  });

  test('PF1-09 다국어 (ko, en, ja) 문구 렌더링 검증', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    const checks = [
      { lang: 'ko', secTitle: '계정', logoutBtn: '로그아웃', emailLabel: '로그인 계정:' },
      { lang: 'en', secTitle: 'Account', logoutBtn: 'Sign out', emailLabel: 'Signed in as:' },
      { lang: 'ja', secTitle: 'アカウント', logoutBtn: 'ログアウト', emailLabel: 'ログイン中:' },
    ];

    for (const { lang, secTitle, logoutBtn, emailLabel } of checks) {
      await mockApp(page, {
        ...STATES.user,
        local: { 'ulp:lang': lang },
      });
      await page.goto('/profile.html', { waitUntil: 'load' });
      test.skip((await page.locator('#root').count()) === 0, 'legacy 모드: React 화면 아님');

      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('#profileAccountTitle')).toHaveText(secTitle);
      await expect(page.locator('#profileLogout')).toHaveText(logoutBtn);
      await expect(page.locator('#profileEmail')).toContainText(emailLabel);
    }
  });
  // auth.signOut 경계의 예외는 SDK가 삼키는 네트워크 예외와 별도로 주입한다.
  test('PF1-10 logout rejection: 원시 오류 대신 고정 실패 문구', async ({ page }) => {
    await mockApp(page, USER_WITH_NAMES);
    await page.goto('/profile.html');
    await expect(page.locator('#profileDisplayName')).toHaveText('홍길동');
    await page.evaluate(() => {
      window.__logoutCalls = 0;
      window.ULAuth.signOut = () => {
        window.__logoutCalls++;
        return new Promise((resolve, reject) => { window.__rejectLogout = reject; });
      };
      const button = document.querySelector('#profileLogout');
      button.click();
    });
    await expect(page.locator('#profileLogout')).toBeDisabled();
    expect(await page.evaluate(() => window.__logoutCalls)).toBe(1);
    await page.evaluate(() => window.__rejectLogout(new Error('PRIVATE_RAW_ERROR')));
    await expect(page.locator('#profileAuthMsg')).toHaveText('로그아웃 중 오류가 발생했어요.');
    await expect(page.locator('#profileAuthMsg')).toHaveClass(/msg err/);
    await expect(page.locator('#profileLogout')).toBeEnabled();
  });

  test('PF1-11 stale rejection/finally: 같은 uid 재로그인 후 새 작업 보호', async ({ page }) => {
    await mockApp(page, USER_WITH_NAMES);
    await page.goto('/profile.html');
    await expect(page.locator('#profileDisplayName')).toHaveText('홍길동');
    await page.evaluate(() => {
      window.__pendingLogouts = [];
      window.ULAuth.signOut = () => new Promise((resolve, reject) => {
        window.__pendingLogouts.push({ resolve, reject });
      });
    });
    await page.locator('#profileLogout').click();
    await page.evaluate(() => {
      const session = window.ULAuth.getSession();
      window.__supabaseAuthListener('SIGNED_OUT', null);
      window.__supabaseAuthListener('SIGNED_IN', session);
    });
    await expect(page.locator('#profileLogout')).toBeEnabled();
    await page.locator('#profileLogout').click();
    await page.evaluate(() => window.__pendingLogouts[0].reject(new Error('OLD_ACCOUNT_ERROR')));
    await expect(page.locator('#profileAuthMsg')).toHaveText('');
    await expect(page.locator('#profileLogout')).toBeDisabled();
    await page.evaluate(() => window.__pendingLogouts[1].reject(new Error('CURRENT_ERROR')));
    await expect(page.locator('#profileAuthMsg')).toHaveText('로그아웃 중 오류가 발생했어요.');
    await expect(page.locator('#profileLogout')).toBeEnabled();
  });

  test('PF1-12 SDK delayed logout: local 1회, A→B 후 A 완료 폐기', async ({ page }) => {
    await mockApp(page, USER_WITH_NAMES);
    await page.goto('/profile.html');
    await expect(page.locator('#profileDisplayName')).toHaveText('홍길동');
    await page.evaluate(() => {
      window.__sdkCalls = [];
      window.ULAuth.getClient().auth.signOut = (opts) => {
        window.__sdkCalls.push(opts);
        return new Promise(resolve => { window.__resolveSdkLogout = resolve; });
      };
      const button = document.querySelector('#profileLogout');
      button.click();
      button.click();
    });
    await expect(page.locator('#profileGuest')).toBeVisible();
    expect(await page.evaluate(() => window.__sdkCalls)).toEqual([{ scope: 'local' }]);
    await page.evaluate(() => {
      const session = { access_token: 'b-token', user: { id: '00000000-0000-4000-8000-000000000002', email: 'b@example.com' } };
      window.ULAuth.getClient().auth.getSession = async () => ({ data: { session } });
      window.__supabaseAuthListener('SIGNED_IN', session);
      window.__resolveSdkLogout({ error: null });
    });
    await expect(page.locator('#profileEmail')).toContainText('b@example.com');
    await expect(page.locator('#profileDisplayName')).toHaveCount(0);
    await expect(page.locator('#profileAuthMsg')).toHaveText('');
    await expect(page.locator('#profileLogout')).toBeEnabled();
  });

  test('PF1-13 delayed /me: B 전환 뒤 늦은 A 응답 폐기', async ({ page }) => {
    let releaseA;
    const pendingA = new Promise(resolve => { releaseA = resolve; });
    await mockApp(page, USER_WITH_NAMES);
    await page.route('**/api/v1/me', async route => {
      if (route.request().headers().authorization === 'Bearer fake-jwt-token') await pendingA;
      await route.fulfill({ json: USER_WITH_NAMES.me });
    });
    const requestA = page.waitForRequest('**/api/v1/me');
    await page.goto('/profile.html');
    await requestA;
    await expect(page.locator('#profileEmail')).toContainText('tester@example.com');
    await expect(page.locator('#profileDisplayName')).toHaveCount(0);
    await page.evaluate(() => {
      const session = { access_token: 'b-token', user: { id: '00000000-0000-4000-8000-000000000002', email: 'b@example.com' } };
      window.ULAuth.getClient().auth.getSession = async () => ({ data: { session } });
      window.__supabaseAuthListener('SIGNED_IN', session);
    });
    await expect(page.locator('#profileEmail')).toContainText('b@example.com');
    const responseA = page.waitForResponse(r => r.url().endsWith('/api/v1/me') && r.request().headers().authorization === 'Bearer fake-jwt-token');
    releaseA();
    await (await responseA).finished();
    await expect(page.locator('#profileEmail')).toContainText('b@example.com');
    await expect(page.locator('#profileDisplayName, #profilePublicName')).toHaveCount(0);
    await expect(page.locator('#profileLogout')).toBeEnabled();
  });

});
