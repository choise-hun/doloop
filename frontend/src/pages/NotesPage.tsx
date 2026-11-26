// frontend/src/pages/NotesPage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { SafeLink } from '../components/common/SafeLink';
import { auth, canUseAi, useAuth } from '../lib/auth';
import { AnalysisJobDto, apiClient, CreditEstimateDto, NoteDocSummaryDto, NoteFolderDto, NoteSummaryDto } from '../lib/apiClient';
import { raw, safeUrl, thumb, videoIdFrom } from '../lib/security';
import { describeAnalyzeRequestError, describeJobError } from '../lib/jobError.mts';
import { checkNoteRange, ESTIMATE_DEBOUNCE_MS, jobStage, rangeBody, retryDraft } from '../lib/noteForm.mts';
import type { NoteRangeError } from '../lib/noteForm.mts';
import { t, type I18nKey } from '../lib/i18n.mts';
import { BetaBadge } from '../components/common/BetaBadge';
import { NoteCard } from '../components/notes/NoteCard';
import { FolderDialog, NoteFolderNav, ProDialog } from '../components/notes/NoteFolderNav';
import { NoteUploadDialog } from '../components/notes/NoteUploadDialog';
import {
  describeUploadError,
  folderFromSearch,
  folderToQuery,
  moveId,
  workspaceItems,
  type FolderPick,
  type NoteKindFilter,
} from '../lib/noteWorkspace.mts';
import styles from './NotesPage.module.css';

export const NOTE_FORM_TAGS: ReadonlyArray<string> = [
  '화성', // i18n-keep: 서버 전송 및 비교용 태그 데이터(D5-1)
  '사운드 디자인', // i18n-keep: 서버 전송 및 비교용 태그 데이터(D5-1)
  'DAW/MIDI',
  '리듬', // i18n-keep: 서버 전송 및 비교용 태그 데이터(D5-1)
  '편곡', // i18n-keep: 서버 전송 및 비교용 태그 데이터(D5-1)
  '믹싱', // i18n-keep: 서버 전송 및 비교용 태그 데이터(D5-1)
  'TAB',
];

export const NOTE_TAG_KEY: Record<string, I18nKey> = {
  '화성': 'notes.tagHarmony', // i18n-keep: 서버 전송 및 비교용 태그 데이터(D5-1)
  '사운드 디자인': 'notes.tagSoundDesign', // i18n-keep: 서버 전송 및 비교용 태그 데이터(D5-1)
  'DAW/MIDI': 'notes.tagDawMidi',
  '리듬': 'notes.tagRhythm', // i18n-keep: 서버 전송 및 비교용 태그 데이터(D5-1)
  '편곡': 'notes.tagArrangement', // i18n-keep: 서버 전송 및 비교용 태그 데이터(D5-1)
  '믹싱': 'notes.tagMixing', // i18n-keep: 서버 전송 및 비교용 태그 데이터(D5-1)
  'TAB': 'notes.tagTab',
};

export function noteTagLabel(tag: string): string {
  return NOTE_TAG_KEY[tag] ? t(NOTE_TAG_KEY[tag]) : tag;
}

export const NOTE_FILTER_TAGS: ReadonlyArray<string> = ['', ...NOTE_FORM_TAGS];

/** M2-1b: 첫 진입 때 골라 둔 태그(앱 명세 §3.1-2 "기본 화성") */
const DEFAULT_FORM_TAGS: ReadonlyArray<string> = ['화성']; // i18n-keep: 서버 태그 기본값(D5-1)

/** M2-1c: 구간 오류 → 문구 키 */
const RANGE_ERROR_KEY = { format: 'notes.range.errFormat', order: 'notes.range.errOrder' } as const;
const rangeErrorText = (e: NoteRangeError): string => (e ? t(RANGE_ERROR_KEY[e]) : '');

type EstimateState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; estimated: number; reserve: number }
  | { kind: 'error' };

function formatAgo(iso?: string | null): string {
  if (!iso) return '';
  const diffSec = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diffSec < 60) return t('notes.agoJustNow');
  if (diffSec < 3600) return t('notes.agoMinutes', { m: Math.floor(diffSec / 60) });
  if (diffSec < 86400) return t('notes.agoHours', { h: Math.floor(diffSec / 3600) });
  return new Date(iso).toLocaleDateString('ko-KR');
}

