// M2-1b: 노트 화면 순수 계산(경과 시간·진행 단계) — 명세 개발산출물/명세/M2-1b_구현명세.md §6-1
'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let F;
before(async () => {
  F = await import('../frontend/src/lib/noteForm.mts');
});

const T0 = Date.parse('2026-11-07T00:00:00Z');
const at = (sec) => new Date(T0 + sec * 1000).toISOString();

test('NF-1 formatElapsed: m:ss, 60분 넘어도 분 그대로, 음수·NaN은 0:00', () => {
  assert.equal(F.formatElapsed(0), '0:00');
  assert.equal(F.formatElapsed(5.9), '0:05');
  assert.equal(F.formatElapsed(65), '1:05');
  assert.equal(F.formatElapsed(3725), '62:05');
  assert.equal(F.formatElapsed(-3), '0:00');
  assert.equal(F.formatElapsed(Number.NaN), '0:00');
});

test('NF-2 jobElapsedSec: 대기=요청부터, 분석=시작부터(없으면 요청부터), 끝난 작업·잘못된 시각=null, 시계 어긋남=0', () => {
  const now = T0 + 100_000;
  assert.equal(F.jobElapsedSec({ status: 'queued', createdAt: at(40) }, now), 60);
  assert.equal(F.jobElapsedSec({ status: 'running', createdAt: at(0), startedAt: at(35) }, now), 65);
  assert.equal(F.jobElapsedSec({ status: 'running', createdAt: at(90), startedAt: null }, now), 10);
  assert.equal(F.jobElapsedSec({ status: 'done', createdAt: at(0), startedAt: at(1) }, now), null);
  assert.equal(F.jobElapsedSec({ status: 'failed', createdAt: at(0) }, now), null);
  assert.equal(F.jobElapsedSec({ status: 'queued', createdAt: 'not-a-date' }, now), null);
  assert.equal(F.jobElapsedSec({ status: 'queued', createdAt: null }, now), null);
  assert.equal(F.jobElapsedSec({ status: 'queued', createdAt: at(200) }, now), 0);
});

test('NF-3 jobStage: 대기·분석·느림 문구, 끝난 작업은 null', () => {
  const now = T0 + 100_000;
  assert.deepEqual(F.jobStage({ status: 'queued', createdAt: at(88) }, now), {
    stage: 'queued',
    label: '대기 중 · 0:12',
    hint: '곧 시작해요. 이 화면을 닫아도 분석은 계속돼요.',
  });
  assert.deepEqual(F.jobStage({ status: 'running', createdAt: at(0), startedAt: at(35) }, now), {
    stage: 'running',
    label: '분석 중 · 1:05',
    hint: '영상을 보고 노트를 정리하는 중이에요. 보통 1~3분 걸려요.',
  });
  const slow = F.jobStage({ status: 'running', startedAt: at(100 - F.SLOW_JOB_SEC), createdAt: at(0) }, now);
  assert.equal(slow.stage, 'slow');
  assert.equal(slow.label, '분석 중 · 3:00');
  assert.equal(slow.hint, '평소보다 오래 걸리고 있어요. 이 화면을 닫아도 분석은 계속돼요.');
  assert.equal(F.jobStage({ status: 'done', createdAt: at(0) }, now), null);
});

test('NF-4 상수: 예상 크레딧 대기 600ms, 느림 기준 180초', () => {
  assert.equal(F.ESTIMATE_DEBOUNCE_MS, 600);
  assert.equal(F.SLOW_JOB_SEC, 180);
});
