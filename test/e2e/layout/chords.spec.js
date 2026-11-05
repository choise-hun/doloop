// 코드 연습 화면 정렬 검사 (FT-2): 공통 검사 G0~G8, 탭 8개 × 4폭. 로그인과 무관한 화면이라 guest만
// 규격: 개발산출물/프론트_정렬규격.md · 점검 기록: 개발산출물/결과/FT-2_전화면점검.md
'use strict';
const { layoutSuite } = require('../support/layout-check');

// 알려진 실패(FT-2 기록, 고칠 step: FT-3-chords). 결과/FT-2_전화면점검.md §3
const KNOWN = {
  tf: [
    { match: /^G1 figure\.cell .* 밖으로 svg\.cb /, why: '2-5-1 탐색 코드 상자: 다이어그램 svg가 칸보다 넓어 좌우 2~6px 넘침' },
    { match: /^G2 div\.boxrowTight .* figure\.cell .* ↔ figure\.cell /, why: '위 넘침 때문에 이웃 칸과 보이는 범위가 겹침' },
  ],
};

for (const tab of ['scale', 'tone', 'matrix', 'circle', 'reint', 'tf', 'ds', 'prog']) {
  layoutSuite({
    name: `chords-${tab}`,
    path: `/chords.html#${tab}`,
    states: ['guest'],
    ready: async (page) => {
      await page.locator(`#pane-${tab}`).waitFor();
    },
    dark: tab === 'scale' ? 'guest' : undefined,
    known: KNOWN[tab],
  });
}
