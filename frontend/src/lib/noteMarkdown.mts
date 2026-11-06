// M2-1d: 노트 상세 화면의 순수 함수 (마크다운 생성 · 플레이어 링크 생성)
// 명세 개발산출물/명세/M2-1d_구현명세.md
import { t } from './i18n.mts';

export interface NoteMarkdownInput {
  title?: string;
  url?: string;
  videoId?: string;
  channel?: string;
  createdAt?: string;
  tags?: string[];
  memo?: string;
  headline?: string;
  points?: string[];
  keywords?: string[];
  analysis?: Record<string, any>;
}

/** 출처: NoteDetailPage.tsx:12-23 parseTimestampSec 복사 */
function tsSec(ts: unknown): number | null {
  if (!ts || typeof ts !== 'string') return null;
  const parts = ts.trim().match(/\d+/g);
  if (!parts || parts.length < 2 || parts.length > 3) return null;
  let total = 0;
  for (const p of parts) {
    const num = parseInt(p, 10);
    if (Number.isNaN(num)) return null;
    total = total * 60 + num;
  }
  return total;
}

/** practice.html?v=<id>[&t=<초>] — 상대 경로. origin을 주면 절대 URL */
export function notePracticeHref(videoId: string, sec?: number | null, origin?: string): string {
  const encId = encodeURIComponent(videoId);
  const base = origin ? `${origin.replace(/\/+$/, '')}/practice.html` : 'practice.html';
  if (sec !== null && sec !== undefined && Number.isFinite(sec) && sec > 0) {
    return `${base}?v=${encId}&t=${Math.floor(sec)}`;
  }
  return `${base}?v=${encId}`;
}

function escapeTableCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** 노트 → 마크다운 문자열(끝 줄바꿈 1개). origin = 링크 절대화용(페이지는 window.location.origin) */
export function buildNoteMarkdown(note: NoteMarkdownInput, origin: string): string {
  const blocks: string[] = [];

  // 1. 제목
  const title = note.title?.trim() || note.url?.trim() || t('note.md.untitled');
  blocks.push(`# ${title}`);

  // 2. 메타 한 줄: channel · YYYY-MM-DD · #태그 #태그 (없는 칸은 뺌)
  const metaParts: string[] = [];
  if (note.channel?.trim()) {
    metaParts.push(note.channel.trim());
  }
  if (note.createdAt) {
    if (note.createdAt.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(note.createdAt)) {
      metaParts.push(note.createdAt.slice(0, 10));
    } else {
      const d = new Date(note.createdAt);
      if (!Number.isNaN(d.getTime())) {
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        metaParts.push(`${yyyy}-${mm}-${dd}`);
      }
    }
  }
  if (Array.isArray(note.tags) && note.tags.length > 0) {
    const tagStr = note.tags.map((tg) => `#${tg}`).join(' ');
    if (tagStr) metaParts.push(tagStr);
  }
  if (metaParts.length > 0) {
    blocks.push(metaParts.join(' · '));
  }

  // 3. url 한 줄(있을 때)
  if (note.url?.trim()) {
    blocks.push(note.url.trim());
  }

  // 4. 핵심 요약 (headline 문단 + points 목록 + keywords)
  const hasHeadline = Boolean(note.headline?.trim());
  const validPoints = Array.isArray(note.points) ? note.points.filter((p) => p && typeof p === 'string' && p.trim()) : [];
  const validKeywords = Array.isArray(note.keywords) ? note.keywords.filter((k) => k && typeof k === 'string' && k.trim()) : [];

  if (hasHeadline || validPoints.length > 0 || validKeywords.length > 0) {
    const summaryLines: string[] = [`## ${t('note.md.summary')}`];
    if (hasHeadline) {
      summaryLines.push('');
      summaryLines.push(note.headline!.trim());
    }
    if (validPoints.length > 0) {
      summaryLines.push('');
      for (const pt of validPoints) {
        summaryLines.push(`- ${pt.trim()}`);
      }
    }
    if (validKeywords.length > 0) {
      summaryLines.push('');
      summaryLines.push(`${t('note.md.keywords')}: ${validKeywords.map((k) => k.trim()).join(', ')}`);
    }
    blocks.push(summaryLines.join('\n'));
  }

  // 5. 화성 (tags에 '화성'이 있고 analysis.harmony가 있을 때만)
  const hasHarmonyTag = Array.isArray(note.tags) && note.tags.includes('화성');
  const harmony = note.analysis?.harmony;
  if (hasHarmonyTag && harmony) {
    const progs = Array.isArray(harmony.progressions) ? harmony.progressions : [];
    if (progs.length > 0) {
      const harmonyLines: string[] = [`## ${t('note.md.harmony')}`];
      for (const prog of progs) {
        const pTitle = [
          prog.name || '진행',
          prog.key ? `(${prog.key})` : '',
          prog.instrument ? `· ${prog.instrument}` : '',
        ]
          .filter(Boolean)
          .join(' ');
        harmonyLines.push('');
        harmonyLines.push(`### ${pTitle}`);

        const chords = Array.isArray(prog.chords) ? prog.chords : [];
        if (chords.length > 0) {
          const arrowLine = chords.map((c: any) => c.symbol || '').join(' → ');
          if (arrowLine) {
            harmonyLines.push('');
            harmonyLines.push(arrowLine);
          }
          harmonyLines.push('');
          harmonyLines.push('| 코드 | 로마숫자 | 기능 | 시간 |');
          harmonyLines.push('| --- | --- | --- | --- |');
          for (const c of chords) {
            const sym = escapeTableCell(c.symbol);
            const rom = escapeTableCell(c.roman);
            const func = escapeTableCell(c.function);
            let timeCell = '';
            if (c.timestamp) {
              const sec = tsSec(c.timestamp);
              if (sec !== null && note.videoId) {
                timeCell = `[${escapeTableCell(c.timestamp)}](${notePracticeHref(note.videoId, sec, origin)})`;
              } else {
                timeCell = escapeTableCell(c.timestamp);
              }
            }
            harmonyLines.push(`| ${sym} | ${rom} | ${func} | ${timeCell} |`);
          }
        }
      }
      blocks.push(harmonyLines.join('\n'));
    }
  }

  // 6. 주요 구간
  const moments = Array.isArray(note.analysis?.moments) ? note.analysis!.moments : [];
  const validMoments = moments.filter((m: any) => m && (m.timestamp || m.point));
  if (validMoments.length > 0) {
    const momentLines: string[] = [`## ${t('note.md.moments')}`];
    momentLines.push('');
    for (const m of validMoments) {
      let timeStr = '';
      if (m.timestamp) {
        const sec = tsSec(m.timestamp);
        if (sec !== null && note.videoId) {
          timeStr = `[${m.timestamp}](${notePracticeHref(note.videoId, sec, origin)})`;
        } else {
          timeStr = String(m.timestamp);
        }
      }
      const pointStr = m.point ? String(m.point).trim() : '';
      if (timeStr && pointStr) {
        momentLines.push(`- ${timeStr} ${pointStr}`);
      } else if (timeStr) {
        momentLines.push(`- ${timeStr}`);
      } else {
        momentLines.push(`- ${pointStr}`);
      }
    }
    blocks.push(momentLines.join('\n'));
  }

  // 7. 연습 과제
  const practiceItems = Array.isArray(note.analysis?.practice)
    ? note.analysis!.practice.filter((p: any) => p && typeof p === 'string' && p.trim())
    : [];
  if (practiceItems.length > 0) {
    const practiceLines: string[] = [`## ${t('note.md.practice')}`];
    practiceLines.push('');
    for (const item of practiceItems) {
      practiceLines.push(`- [ ] ${item.trim()}`);
    }
    blocks.push(practiceLines.join('\n'));
  }

  // 8. 메모
  if (note.memo?.trim()) {
    blocks.push(`## ${t('note.md.memo')}\n\n${note.memo.trim()}`);
  }

  return blocks.join('\n\n') + '\n';
}
