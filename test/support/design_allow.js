// 디자인 가드가 함께 쓰는 허용 곡률 집합 (docs/rules/frontend-design.md §2)
// 필(9999px)·블록(3px 토큰)·직각(0)·원형 점(50%)만 허용한다. 원시 `3px` 수치는 넣지 않는다(토큰으로만 쓴다).
// test/*.test.js glob에 잡히지 않도록 test/support/ 아래에 둔다.
'use strict';

const ALLOWED_RADIUS = new Set([
  '0', '0px', '50%', '9999px',
  'var(--radius-pill)', 'var(--radius-block)', 'var(--radius-card)', 'var(--radius-card, 0)',
]);

module.exports = { ALLOWED_RADIUS };
