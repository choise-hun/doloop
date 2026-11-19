// SL-2 ⑥ 곡 순서 — 서버 SongService.applySubsetOrder와 같은 규칙(명세 §5.2-4)

/**
 * 부분집합 자리 유지: list에서 ids의 곡들이 차지한 자리(위에서부터)에 ids 순서대로 다시 넣는다.
 * 나머지는 제자리. list에 없는 id·중복 id는 무시한다(낙관적 반영용 — 서버가 최종 순서를 돌려준다).
 */
export function applySubsetOrder<T extends { id: string }>(list: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(list.map((x) => [x.id, x] as const));
  const moving = new Set<string>();
  const order: string[] = [];
  for (const id of ids) {
    if (!byId.has(id) || moving.has(id)) continue;
    moving.add(id);
    order.push(id);
  }
  const result = list.slice();
  let k = 0;
  for (let i = 0; i < result.length; i++) {
    if (moving.has(result[i].id)) result[i] = byId.get(order[k++]) as T;
  }
  return result;
}

/** 드래그 중 화면 순서: ids의 from 자리 곡을 to 자리로 옮긴 새 배열(범위 밖이면 그대로) */
export function moveId(ids: readonly string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids.slice();
  const next = ids.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
