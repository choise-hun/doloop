// frontend/src/pages/NotesPage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { SafeLink } from '../components/common/SafeLink';
import { auth, canUseAi, useAuth } from '../lib/auth';
import { AnalysisJobDto, apiClient, CreditEstimateDto, NoteSummaryDto } from '../lib/apiClient';
import { raw, safeUrl, thumb, videoIdFrom } from '../lib/security';
import { describeAnalyzeRequestError, describeJobError } from '../lib/jobError.mts';
import { ESTIMATE_DEBOUNCE_MS, jobStage } from '../lib/noteForm.mts';
import { t } from '../lib/i18n.mts';
import { BetaBadge } from '../components/common/BetaBadge';
import styles from './NotesPage.module.css';

export const NOTE_FORM_TAGS: ReadonlyArray<string> = [
  '화성',
  '사운드 디자인',
  'DAW/MIDI',
  '리듬',
  '편곡',
  '믹싱',
  'TAB',
];

export const NOTE_FILTER_TAGS: ReadonlyArray<string> = ['', ...NOTE_FORM_TAGS];

/** M2-1b: 첫 진입 때 골라 둔 태그(앱 명세 §3.1-2 "기본 화성") */
const DEFAULT_FORM_TAGS: ReadonlyArray<string> = ['화성'];

type EstimateState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; estimated: number; reserve: number }
  | { kind: 'error' };

function formatAgo(iso?: string | null): string {
  if (!iso) return '';
  const diffSec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diffSec < 60) return '방금';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

