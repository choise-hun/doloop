import test from 'node:test';
import assert from 'node:assert/strict';
import { sortSongs } from '../frontend/src/lib/songOrder.mts';
import {
  DEFAULT_BULK_TITLE_OPTIONS,
  detectCommonPhrases,
  transformSongTitle,
} from '../frontend/src/lib/songTitleBulk.mts';

test('sortSongs: custom / title / added_asc / added_desc', () => {
  const list = [
    { id: 'c', title: 'Track 10', createdAt: '2026-11-22T03:00:00Z' },
    { id: 'a', title: 'Track 2', createdAt: '2026-11-20T01:00:00Z' },
    { id: 'b', title: 'Alpha', createdAt: '2026-11-21T02:00:00Z' },
  ];

  assert.deepEqual(sortSongs(list, 'custom').map((x) => x.id), ['c', 'a', 'b']);
  assert.deepEqual(sortSongs(list, 'title').map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(sortSongs(list, 'added_asc').map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(sortSongs(list, 'added_desc').map((x) => x.id), ['c', 'b', 'a']);
});

test('songTitleBulk: 18개 실제 유튜브 제목 규칙 정리 및 공통 문구 감지', () => {
  const sample = [
    'Bocchi The Rock! - 星座になれたら If I Could Be A Constellation (slow tempo guitar cover with tab)',
    'ryo (supercell) - World Is Mine CPK! Remix (guitar cover with tabs & chords)',
    '[🎸TABS] Idol (アイドル) / YOASOBI | Oshi no Ko 【推しの子】 Full OP Guitar cover',
    '【TAB譜】ちゅ、多様性。 ano ギター 弾いてみた',
    '【TAB譜】勇者 YOASOBI ギター 弾いてみた',
    '結束バンド『忘れてやらない』のギターが一番かっこいいので徹底解説してみた！【TAB譜】',
    'Bocchi The Rock! - Flashbacker (guitar cover with tabs & chords)',
  ];

  const common = detectCommonPhrases(sample);
  assert.ok(common.includes('Bocchi The Rock! - '), `expected common prefix in ${JSON.stringify(common)}`);
  assert.ok(common.includes('ギター 弾いてみた'));

  // 기본 규칙: […]/【…】 제거, 커버 소괄호만 제거(곡명 소괄호 보존), 커버 상투어 제거
  assert.equal(
    transformSongTitle(sample[0], DEFAULT_BULK_TITLE_OPTIONS),
    'Bocchi The Rock! - 星座になれたら If I Could Be A Constellation'
  );
  assert.equal(
    transformSongTitle(sample[1], DEFAULT_BULK_TITLE_OPTIONS),
    'ryo (supercell) - World Is Mine CPK! Remix'
  );
  assert.equal(
    transformSongTitle(sample[2], DEFAULT_BULK_TITLE_OPTIONS),
    'Idol (アイドル) / YOASOBI | Oshi no Ko'
  );
  assert.equal(
    transformSongTitle(sample[4], DEFAULT_BULK_TITLE_OPTIONS),
    '勇者 YOASOBI'
  );

  // 따옴표 추출 규칙
  assert.equal(
    transformSongTitle(sample[5], { ...DEFAULT_BULK_TITLE_OPTIONS, extractQuotes: true }),
    '忘れてやらない'
  );

  // 공통 문구 제거 규칙 추가
  assert.equal(
    transformSongTitle(sample[6], {
      ...DEFAULT_BULK_TITLE_OPTIONS,
      customRules: [{ find: 'Bocchi The Rock! - ', replace: '' }],
    }),
    'Flashbacker'
  );

  // 결과가 비면 원본 유지
  assert.equal(
    transformSongTitle('【TAB譜】', DEFAULT_BULK_TITLE_OPTIONS),
    '【TAB譜】'
  );
});
