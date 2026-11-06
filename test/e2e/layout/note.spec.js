// 학습 노트 상세 화면 정렬 검사 (FT-2): 공통 검사 G0~G8
// 배치 약속: 명세/M2-1d_구현명세.md §7(액션 바 `noteActions:center-y@481`, 모바일 SVG 보정)
// 규격: 개발산출물/프론트_정렬규격.md · 점검 기록: 개발산출물/결과/FT-2_전화면점검.md
'use strict';
const { expect } = require('@playwright/test');
const { layoutSuite } = require('../support/layout-check');
const { STATES, FIXTURES } = require('../support/mock-app');

// M2-1d: 화성 진행 1개·코드 3개(시간 2개 풀림, 1개 빈칸)·SVG 1개(width 640)·주요 구간 2개·연습 과제 2개
const HARMONY_STATE = {
  name: 'harmony',
  mock: {
    ...STATES.user,
    routes: [
      [
        (url) => url.pathname === `/api/v1/notes/${FIXTURES.note.id}`,
        (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({
              note: {
                ...FIXTURES.note,
                tags: ['화성'],
                analysis: {
                  harmony: {
                    progressions: [
                      {
                        name: '인트로 진행',
                        key: 'C Major',
                        instrument: 'Guitar',
                        chords: [
                          { symbol: 'Cmaj7', roman: 'IM7', function: 'T', timestamp: '01:24' },
                          { symbol: 'Dm7', roman: 'ii7', function: 'SD', timestamp: '01:30' },
                          { symbol: 'G7', roman: 'V7', function: 'D', timestamp: '' },
                        ],
                      },
                    ],
                  },
                  moments: [
                    { timestamp: '00:30', point: '주요 구간 1' },
                    { timestamp: '01:00', point: '주요 구간 2' },
                  ],
                  practice: ['과제 1', '과제 2'],
                },
                diagramsSvg: [
                  '<svg viewBox="0 0 640 180" width="640" height="180" xmlns="http://www.w3.org/2000/svg"><rect width="640" height="180" fill="#fff"/></svg>',
                ],
              },
            }),
          }),
      ],
    ],
  },
};

layoutSuite({
  name: 'note',
  path: `/note.html?id=${FIXTURES.note.id}`,
  states: ['guest', 'userData', HARMONY_STATE],
  ready: async (page, state) => {
    if (state === 'guest') {
      await page.locator('main').waitFor();
    } else if (state === 'userData') {
      await expect(page.locator('#noteTitle')).toContainText('노트');
    } else if (state === 'harmony') {
      await expect(page.locator('#noteTitle')).toContainText('노트');
      await expect(page.locator('#noteActionBar')).toBeVisible();
      const width = page.viewportSize()?.width;
      if (width === 390) {
        // §7 SVG: 390 harmony: .svgBox svg의 오른쪽선 <= .svgBox 안쪽 오른쪽선, 높이/폭 비 = viewBox 비 +-1px
        const svgBox = page.locator('.svg-box');
        const svg = svgBox.locator('svg');
        await expect(svg).toBeVisible();
        const boxRect = await svgBox.boundingBox();
        const svgRect = await svg.boundingBox();
        expect(boxRect).toBeTruthy();
        expect(svgRect).toBeTruthy();
        // SVG 오른쪽선 <= svgBox 오른쪽선
        expect(svgRect.x + svgRect.width).toBeLessThanOrEqual(boxRect.x + boxRect.width + 1);
        // viewBox 640/180 비례 검증 (오차 1.5px 이내)
        const expectedHeight = svgRect.width * (180 / 640);
        expect(Math.abs(svgRect.height - expectedHeight)).toBeLessThanOrEqual(1.5);
      }
    }
  },
  dark: 'userData',
});
