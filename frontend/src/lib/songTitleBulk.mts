// frontend/src/lib/songTitleBulk.mts
// UXP: 유튜브 커버/TAB 곡 제목 일괄 정리 순수 함수 모듈

export interface BulkTitleCustomRule {
  find: string;
  replace: string;
}

export interface BulkTitleOptions {
  stripBrackets: boolean;
  stripCoverParen: boolean;
  stripCoverNoise: boolean;
  extractQuotes: boolean;
  customRules: readonly BulkTitleCustomRule[];
}

export const DEFAULT_BULK_TITLE_OPTIONS: BulkTitleOptions = {
  stripBrackets: true,
  stripCoverParen: true,
  stripCoverNoise: true,
  extractQuotes: false,
  customRules: [],
};

/**
 * 폴더 내 곡 제목 목록에서 2곡 이상 공통으로 등장하는 앞/뒤 구분 문구 및 반복 문구를 추출한다.
 */
export function detectCommonPhrases(titles: readonly string[]): string[] {
  if (titles.length < 2) return [];
  const counts = new Map<string, number>();
  const bump = (raw: string) => {
    const s = raw.trim();
    if (s.length < 4 || s.length > 60) return;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  };

  for (const title of titles) {
    const seen = new Set<string>();
    const add = (candidate: string) => {
      if (!candidate || seen.has(candidate)) return;
      seen.add(candidate);
      bump(candidate);
    };

    // 1) "앞부분 - " / "앞부분 | " / "앞부분 / " 패턴
    const prefixMatch = title.match(/^([^(\[【『「]{3,45}?\s*(?:-|–|—|\||\/)\s+)/);
    if (prefixMatch) add(prefixMatch[1]);

    // 2) 소괄호 "(...)" / 대괄호 "[...]" / 먹괄호 "【...】" 덩어리
    const bracketMatches = title.match(/(\([^)]{4,55}\)|\[[^\]]{2,40}\]|【[^】]{2,40}】)/g);
    if (bracketMatches) {
      for (const m of bracketMatches) add(m);
    }

    // 3) 자주 쓰이는 일본어/영어 커버 꼬리말 패턴
    for (const fixed of [
      'ギター 弾いてみた',
      'ギターカバー Guitar Cover',
      'Solo Guitar Cover',
      'Guitar Cover',
    ]) {
      if (title.includes(fixed)) add(fixed);
    }
  }

  return Array.from(counts.entries())
    .filter(([, cnt]) => cnt >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 8)
    .map(([phrase]) => phrase);
}

/**
 * 선택된 정리 규칙을 적용해 정리된 곡 제목을 반환한다.
 * 결과가 비어 버리면 원본 제목을 그대로 돌려준다.
 */
export function transformSongTitle(orig: string, opts: BulkTitleOptions): string {
  let s = orig;

  if (opts.stripBrackets) {
    s = s.replace(/\[[^\]]*\]|【[^】]*】/g, ' ');
  }

  if (opts.stripCoverParen) {
    // 곡명/아티스트 소괄호 예: (アイドル), (supercell) 등은 보존하고 커버/탭 안내 소괄호만 제거
    s = s.replace(
      /\(([^)]*(?:cover|tab|chord|slow|guitar|bass|piano|arrange|ver\.?|instrumental|acoustic|fingerstyle)[^)]*)\)/gi,
      ' '
    );
  }

  if (opts.stripCoverNoise) {
    s = s.replace(/#\S+/g, ' ');
    s = s.replace(/(?:Full\s+(?:OP|ED)\s*)?(?:Solo\s+)?Guitar\s+Cover(?:\s+and\s+TAB)?/gi, ' ');
    s = s.replace(/ソロギターアレンジ|ギターカバー|ギター\s*弾いてみた|弾いてみた/g, ' ');
  }

  if (opts.extractQuotes) {
    const m = s.match(/[『「]([^』」]+)[』」]/);
    if (m && m[1].trim()) {
      s = m[1].trim();
    }
  }

  for (const rule of opts.customRules) {
    if (rule.find) {
      s = s.split(rule.find).join(rule.replace);
    }
  }

  s = s
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—/|·]+|[\s\-–—/|·]+$/g, '')
    .trim();

  return s || orig;
}