export function NotesPage(): React.ReactElement {
  useEffect(() => {
    document.title = '학습 노트 · ULeveLP';
  }, []);

  const authState = useAuth();
  const activeUid = authState.user?.id ?? null;

  const [urlVal, setUrlVal] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>(() => [...DEFAULT_FORM_TAGS]);
  const [memoVal, setMemoVal] = useState('');
  const [optOpen, setOptOpen] = useState(false); // M2-1b: 메모 옵션 접기(처음엔 접힘)
  const [formMsg, setFormMsg] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '', kind: '' });
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false); // state 반영 전 같은 순간의 두 번째 제출 막기(VideoAnalyzeForm GA-4와 같은 방식)

  const [jobs, setJobs] = useState<AnalysisJobDto[]>([]);
  const [notes, setNotes] = useState<NoteSummaryDto[]>([]);
  const [filterTag, setFilterTag] = useState('');
  const filterTagRef = useRef(filterTag);
  filterTagRef.current = filterTag;


  const notesReqSeqRef = useRef(0);
  const jobsReqSeqRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeJobIdsRef = useRef<Set<string>>(new Set());

  const loggedIn = Boolean(activeUid && apiClient.isLoggedIn());
  // M1-3c: 분석 가능 여부는 /me limits.ai(무료 false). /me를 받기 전에는 막지 않는다(서버가 403으로 판단)
  const tierBlocked = loggedIn && Boolean(authState.me) && !canUseAi(authState.me);
  const pickedVideoId = videoIdFrom(urlVal);
  const notionLinkUrl = safeUrl(raw.get('ulp:notion-notes'));

  // M2-1b: 예상 크레딧은 /me를 받았고 AI를 쓸 수 있을 때만 묻는다. 잔액 = 월 지급 + 구매
  const aiReady = loggedIn && Boolean(authState.me) && canUseAi(authState.me);
  const balance = authState.me?.credits ? authState.me.credits.monthly + authState.me.credits.purchased : null;

  // M2-1b: 예상 크레딧 — URL이 멈추면 ESTIMATE_DEBOUNCE_MS 뒤 한 번만 묻는다. 늦게 온 응답·다른 계정 응답은 버린다(docs/rules/frontend-state.md §1)
  const [estimate, setEstimate] = useState<EstimateState>({ kind: 'idle' });
  const estimateSeqRef = useRef(0);
  const estimateCacheRef = useRef<Map<string, CreditEstimateDto>>(new Map());

  useEffect(() => {
    const mySeq = ++estimateSeqRef.current; // 이전 요청 무효화
    const vid = pickedVideoId;
    const uid = activeUid;
    if (!vid || !uid || !aiReady) {
      setEstimate({ kind: 'idle' });
      return;
    }
    const cacheKey = `${uid}|${vid}`;
    const cached = estimateCacheRef.current.get(cacheKey);
    if (cached) {
      setEstimate({ kind: 'ok', estimated: cached.estimatedCredits, reserve: cached.reserveCredits });
      return;
    }
    setEstimate({ kind: 'loading' });
    const timer = setTimeout(async () => {
      try {
        const r = await apiClient.credits.estimate({ kind: 'note', url: `https://www.youtube.com/watch?v=${vid}` });
        if (mySeq !== estimateSeqRef.current || auth.getUser()?.id !== uid) return; // 무효화된 응답 버림
        if (!r || !Number.isFinite(r.estimatedCredits) || !Number.isFinite(r.reserveCredits)) throw new Error('bad estimate');
        estimateCacheRef.current.set(cacheKey, r);
        setEstimate({ kind: 'ok', estimated: r.estimatedCredits, reserve: r.reserveCredits });
      } catch {
        if (mySeq !== estimateSeqRef.current || auth.getUser()?.id !== uid) return;
        setEstimate({ kind: 'error' }); // 배지만 바꾼다. 요청 버튼은 막지 않는다(서버가 판단)
      }
    }, ESTIMATE_DEBOUNCE_MS);
    return () => clearTimeout(timer); // 입력이 또 바뀌면 아직 안 보낸 요청 취소
  }, [pickedVideoId, aiReady, activeUid]);

  // M2-1b: 진행 중 작업의 경과 시간 — 진행 중 작업이 있을 때만 1초마다 다시 그린다
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hasActiveJob = jobs.some((j) => j && (j.status === 'queued' || j.status === 'running'));
  useEffect(() => {
    if (!hasActiveJob) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasActiveJob]);

  // 초기 URL 파라미터(?url=...) 복원
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const initialUrl = q.get('url');
    if (initialUrl) {
      setUrlVal(initialUrl);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const loadNotesOnly = async (tag: string, uid: string | null) => {
    if (!uid || !apiClient.isLoggedIn()) {
      setNotes([]);
      return;
    }
    const mySeq = ++notesReqSeqRef.current;
    try {
      const list = await apiClient.notes.list(tag);
      if (mySeq !== notesReqSeqRef.current || auth.getUser()?.id !== uid) return;
      setNotes(Array.isArray(list) ? list : []);
    } catch {
      /* ignore background error */
    }
  };

  const refreshJobsAndNotes = async (uid: string | null) => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (!uid || !apiClient.isLoggedIn()) {
      setJobs([]);
      setNotes([]);
      return;
    }

    const mySeq = ++jobsReqSeqRef.current;
    try {
      const fetchedJobs = await apiClient.notes.listJobs();
      if (mySeq !== jobsReqSeqRef.current || auth.getUser()?.id !== uid) return;

      const safeJobs = Array.isArray(fetchedJobs) ? fetchedJobs : [];
      setJobs(safeJobs);

      const hasActive = safeJobs.some((j) => j && (j.status === 'queued' || j.status === 'running'));
      const newlyFinished = safeJobs.some((j) => j && j.status === 'done' && activeJobIdsRef.current.has(j.id));
      activeJobIdsRef.current = new Set(
        safeJobs.filter((j) => j && (j.status === 'queued' || j.status === 'running')).map((j) => j.id)
      );

      if (newlyFinished || !safeJobs.some((j) => activeJobIdsRef.current.has(j.id))) {
        void loadNotesOnly(filterTagRef.current, uid);
      }

      if (hasActive) {
        pollTimerRef.current = setTimeout(() => {
          void refreshJobsAndNotes(uid);
        }, 5000);
      }
    } catch {
      /* ignore background error */
    }
  };

  useEffect(() => {
    activeJobIdsRef.current.clear();
    void refreshJobsAndNotes(activeUid);
    void loadNotesOnly(filterTagRef.current, activeUid);
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [activeUid]);

  const toggleFormTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    if (!pickedVideoId) {
      setFormMsg({ text: '유튜브 영상 링크가 아니에요.', kind: 'err' });
      return;
    }
    if (selectedTags.length === 0) {
      setFormMsg({ text: '태그를 하나 이상 골라주세요.', kind: 'err' });
      return;
    }
    if (!loggedIn) {
      setFormMsg({ text: '로그인하면 영상 분석을 요청할 수 있어요.', kind: 'err' });
      return;
    }
    if (tierBlocked) {
      setFormMsg({ text: 'AI 영상 분석은 Pro 플랜부터 쓸 수 있어요.', kind: 'err' });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setFormMsg({ text: '분석 요청을 보내는 중...', kind: '' });
    try {
      const orderedTags = NOTE_FORM_TAGS.filter((t) => selectedTags.includes(t));
      const r = await apiClient.notes.analyze({
        url: `https://www.youtube.com/watch?v=${pickedVideoId}`,
        tags: orderedTags,
        memo: memoVal.trim(),
      });
      const reserved = typeof r.reservedCredits === 'number' ? ` (${r.reservedCredits}크레딧 예약 — 실제 사용량만 빠져요)` : '';
      setFormMsg({ text: `분석을 요청했어요${reserved}. 보통 1~3분 뒤에 정리가 완료돼요.`, kind: 'ok' });
      setUrlVal('');
      setMemoVal('');
      setOptOpen(false);
      void auth.fetchMe(); // 예약으로 줄어든 잔액을 다시 받는다
      void refreshJobsAndNotes(activeUid);
    } catch (err: any) {
      setFormMsg({ text: describeAnalyzeRequestError(err), kind: 'err' });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const keyGateVisible = !loggedIn || tierBlocked;
  const keyGateText = !loggedIn
    ? '로그인하면 영상 분석을 요청할 수 있어요.'
    : 'AI 영상 분석은 Pro 플랜부터 쓸 수 있어요. 분석할 때마다 크레딧을 써요.';

  return (
    <AppShell variant="narrow" activeNav="notes">
      <div className={styles.headerBlock}>
        <div className={styles.titleRow}>
          <h1 className={`page-title ${styles.pageTitle}`} data-align-group="notesTitle:center-y">
            Notes
          </h1>
          <BetaBadge alignGroup="notesTitle:center-y" />
        </div>
        <p className={`page-sub ${styles.pageSub}`}>
          유튜브 링크와 태그를 넣으면 AI가 영상을 분석해서 학습 노트를 생성해요. 보통 1~3분 걸려요.{' '}
          <SafeLink id="notionLink" href={notionLinkUrl} external hidden={!notionLinkUrl}>
            노션에서 보기 ↗
          </SafeLink>
        </p>
      </div>

      <div className={`card key-gate-box ${styles.keyGateBox}`} id="keyGateBox" hidden={!keyGateVisible}>
        <p id="keyGateMsg">{keyGateText}</p>
        <div className={styles.keyGateActions}>
          {loggedIn ? (
            <SafeLink href="settings.html#credits">SETTING에서 크레딧 보기 →</SafeLink>
          ) : (
            <SafeLink href="settings.html#account">로그인 →</SafeLink>
          )}
        </div>
      </div>

      <form className={`note-form ${styles.noteForm}`} id="form" onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span className={styles.lab}>유튜브 링크</span>
          <input
            className="inpField"
            id="url"
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            autoComplete="off"
            required
            value={urlVal}
            onChange={(e) => setUrlVal(e.target.value)}
          />
          <span
            className={`preview ${styles.preview} ${pickedVideoId ? `show ${styles.previewShow}` : ''}`}
            id="preview"
          >
            <img src={pickedVideoId ? thumb(pickedVideoId) : undefined} alt="" />
            <span className="hint">영상을 확인했어요</span>
          </span>
        </label>

        <div className={styles.field}>
          <span className={styles.lab}>태그</span>
          <div className={`tags ${styles.tags}`} id="tags" role="group" aria-label="태그">
            {NOTE_FORM_TAGS.map((t) => (
              <button
                key={t}
                type="button"
                className={styles.tagBtn}
                aria-pressed={selectedTags.includes(t)}
                onClick={() => toggleFormTag(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="hint">고른 태그에 맞춰 정리 항목이 달라져요. 여러 개 골라도 됩니다.</span>
        </div>

        <div className={styles.optBlock}>
          <button
            type="button"
            className={`ghostBtn ${styles.optToggle}`}
            id="noteOptToggle"
            aria-expanded={optOpen}
            aria-controls="noteOptPanel"
            onClick={() => setOptOpen((v) => !v)}
          >
            {optOpen ? t('notes.opt.close') : memoVal.trim() ? t('notes.opt.openFilled') : t('notes.opt.open')}
          </button>
          <div id="noteOptPanel" className={styles.optPanel} hidden={!optOpen}>
            <label className={styles.field}>
              <span className={styles.lab}>
                메모 <span className="hint">(선택)</span>
              </span>
              <textarea
                className="inpField"
                id="memo"
                placeholder="예: 3:20부터 나오는 보이싱 위주로"
                value={memoVal}
                onChange={(e) => setMemoVal(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className={styles.submitRow}>
          <button
            className="pillBtn"
            id="submit"
            type="submit"
            data-align-group="submitRow:center-y"
            disabled={submitting || keyGateVisible}
          >
            분석 요청
          </button>
          {estimate.kind !== 'idle' && (
            <span
              className={styles.estimate}
              id="noteEstimate"
              data-estimate={estimate.kind}
              data-align-group="submitRow:center-y"
              aria-live="polite"
            >
              {estimate.kind === 'loading'
                ? t('notes.estimate.loading')
                : estimate.kind === 'ok'
                  ? t('notes.estimate.ok', { n: estimate.estimated, balance: balance ?? 0 })
                  : t('notes.estimate.error')}
            </span>
          )}
        </div>
        {estimate.kind === 'ok' && balance !== null && balance < estimate.reserve && (
          <p className={styles.creditWarn} id="noteCreditWarn">
            {t('notes.estimate.low', { reserve: estimate.reserve, balance })}{' '}
            <SafeLink href="settings.html#credits">{t('notes.estimate.creditsLink')}</SafeLink>
          </p>
        )}
        <p className={styles.betaNotice} id="notesBetaNotice">
          {t('beta.notice')}
        </p>
        <p className={`msg${formMsg.kind ? ' ' + formMsg.kind : ''}`} id="msg" role="status">
          {formMsg.text}
        </p>
      </form>

      <h2 className={styles.sectionTitle}>진행 및 최근 작업</h2>
      <ul className={`runs ${styles.runs}`} id="jobs">
        {jobs.length === 0 ? (
          <li className={`empty ${styles.empty}`}>진행 중이거나 최근 요청한 작업이 없어요.</li>
        ) : (
          jobs.map((job) => {
            const vid = videoIdFrom(job.url || '');
            const tagStr = Array.isArray(job.tags) && job.tags.length > 0 ? job.tags.join(', ') : '(태그 없음)';
            const timeStr = formatAgo(job.createdAt);
            const why = job.status === 'failed' ? describeJobError(job.error) : null;
            const stage = jobStage(job, nowMs); // 대기·분석 중이면 경과 시간 배지·안내, 끝났으면 null
            return (
              <li key={job.id} className={`run ${styles.runItem}`}>
                {vid ? (
                  <SafeLink href={`https://www.youtube.com/watch?v=${encodeURIComponent(vid)}`} external>
                    <img src={thumb(vid)} alt="영상 썸네일" />
                  </SafeLink>
                ) : (
                  <span />
                )}
                <div>
                  <div className={`t ${styles.runTitle}`}>{tagStr}</div>
                  <div className={`sub ${styles.runSub}`}>
                    {(timeStr ? `${timeStr} · ` : '') + (job.url || '')}
                  </div>
                  {why && (
                    <div className={styles.runHint} data-error-code={why.code} title={why.detail || undefined}>
                      {why.hint}
                    </div>
                  )}
                  {stage && (
                    <div className={styles.runHint} data-job-stage={stage.stage}>
                      {stage.hint}
                    </div>
                  )}
                </div>
                <div className={`acts ${styles.runActs}`}>
                  {job.status === 'done' && job.noteId && (
                    <SafeLink
                      className={`badge ok ${styles.badge} ${styles.badgeOk}`}
                      href={`note.html?id=${encodeURIComponent(job.noteId)}`}
                    >
                      노트 보기 →
                    </SafeLink>
                  )}
                  <span
                    className={`badge ${styles.badge} ${
                      job.status === 'done'
                        ? `ok ${styles.badgeOk}`
                        : job.status === 'failed'
                          ? `fail ${styles.badgeFail}`
                          : ''
                    }`}
                  >
                    {stage
                      ? stage.label
                      : job.status === 'done'
                        ? '완료'
                        : why
                          ? why.title
                          : '실패'}
                  </span>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <h2 className={styles.sectionTitle}>내 학습 노트</h2>
      <div className={`tags filter-tags ${styles.filterTags}`} id="noteTagFilter" role="group" aria-label="노트 태그 필터">
        {NOTE_FILTER_TAGS.map((tag) => (
          <button
            key={tag || 'all'}
            type="button"
            className={styles.filterBtn}
            aria-pressed={filterTag === tag}
            onClick={() => {
              if (filterTag === tag) return;
              setFilterTag(tag);
              filterTagRef.current = tag;
              void loadNotesOnly(tag, activeUid);
            }}
          >
            {tag || '전체'}
          </button>
        ))}
      </div>

      <div className={`notes-list ${styles.notesList}`} id="notesList">
        {notes.length === 0 ? (
          <p className={`empty ${styles.empty}`}>
            {filterTag ? `"${filterTag}" 태그의 학습 노트가 없어요.` : '저장된 학습 노트가 없어요.'}
          </p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className={`card note-card ${styles.noteCard}`}>
              <div className={`note-card-head ${styles.noteCardHead}`}>
                <SafeLink
                  className={`note-card-title ${styles.noteCardTitle}`}
                  href={`note.html?id=${encodeURIComponent(n.id)}`}
                >
                  {n.title || '(제목 없음)'}
                </SafeLink>
                <div className={`note-card-meta ${styles.noteCardMeta}`}>
                  {n.channel && <span className="sub">{n.channel}</span>}
                  {n.difficulty && <span className={`badge ${styles.badge}`}>{n.difficulty}</span>}
                  {Array.isArray(n.tags) &&
                    n.tags.map((t) => (
                      <span key={t} className={`badge ${styles.badge}`}>
                        {t}
                      </span>
                    ))}
                </div>
              </div>
              {n.headline && <p className={`note-card-headline ${styles.noteCardHeadline}`}>{n.headline}</p>}
              <div className={`row note-card-acts ${styles.noteCardActs}`}>
                {n.videoId && (
                  <SafeLink className="pillBtn" href={`practice.html?v=${encodeURIComponent(n.videoId)}`}>
                    ▶ 연습
                  </SafeLink>
                )}
                <SafeLink className="ghostBtn" href={`note.html?id=${encodeURIComponent(n.id)}`}>
                  상세 보기
                </SafeLink>
              </div>
            </div>
          ))
        )}
      </div>

    </AppShell>
  );
}

export default NotesPage;