export function NotesPage(): React.ReactElement {
  useEffect(() => {
    document.title = '학습 노트 · RE:DO'; // i18n-keep: RZ3-4 소스 문자열 단언
  }, []);

  const authState = useAuth();
  const activeUid = authState.user?.id ?? null;

  const [urlVal, setUrlVal] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>(() => [...DEFAULT_FORM_TAGS]);
  const [memoVal, setMemoVal] = useState('');
  const [optOpen, setOptOpen] = useState(false); // M2-1b: 구간·메모 옵션 접기(처음엔 접힘)
  // M2-1c: 분석 구간(시작~끝) 칸 글자. 초·오류는 렌더 때 계산(docs/rules/frontend-state.md §2)
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const range = checkNoteRange(startText, endText);
  const optFilled = Boolean(memoVal.trim() || startText.trim() || endText.trim());
  const startInputRef = useRef<HTMLInputElement>(null);
  const [focusStartTick, setFocusStartTick] = useState(0); // 재시도 뒤 패널이 열린 다음 시작 칸으로
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

  // NT-2a: 워크스페이스(노트북·자료 노트). 목록은 한 번에 받고 노트북·종류는 클라이언트에서 거른다(명세/NT-2 §4.2)
  const [folders, setFolders] = useState<NoteFolderDto[]>([]);
  const [docs, setDocs] = useState<NoteDocSummaryDto[]>([]);
  const [wsLoadedFor, setWsLoadedFor] = useState<string | null>(null);
  const [notesLoadedFor, setNotesLoadedFor] = useState<string | null>(null);
  const wsSeqRef = useRef(0);
  const foldersSeqRef = useRef(0);
  const [pick, setPick] = useState<FolderPick>(() => folderFromSearch(window.location.search));
  const [kind, setKind] = useState<NoteKindFilter>('all');
  const [aiOpenChoice, setAiOpenChoice] = useState<boolean | null>(null);
  const aiOpenRef = useRef(false);
  const [jobsFocusTick, setJobsFocusTick] = useState(0);
  const [uploadTrigger, setUploadTrigger] = useState<HTMLElement | null | false>(false); // false = 닫힘
  const [folderDialog, setFolderDialog] = useState<{ mode: 'create' | 'rename' | 'color'; folder?: NoteFolderDto; trigger: HTMLElement | null } | null>(null);
  const [proDialog, setProDialog] = useState<{ kind: 'folders' | 'upload'; trigger: HTMLElement | null } | null>(null);
  const [wsBusy, setWsBusy] = useState(false);
  const [wsMsg, setWsMsg] = useState('');

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

  // M2-1c: 구간도 반영 — 잘못된 구간이면 묻지 않는다(칸 아래 안내가 대신). 캐시 키 = 계정·영상·구간
  const estStart = range.error ? null : range.startSec;
  const estEnd = range.error ? null : range.endSec;
  const rangeInvalid = Boolean(range.error);
  useEffect(() => {
    const mySeq = ++estimateSeqRef.current; // 이전 요청 무효화
    const vid = pickedVideoId;
    const uid = activeUid;
    if (!vid || !uid || !aiReady || rangeInvalid) {
      setEstimate({ kind: 'idle' });
      return;
    }
    const span = rangeBody({ startSec: estStart, endSec: estEnd, error: '' });
    const cacheKey = `${uid}|${vid}|${estStart ?? ''}|${estEnd ?? ''}`;
    const cached = estimateCacheRef.current.get(cacheKey);
    if (cached) {
      setEstimate({ kind: 'ok', estimated: cached.estimatedCredits, reserve: cached.reserveCredits });
      return;
    }
    setEstimate({ kind: 'loading' });
    const timer = setTimeout(async () => {
      try {
        const r = await apiClient.credits.estimate({ kind: 'note', url: `https://www.youtube.com/watch?v=${vid}`, ...span });
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
  }, [pickedVideoId, aiReady, activeUid, estStart, estEnd, rangeInvalid]);

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
      q.delete('url'); // NT-2a: ?folder=는 남긴다
      window.history.replaceState(null, '', window.location.pathname + (q.toString() ? '?' + q.toString() : ''));
    }
  }, []);

  // NT-2a: 뒤로 가기로 고른 노트북을 되돌린다(pushState와 짝)
  useEffect(() => {
    const onPop = () => setPick(folderFromSearch(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
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
      setNotesLoadedFor(uid);
    } catch {
      /* ignore background error */
      if (mySeq === notesReqSeqRef.current && auth.getUser()?.id === uid) setNotesLoadedFor(uid);
    }
  };

  // NT-2a: 노트북·자료 노트. 지연 응답·다른 계정 응답은 버린다(frontend-state §1)
  const loadWorkspace = async (uid: string | null) => {
    const mySeq = ++wsSeqRef.current;
    ++foldersSeqRef.current;
    if (!uid || !apiClient.isLoggedIn()) {
      setFolders([]);
      setDocs([]);
      return;
    }
    // 조회 중 쓰기(업로드·노트북 변경 → reloadFolders가 foldersSeqRef를 올림)가 끝났다면 옛 스냅샷이므로 다시 받는다
    let f: NoteFolderDto[] | null = null;
    let d: NoteDocSummaryDto[] | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const writeMark = foldersSeqRef.current;
      [f, d] = await Promise.all([
        apiClient.noteWorkspace.listNoteFolders().catch(() => null),
        apiClient.noteWorkspace.listNoteDocs().catch(() => null),
      ]);
      if (mySeq !== wsSeqRef.current || auth.getUser()?.id !== uid) return;
      if (writeMark === foldersSeqRef.current) break;
    }
    if (mySeq !== wsSeqRef.current || auth.getUser()?.id !== uid) return;
    if (f) setFolders(f);
    if (d) setDocs(d);
    setWsLoadedFor(uid);
  };

  /** 쓰기 뒤 노트북 개수는 서버가 센다 — 목록만 다시 받는다(§4.2) */
  const reloadFolders = async (uid: string | null) => {
    if (!uid) return;
    const mySeq = ++foldersSeqRef.current;
    const wsSeq = wsSeqRef.current;
    try {
      const f = await apiClient.noteWorkspace.listNoteFolders();
      if (mySeq !== foldersSeqRef.current || wsSeq !== wsSeqRef.current || auth.getUser()?.id !== uid) return;
      setFolders(f);
    } catch {
      /* 개수만 늦게 맞는다 */
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
    // NT-2a: 사용자 변경 — 목록·열린 대화상자·펼침 선택을 비우고 시퀀스를 올린다(frontend-state §4)
    setNotes([]);
    setFolders([]);
    setDocs([]);
    setWsLoadedFor(null);
    setNotesLoadedFor(null);
    setUploadTrigger(false);
    setFolderDialog(null);
    setProDialog(null);
    setAiOpenChoice(null);
    setWsMsg('');
    setWsBusy(false);
    void loadWorkspace(activeUid);
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
      setFormMsg({ text: t('notes.errNotYoutubeUrl'), kind: 'err' });
      return;
    }
    if (range.error) {
      setOptOpen(true); // 접혀 있어도 고칠 칸을 보여 준다
      setFormMsg({ text: rangeErrorText(range.error), kind: 'err' });
      return;
    }
    if (selectedTags.length === 0) {
      setFormMsg({ text: t('notes.errSelectTag'), kind: 'err' });
      return;
    }
    if (!loggedIn) {
      setFormMsg({ text: t('notes.errLoginRequired'), kind: 'err' });
      return;
    }
    if (tierBlocked) {
      setFormMsg({ text: t('notes.errProRequired'), kind: 'err' });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setFormMsg({ text: t('notes.sendingAnalyzeReq'), kind: '' });
    try {
      const orderedTags = NOTE_FORM_TAGS.filter((t) => selectedTags.includes(t));
      const r = await apiClient.notes.analyze({
        url: `https://www.youtube.com/watch?v=${pickedVideoId}`,
        tags: orderedTags,
        memo: memoVal.trim(),
        ...rangeBody(range),
      });
      const reserved = typeof r.reservedCredits === 'number' ? t('notes.reservedCredits', { n: r.reservedCredits }) : '';
      setFormMsg({ text: t('notes.analyzeRequested', { reserved }), kind: 'ok' });
      setUrlVal('');
      setMemoVal('');
      setStartText('');
      setEndText('');
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

  // M2-1c: 실패 작업 원탭 재시도 — 링크·태그·메모·구간을 폼에 채우고 시작 칸으로 간다.
  // 요청은 보내지 않는다(같은 구간이면 같은 이유로 다시 실패하고 크레딧을 또 예약한다). 사용자가 고친 뒤 분석 요청
  const handleRetry = (job: AnalysisJobDto) => {
    if (submittingRef.current) return;
    const d = retryDraft(job, NOTE_FORM_TAGS, DEFAULT_FORM_TAGS);
    setUrlVal(d.url);
    setSelectedTags(d.tags);
    setMemoVal(d.memo);
    setStartText(d.startText);
    setEndText(d.endText);
    setOptOpen(true);
    setFormMsg({ text: t('notes.retry.filled'), kind: '' });
    setFocusStartTick((n) => n + 1);
  };
  useEffect(() => {
    if (focusStartTick > 0) startInputRef.current?.focus(); // 패널이 열린 렌더 뒤 — 포커스가 폼까지 스크롤한다
  }, [focusStartTick]);
  useEffect(() => {
    if (jobsFocusTick > 0) document.getElementById('jobs')?.scrollIntoView({ block: 'start' });
  }, [jobsFocusTick]);

  // ---- NT-2a 워크스페이스 파생 값(렌더 때 계산 — frontend-state §2) ----
  const me = authState.me;
  const limits = me?.limits;
  const uploadLocked = loggedIn && limits?.noteFiles === false; // 무료: 자료 노트·첨부 업로드 불가(N2·N6)
  const folderLocked = loggedIn && limits?.noteFolders === 0; // 무료: 노트북 만들기 불가
  const wsReady = loggedIn && wsLoadedFor === activeUid;
  const listsReady = loggedIn && notesLoadedFor === activeUid;
  // 없어진 노트북 id가 주소에 남아 있으면 전체로 본다
  const effectivePick: FolderPick =
    pick !== 'all' && pick !== 'none' && wsReady && !folders.some((f) => f.id === pick) ? 'all' : pick;
  const selectedFolder = effectivePick !== 'all' && effectivePick !== 'none' ? folders.find((f) => f.id === effectivePick) : undefined;
  const items = workspaceItems(notes, docs, effectivePick, kind);
  const allCount = notes.length + docs.length;
  const noneCount = notes.filter((n) => !n.folderId).length + docs.filter((d) => !d.folderId).length;
  const quota =
    loggedIn && typeof me?.usage?.fileBytes === 'number'
      ? { used: me.usage.fileBytes, limit: typeof limits?.fileBytes === 'number' ? limits.fileBytes : null }
      : null;
  // V2 B: 노트가 0개면 AI 상자를 펼치고, 1개 이상이면 접는다. 사용자가 직접 열고 닫으면 그 선택을 따른다
  const aiAutoOpen = !loggedIn || (listsReady && wsReady && allCount === 0);
  const aiOpen = aiOpenChoice ?? aiAutoOpen;
  aiOpenRef.current = aiOpen;
  const activeJobs = jobs.filter((j) => j && (j.status === 'queued' || j.status === 'running')).length;
  const failedJobs = jobs.filter((j) => j && j.status === 'failed').length;

  const choosePick = (next: FolderPick) => {
    if (next === effectivePick) return;
    setPick(next);
    const q = new URLSearchParams(window.location.search);
    const v = folderToQuery(next);
    if (v) q.set('folder', v);
    else q.delete('folder');
    window.history.pushState(null, '', window.location.pathname + (q.toString() ? '?' + q.toString() : ''));
  };

  const chooseKind = (next: NoteKindFilter) => {
    if (next === kind) return;
    setKind(next);
    if (next !== 'ai' && filterTagRef.current) {
      // 태그 필터는 AI 노트 전용 — 다른 종류로 가면 풀고 전체 AI 노트를 다시 받는다
      setFilterTag('');
      filterTagRef.current = '';
      void loadNotesOnly('', activeUid);
    }
  };

  /** 쓰기 공통: 같은 계정일 때만 결과를 반영한다. 실패는 문구로 던진다 */
  const wsWrite = async <T,>(fn: () => Promise<T>, apply: (r: T) => void): Promise<void> => {
    const uid = activeUid;
    const seq = wsSeqRef.current;
    setWsBusy(true);
    setWsMsg('');
    try {
      const r = await fn();
      if (uid !== auth.getUser()?.id || seq !== wsSeqRef.current) return;
      apply(r);
      void reloadFolders(uid);
    } catch (err) {
      if (uid !== auth.getUser()?.id || seq !== wsSeqRef.current) return;
      const e = err as { code?: string; status?: number; data?: unknown };
      throw new Error(e && (e.code || e.status) ? describeUploadError(e).text : t('notes.ws.actionError'));
    } finally {
      if (uid === auth.getUser()?.id) setWsBusy(false);
    }
  };

  const moveFolder = (id: string, delta: -1 | 1) => {
    const ids = moveId(folders.map((f) => f.id), id, delta);
    if (!ids || wsBusy) return;
    void wsWrite(() => apiClient.noteWorkspace.reorderNoteFolders(ids), (list) => {
      if (list.length) setFolders(list);
    }).catch((err: Error) => setWsMsg(err.message));
  };

  const deleteFolder = (folder: NoteFolderDto) => {
    if (!window.confirm(t('notes.ws.deleteFolderConfirm', { name: folder.name }))) return;
    void wsWrite(() => apiClient.noteWorkspace.deleteNoteFolder(folder.id), () => {
      // 서버가 안의 노트를 기본 노트북으로 옮긴다
      setFolders((list) => list.filter((f) => f.id !== folder.id));
      setNotes((list) => list.map((n) => (n.folderId === folder.id ? { ...n, folderId: null } : n)));
      setDocs((list) => list.map((d) => (d.folderId === folder.id ? { ...d, folderId: null } : d)));
      if (effectivePick === folder.id) choosePick('all');
    }).catch((err: Error) => setWsMsg(err.message));
  };

  const openUpload = (el: HTMLElement) => {
    if (uploadLocked) setProDialog({ kind: 'upload', trigger: el });
    else setUploadTrigger(el);
  };
  const openFolderCreate = (el: HTMLElement) => {
    if (folderLocked) setProDialog({ kind: 'folders', trigger: el });
    else setFolderDialog({ mode: 'create', trigger: el });
  };

  const keyGateVisible = !loggedIn || tierBlocked;
  const keyGateText = !loggedIn
    ? t('notes.errLoginRequired')
    : t('notes.gatePro');

  const folderTitle = selectedFolder ? selectedFolder.name : effectivePick === 'none' ? t('notes.ws.defaultFolder') : t('notes.ws.all');

  return (
    <AppShell variant="narrow" activeNav="notes">
      <div className={styles.headerBlock}>
        <div className={styles.titleRow}>
          <h1 className={`page-title ${styles.pageTitle}`} data-align-group="notesTitle:center-y">
            Notes
          </h1>
          <BetaBadge alignGroup="notesTitle:center-y" />
          {loggedIn && (
            <div className={styles.headActions}>
              <button
                type="button"
                className={`ghostBtn ${styles.headBtn}`}
                id="noteFolderAddBtn"
                data-align-group="notesActions:center-y"
                data-locked={folderLocked || undefined}
                onClick={(e) => openFolderCreate(e.currentTarget)}
              >
                {t('notes.ws.addFolder')}
                {folderLocked && <span className={styles.proMark}> · PRO</span>}
              </button>
              <button
                type="button"
                className={`pillBtn ${styles.headBtn}`}
                id="noteUploadBtn"
                data-align-group="notesActions:center-y"
                data-locked={uploadLocked || undefined}
                onClick={(e) => openUpload(e.currentTarget)}
              >
                {t('notes.ws.upload')}
                {uploadLocked && <span className={styles.proMark}> · PRO</span>}
              </button>
            </div>
          )}
        </div>
        <p className={`page-sub ${styles.pageSub}`}>
          {t('notes.pageSub')}{' '}
          <SafeLink id="notionLink" href={notionLinkUrl} external hidden={!notionLinkUrl}>
            {t('notes.viewInNotion')}
          </SafeLink>
        </p>
      </div>

      <details
        className={styles.aiBox}
        id="aiNoteBox"
        open={aiOpen}
        onToggle={(e) => {
          const open = (e.currentTarget as HTMLDetailsElement).open;
          if (open !== aiOpenRef.current) setAiOpenChoice(open); // 화면이 바꾼 열림은 무시하고 사용자 조작만 기억한다
        }}
      >
        <summary className={styles.aiSummary}>
          <span>{t('notes.ws.aiBox')}</span>
          <span className={styles.metaLine}>{t('notes.ws.aiBoxHint')}</span>
        </summary>
        <div className={styles.aiBody}>
      <div className={`card key-gate-box ${styles.keyGateBox}`} id="keyGateBox" hidden={!keyGateVisible}>
        <p id="keyGateMsg">{keyGateText}</p>
        <div className={styles.keyGateActions}>
          {loggedIn ? (
            <SafeLink href="settings.html#credits">{t('notes.linkSettingsCredits')}</SafeLink>
          ) : (
            <SafeLink href="settings.html#account">{t('notes.linkLogin')}</SafeLink>
          )}
        </div>
      </div>

      <form className={`note-form ${styles.noteForm}`} id="form" onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span className={styles.lab}>{t('notes.labYoutubeUrl')}</span>
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
            <span className="hint">{t('notes.hintVideoConfirmed')}</span>
          </span>
        </label>

        <div className={styles.field}>
          <span className={styles.lab}>{t('notes.labTags')}</span>
          <div className={`tags ${styles.tags}`} id="tags" role="group" aria-label={t('notes.ariaTags')}>
            {NOTE_FORM_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={styles.tagBtn}
                aria-pressed={selectedTags.includes(tag)}
                onClick={() => toggleFormTag(tag)}
              >
                {noteTagLabel(tag)}
              </button>
            ))}
          </div>
          <span className="hint">{t('notes.hintTags')}</span>
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
            {optOpen ? t('notes.opt.close') : optFilled ? t('notes.opt.openFilled') : t('notes.opt.open')}
          </button>
          <div id="noteOptPanel" className={styles.optPanel} hidden={!optOpen}>
            <div className={styles.field}>
              <div className={styles.rangeRow}>
                <label className={styles.field}>
                  <span className={styles.lab}>
                    {t('notes.range.start')} <span className="hint">{t('notes.range.optional')}</span>
                  </span>
                  <input
                    ref={startInputRef}
                    className="inpField"
                    id="noteStart"
                    type="text"
                    placeholder={t('notes.range.startPh')}
                    autoComplete="off"
                    value={startText}
                    aria-invalid={range.error ? true : undefined}
                    aria-describedby="noteRangeHelp"
                    data-align-group="noteRange:top,height@390"
                    onChange={(e) => setStartText(e.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.lab}>
                    {t('notes.range.end')} <span className="hint">{t('notes.range.optional')}</span>
                  </span>
                  <input
                    className="inpField"
                    id="noteEnd"
                    type="text"
                    placeholder={t('notes.range.endPh')}
                    autoComplete="off"
                    value={endText}
                    aria-invalid={range.error ? true : undefined}
                    aria-describedby="noteRangeHelp"
                    data-align-group="noteRange:top,height@390"
                    onChange={(e) => setEndText(e.target.value)}
                  />
                </label>
              </div>
              <span id="noteRangeHelp">
                {range.error ? (
                  <span className={styles.rangeErr} id="noteRangeErr">
                    {rangeErrorText(range.error)}
                  </span>
                ) : (
                  <span className="hint">{t('notes.range.hint')}</span>
                )}
              </span>
            </div>
            <label className={styles.field}>
              <span className={styles.lab}>
                {t('notes.labMemo')} <span className="hint">{t('notes.range.optional')}</span>
              </span>
              <textarea
                className="inpField"
                id="memo"
                placeholder={t('notes.phMemo')}
                value={memoVal}
                onChange={(e) => setMemoVal(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className={styles.submitRow}>
          <button
            className={`ghostBtn ${styles.submitBtn}`}
            id="submit"
            type="submit"
            data-align-group="submitRow:center-y"
            disabled={submitting || keyGateVisible}
          >
            {t('notes.btnAnalyze')}
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

      <h2 className={styles.sectionTitle}>{t('notes.titleJobs')}</h2>
      <ul className={`runs ${styles.runs}`} id="jobs">
        {jobs.length === 0 ? (
          <li className={`empty ${styles.empty}`}>{t('notes.emptyJobs')}</li>
        ) : (
          jobs.map((job) => {
            const vid = videoIdFrom(job.url || '');
            const tagStr = Array.isArray(job.tags) && job.tags.length > 0 ? job.tags.map(noteTagLabel).join(', ') : t('notes.noTags');
            const timeStr = formatAgo(job.createdAt);
            const why = job.status === 'failed' ? describeJobError(job.error) : null;
            const stage = jobStage(job, nowMs); // 대기·분석 중이면 경과 시간 배지·안내, 끝났으면 null
            const canRetry = job.status === 'failed' && job.kind !== 'progression'; // 코드 진행 작업은 CHORDS 폼에서
            return (
              <li key={job.id} className={`run ${styles.runItem}`}>
                {vid ? (
                  <SafeLink href={`https://www.youtube.com/watch?v=${encodeURIComponent(vid)}`} external>
                    <img src={thumb(vid)} alt={t('notes.altThumb')} />
                  </SafeLink>
                ) : (
                  <span />
                )}
                <div data-align-group={canRetry ? 'jobRetry:left' : undefined}>
                  <div className={`t ${styles.runTitle}`}>{tagStr}</div>
                  <div
                    className={`sub ${styles.runSub}`}
                    data-layout-ignore="G3: 작업 줄 URL은 한 줄 말줄임(줄 높이 고정)" // i18n-keep: G3 레이아웃 무시 속성(D5-3)
                  >
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
                      {t('notes.btnViewNote')}
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
                        ? t('notes.statusDone')
                        : why
                          ? why.title
                          : t('notes.statusFailed')}
                  </span>
                </div>
                {canRetry && (
                  <button
                    type="button"
                    className={`ghostBtn ${styles.retryBtn}`}
                    data-job-retry={job.id}
                    data-align-group="jobRetry:left"
                    disabled={submitting}
                    onClick={() => handleRetry(job)}
                  >
                    {why?.code === 'GEMINI_MAX_TOKENS' ? t('notes.retry.shorten') : t('notes.retry.again')}
                  </button>
                )}
              </li>
            );
          })
        )}
      </ul>

        </div>
      </details>

      {!aiOpen && activeJobs + failedJobs > 0 && (
        <div className={styles.jobsStrip} id="noteJobsStrip">
          {activeJobs > 0 && <span className={styles.metaLine}>{t('notes.ws.jobsActive', { n: activeJobs })}</span>}
          {failedJobs > 0 && <span className={styles.metaLine}>{t('notes.ws.jobsFailed', { n: failedJobs })}</span>}
          <button
            type="button"
            className={styles.textBtn}
            id="noteJobsShow"
            onClick={() => {
              setAiOpenChoice(true);
              setJobsFocusTick((n) => n + 1);
            }}
          >
            {t('notes.ws.jobsShow')}
          </button>
        </div>
      )}

      {uploadLocked && (
        <div className={styles.freeNotice} id="noteFreeNotice">
          <span>{t('notes.ws.freeNote')}</span>{' '}
          <SafeLink href="settings.html#credits">{t('notes.ws.planLink')}</SafeLink>
        </div>
      )}

      <div className={styles.ws} data-ws={loggedIn ? 'nav' : 'plain'}>
        {loggedIn && (
          <NoteFolderNav
            folders={folders}
            pick={effectivePick}
            allCount={allCount}
            noneCount={noneCount}
            folderLimit={limits?.noteFolders}
            quota={quota}
            busy={wsBusy}
            onPick={choosePick}
            onMove={moveFolder}
          />
        )}
        <div className={styles.wsMain}>
          <div className={styles.folderHead} id="noteFolderHead" data-align-group="notesWs:top@961">
            <h2 className={styles.folderTitle}>{folderTitle}</h2>
            {selectedFolder && (
              <div className={styles.folderActs}>
                <button type="button" className={styles.textBtn} id="noteFolderRename" disabled={wsBusy}
                  onClick={(e) => setFolderDialog({ mode: 'rename', folder: selectedFolder, trigger: e.currentTarget })}>
                  {t('notes.ws.rename')}
                </button>
                <button type="button" className={styles.textBtn} id="noteFolderColor" disabled={wsBusy}
                  onClick={(e) => setFolderDialog({ mode: 'color', folder: selectedFolder, trigger: e.currentTarget })}>
                  {t('notes.ws.color')}
                </button>
                <button type="button" className={styles.textBtn} id="noteFolderDelete" disabled={wsBusy} onClick={() => deleteFolder(selectedFolder)}>
                  {t('notes.ws.delete')}
                </button>
              </div>
            )}
          </div>
          {wsMsg && <p className="msg err" id="noteWsMsg" role="alert">{wsMsg}</p>}
          <div className={styles.filterTags} id="noteKindFilter" role="group" aria-label={t('notes.ws.ariaKind')}>
            {([['all', 'notes.ws.kindAll'], ['ai', 'notes.ws.kindAi'], ['doc', 'notes.ws.kindDoc']] as const).map(([k, key]) => (
              <button key={k} type="button" className={styles.filterBtn} data-kind={k} aria-pressed={kind === k} onClick={() => chooseKind(k)}>
                {t(key)}
              </button>
            ))}
          </div>
      <div className={`tags filter-tags ${styles.filterTags}`} id="noteTagFilter" role="group" aria-label={t('notes.ariaTagFilter')} hidden={kind !== 'ai'}>
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
            {tag ? noteTagLabel(tag) : t('notes.tagAll')}
          </button>
        ))}
      </div>

      <div className={`notes-list ${styles.notesList}`} id="notesList" aria-label={t('notes.titleNotes')}>
        {items.length === 0 ? (
          <div className={`empty ${styles.empty}`}>
            {filterTag && kind === 'ai' ? (
              <p>{t('notes.emptyFilteredNotes', { tag: noteTagLabel(filterTag) })}</p>
            ) : allCount > 0 ? (
              <p>{t('notes.ws.emptyFolder')}</p>
            ) : (
              <>
                <p>{t('notes.emptyNotes')}</p>
                {loggedIn && <p>{t('notes.ws.emptyHint')}</p>}
              </>
            )}
          </div>
        ) : (
          items.map((it) =>
            it.type === 'ai' ? (
              <NoteCard
                key={it.key}
                item={{ type: 'ai', note: it.note }}
                folders={folders}
                canMove={folders.length > 0 || Boolean(it.note.folderId)}
                timeText={formatAgo(it.note.createdAt)}
                tagLabel={noteTagLabel}
                onMove={(folderId) =>
                  wsWrite(() => apiClient.notes.setFolder(it.note.id, folderId), () =>
                    setNotes((list) => list.map((n) => (n.id === it.note.id ? { ...n, folderId } : n))),
                  )
                }
                onRename={(title) =>
                  wsWrite(() => apiClient.notes.update(it.note.id, { title }), (r) =>
                    setNotes((list) => list.map((n) => (n.id === it.note.id ? { ...n, title: r?.title ?? title } : n))),
                  )
                }
                onDelete={() =>
                  wsWrite(() => apiClient.notes.remove(it.note.id), () => setNotes((list) => list.filter((n) => n.id !== it.note.id)))
                }
              />
            ) : (
              <NoteCard
                key={it.key}
                item={{ type: 'doc', doc: it.doc }}
                folders={folders}
                canMove={folders.length > 0 || Boolean(it.doc.folderId)}
                timeText={formatAgo(it.doc.updatedAt)}
                tagLabel={noteTagLabel}
                onMove={(folderId) =>
                  wsWrite(() => apiClient.noteWorkspace.updateNoteDoc(it.doc.id, { folderId }), (r) =>
                    setDocs((list) => list.map((d) => (d.id === it.doc.id ? { ...d, ...(r ?? {}), folderId } : d))),
                  )
                }
                onRename={(title) =>
                  wsWrite(() => apiClient.noteWorkspace.updateNoteDoc(it.doc.id, { title }), (r) =>
                    setDocs((list) => list.map((d) => (d.id === it.doc.id ? { ...d, ...(r ?? {}), title: r?.title ?? title } : d))),
                  )
                }
                onDelete={() =>
                  wsWrite(() => apiClient.noteWorkspace.deleteNoteDoc(it.doc.id), () => {
                    setDocs((list) => list.filter((d) => d.id !== it.doc.id));
                    void auth.fetchMe(); // 지운 첨부만큼 사용량이 준다
                  })
                }
              />
            ),
          )
        )}
      </div>
        </div>
      </div>

      {uploadTrigger !== false && activeUid && (
        <NoteUploadDialog
          uid={activeUid}
          me={me}
          folders={folders}
          folder={effectivePick}
          trigger={uploadTrigger}
          onClose={() => setUploadTrigger(false)}
          onUploaded={(doc) => {
            const { body: _body, files: _files, ...summary } = doc;
            setDocs((list) => [summary, ...list.filter((d) => d.id !== doc.id)]);
            void reloadFolders(activeUid);
            void auth.fetchMe(); // 사용량 막대(§4.3-8)
          }}
        />
      )}
      {folderDialog && (
        <FolderDialog
          mode={folderDialog.mode}
          folder={folderDialog.folder}
          trigger={folderDialog.trigger}
          onClose={() => setFolderDialog(null)}
          onSubmit={(input) => {
            const target = folderDialog.folder;
            if (!target) {
              return wsWrite(() => apiClient.noteWorkspace.createNoteFolder({ name: input.name ?? '', color: input.color }), (f) => {
                if (f) setFolders((list) => [...list, f]);
              });
            }
            return wsWrite(() => apiClient.noteWorkspace.updateNoteFolder(target.id, input), (f) => {
              if (f) setFolders((list) => list.map((x) => (x.id === f.id ? f : x)));
            });
          }}
        />
      )}
      {proDialog && <ProDialog kind={proDialog.kind} trigger={proDialog.trigger} onClose={() => setProDialog(null)} />}
    </AppShell>
  );
}

export default NotesPage;

