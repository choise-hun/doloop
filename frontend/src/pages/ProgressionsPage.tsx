// frontend/src/pages/ProgressionsPage.tsx
// CH-5: CHORDS — 코드 진행 모음. 범위 토글(레퍼런스·분석·합산) + 진행 넣기(영상·직접·붙여넣기) + 목록(수정·삭제)
// 프레임: 개발산출물/결과/CH-1a_프레임.md §2, 데이터: 결과/CH-1b_설계.md §3·§8
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { SafeLink } from '../components/common/SafeLink';
import { ProgressionEditor } from '../components/progressions/ProgressionEditor';
import { ProgressionRow } from '../components/progressions/ProgressionRow';
import { PastePanel } from '../components/progressions/PastePanel';
import { VideoAnalyzeForm } from '../components/progressions/VideoAnalyzeForm';
import { ReadingGuide } from '../components/progressions/ReadingGuide';
import { TastePanel } from '../components/progressions/TastePanel';
import { hasSequence } from '../lib/chords/stats.mts';
import pStyles from '../components/progressions/Progressions.module.css';
import { emptyForm, filterScope, jobOptionsLabel, playHref, searchProgressions, seedToDto, SORT_LABEL, sortProgressions, summarizeDoneJobs } from '../components/progressions/model.mts';
import { t, type I18nKey } from '../lib/i18n.mts';
import type { ProgressionForm, SortBy } from '../components/progressions/model.mts';
import { auth, canUseAi, useAuth } from '../lib/auth';
import { AnalysisJobDto, apiClient, ProgressionDto, ProgressionInput, ProgressionScope } from '../lib/apiClient';
import { DEFAULT_ARCHIVE_PROGRESSIONS, DEFAULT_REFERENCE_PROGRESSIONS } from '../lib/progressions';
import { videoIdFrom } from '../lib/security';
import { describeJobError } from '../lib/jobError.mts';
import { BetaBadge } from '../components/common/BetaBadge';
import styles from './ProgressionsPage.module.css';

const SCOPES: ReadonlyArray<readonly [ProgressionScope, I18nKey]> = [
  ['reference', 'prog.scopeReference'],
  ['analysis', 'prog.scopeAnalysis'],
  ['all', 'prog.scopeAll'],
];

type AddTab = 'video' | 'manual' | 'paste';
const ADD_TABS: ReadonlyArray<readonly [AddTab, I18nKey]> = [
  ['video', 'prog.tabVideo'],
  ['manual', 'prog.tabManual'],
  ['paste', 'prog.tabPaste'],
];

const SEEDS: ProgressionDto[] = [...DEFAULT_REFERENCE_PROGRESSIONS, ...DEFAULT_ARCHIVE_PROGRESSIONS].map(seedToDto);

function initialScope(): ProgressionScope {
  const q = new URLSearchParams(window.location.search).get('scope');
  return q === 'analysis' || q === 'all' || q === 'reference' ? q : 'reference';
}

// 연습실에서 돌아올 때(#p-<id>) 또는 ?id= 로 그 행을 펼친다. id는 UUID 또는 시드 id(ref-seed-1)
function initialFocusId(): string {
  const h = /^#p-([A-Za-z0-9_-]{1,64})$/.exec(window.location.hash);
  if (h) return h[1];
  return new URLSearchParams(window.location.search).get('id') || '';
}

const isActive = (j: AnalysisJobDto) => j.status === 'queued' || j.status === 'running';

export function ProgressionsPage(): React.ReactElement {
  useEffect(() => {
    document.title = t('prog.pageTitle');
  }, []);

  const authState = useAuth();
  const activeUid = authState.user?.id ?? null;
  const loggedIn = Boolean(activeUid && apiClient.isLoggedIn());

  const [scope, setScope] = useState<ProgressionScope>(initialScope);
  const [focusId] = useState(initialFocusId);
  const [items, setItems] = useState<ProgressionDto[]>([]);
  const [loadMsg, setLoadMsg] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<AddTab>('manual');
  const [manualInit, setManualInit] = useState<{ form: ProgressionForm; seq: number }>({ form: emptyForm(), seq: 0 });
  const [justSaved, setJustSaved] = useState<ProgressionDto | null>(null);
  const [jobs, setJobs] = useState<AnalysisJobDto[]>([]);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [tasteFilter, setTasteFilter] = useState(''); // 취향 통계 줄(묶음·이동)로 목록 거르기

  const listSeqRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackedRef = useRef<Set<string>>(new Set());

  // M1-3c: /me를 받기 전에는 막지 않는다(서버가 403으로 판단)
  const aiAllowed = loggedIn && (!authState.me || canUseAi(authState.me));

  const loadList = useCallback(async (uid: string | null) => {
    const mySeq = ++listSeqRef.current;
    if (!uid || !apiClient.isLoggedIn()) {
      setItems([]);
      setLoadMsg('');
      return;
    }
    setLoadMsg(t('prog.loading'));
    try {
      const list = await apiClient.progressions.list();
      if (mySeq !== listSeqRef.current || auth.getUser()?.id !== uid) return;
      setItems(list);
      setLoadMsg('');
    } catch (err: any) {
      if (mySeq !== listSeqRef.current) return;
      setLoadMsg((err && err.message) || t('prog.loadFailed'));
    }
  }, []);

  // 코드 진행 영상 작업: 진행 작업(kind=progression) 중 진행 중인 것 + 이 화면에서 지켜본 것
  const refreshJobs = useCallback(
    async (uid: string | null) => {
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
      if (!uid || !apiClient.isLoggedIn()) {
        setJobs([]);
        return;
      }
      try {
        const all = await apiClient.notes.listJobs();
        if (auth.getUser()?.id !== uid) return;
        const mine = all.filter((j) => j && j.kind === 'progression');
        const finishedNow = mine.some((j) => !isActive(j) && trackedRef.current.has(j.id) && j.status === 'done');
        for (const j of mine) if (isActive(j)) trackedRef.current.add(j.id);
        const shown = mine.filter((j) => isActive(j) || trackedRef.current.has(j.id));
        setJobs(shown);
        if (finishedNow) void loadList(uid);
        if (shown.some(isActive)) {
          pollRef.current = setTimeout(() => void refreshJobs(uid), 5000);
        }
      } catch {
        /* 배경 갱신 실패는 무시 */
      }
    },
    [loadList]
  );

  useEffect(() => {
    trackedRef.current.clear();
    setJustSaved(null);
    void loadList(activeUid);
    void refreshJobs(activeUid);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [activeUid, loadList, refreshJobs]);

  const source = loggedIn ? items : SEEDS;
  const inScope = useMemo(() => filterScope(source, scope), [source, scope]);
  const tasteMatched = useMemo(() => (tasteFilter ? inScope.filter((p) => hasSequence(p, tasteFilter)) : inScope), [inScope, tasteFilter]);
  const shown = useMemo(() => sortProgressions(searchProgressions(tasteMatched, query), sortBy), [tasteMatched, query, sortBy]);
  const counts = useMemo(
    () => ({ reference: filterScope(source, 'reference').length, analysis: filterScope(source, 'analysis').length, all: source.length }),
    [source]
  );

  const pickTaste = (label: string) => {
    setTasteFilter((cur) => (cur === label ? '' : label));
    window.requestAnimationFrame(() => document.getElementById('progTools')?.scrollIntoView({ block: 'nearest' }));
  };

  const pickScope = (s: ProgressionScope) => {
    setScope(s);
    setTasteFilter('');
    const url = new URL(window.location.href);
    if (s === 'reference') url.searchParams.delete('scope');
    else url.searchParams.set('scope', s);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  };

  const handleCreate = async (body: ProgressionInput) => {
    const created = await apiClient.progressions.create(body);
    if (!created) throw new Error(t('prog.saveResponseEmpty'));
    setItems((prev) => [created, ...prev.filter((x) => x.id !== created.id)]);
    setJustSaved(created);
    setManualInit({ form: emptyForm(body.kind || 'reference'), seq: manualInit.seq + 1 });
    if (scope !== 'all' && scope !== created.kind) pickScope(created.kind);
  };

  const handleUpdate = async (id: string, patch: ProgressionInput) => {
    const updated = await apiClient.progressions.update(id, patch);
    if (updated) setItems((prev) => prev.map((x) => (x.id === id ? updated : x)));
  };

  const handleRemove = async (id: string) => {
    await apiClient.progressions.remove(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
    if (justSaved && justSaved.id === id) setJustSaved(null);
  };

  const openAdd = (tab: AddTab) => {
    setAddOpen(true);
    setAddTab(tab);
  };

  // GA-4: 진행 중·실패는 한 줄씩, 끝난 작업은 한 줄로 합쳐 수만 늘린다
  const openJobs = jobs.filter((j) => j.status !== 'done');
  const doneSum = useMemo(() => summarizeDoneJobs(jobs, items), [jobs, items]);

  const jobLine = (j: AnalysisJobDto): React.ReactNode => {
    const vid = videoIdFrom(j.url || '');
    const opts = jobOptionsLabel(j);
    const label = (vid ? `youtu.be/${vid}` : j.url) + (opts ? ` · ${opts}` : '');
    if (isActive(j)) return <>{j.status === 'queued' ? t('prog.jobQueued') : t('prog.jobAnalyzing')} · {label}</>;
    if (j.status === 'failed') {
      const why = describeJobError(j.error);
      return (
        <>
          <span title={why.detail || undefined}>{why.title}</span> · {label}
          <span className={styles.jobHint} data-error-code={why.code}>{why.hint}</span>
        </>
      );
    }
    return null;
  };

  const doneLine = (): React.ReactNode => {
    const { jobCount, collected, latestNoteId } = doneSum;
    const noteLink = latestNoteId ? (
      <SafeLink href={`note.html?id=${encodeURIComponent(latestNoteId)}`}>{jobCount > 1 ? t('prog.jobViewLatestNote') : t('prog.jobViewNote')}</SafeLink>
    ) : null;
    const prefix = jobCount > 1 ? t('prog.jobVideosPrefix', { count: jobCount }) : '';
    return collected > 0 ? (
      <>
        {prefix}
        {t('prog.jobCollected', { count: collected })}{noteLink}
      </>
    ) : (
      <>
        {t('prog.jobNoneFound', { prefix })}{noteLink}
      </>
    );
  };

  return (
    <AppShell variant="default" activeNav="chords">
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Chords</h1>
          <p className={styles.pageSub}>{t('prog.pageSub')}</p>
        </div>
        <div className={styles.headActs}>
          <div className={styles.scope} role="group" aria-label={t('prog.scopeGroupAria')} id="progScope">
            {SCOPES.map(([s, labelKey]) => (
              <button key={s} type="button" aria-pressed={scope === s} data-scope={s} onClick={() => pickScope(s)}>
                {t(labelKey)} <span className={styles.count}>{counts[s]}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="pillBtn"
            id="progAddBtn"
            aria-expanded={addOpen}
            aria-controls="progAddPanel"
            onClick={() => setAddOpen((v) => !v)}
          >
            {addOpen ? t('prog.btnClose') : t('prog.btnAddProg')}
          </button>
        </div>
      </div>

      {addOpen && (
        <section className={styles.addPanel} id="progAddPanel" aria-label={t('prog.addPanelAria')}>
          {!loggedIn ? (
            <p className={styles.loginGate} id="progLoginGate">
              {t('prog.loginPrompt')}<SafeLink href="settings.html#account">{t('prog.loginLink')}</SafeLink>
            </p>
          ) : (
            <>
              <div className={styles.tabs} role="tablist" aria-label={t('prog.inputTabsAria')}>
                {ADD_TABS.map(([tId, labelKey]) => (
                  <button
                    key={tId}
                    type="button"
                    role="tab"
                    id={`progTab-${tId}`}
                    aria-selected={addTab === tId}
                    aria-controls={`progTabPanel-${tId}`}
                    onClick={() => setAddTab(tId)}
                  >
                    {t(labelKey)}
                    {tId === 'video' && <BetaBadge />}
                  </button>
                ))}
              </div>
              <div role="tabpanel" id={`progTabPanel-${addTab}`} aria-labelledby={`progTab-${addTab}`}>
                {addTab === 'video' && (
                  <VideoAnalyzeForm
                    aiAllowed={aiAllowed}
                    busy={jobs.some(isActive)}
                    onRequested={(jobId) => {
                      trackedRef.current.add(jobId);
                      if (scope === 'reference') pickScope('analysis');
                      void refreshJobs(activeUid);
                    }}
                  />
                )}
                {addTab === 'manual' && (
                  <>
                    <ReadingGuide />
                    <ProgressionEditor
                      key={manualInit.seq}
                      idPrefix="new"
                      initial={manualInit.form}
                      submitLabel={t('prog.btnSave')}
                      onSubmit={handleCreate}
                    />
                  </>
                )}
                {addTab === 'paste' && (
                  <>
                    <ReadingGuide />
                    <PastePanel
                      onPick={(chords, part) => {
                        setManualInit({
                          form: { ...emptyForm('reference'), chordsText: chords.join(' - '), part },
                          seq: manualInit.seq + 1,
                        });
                        setAddTab('manual');
                      }}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {justSaved && (
        <div className={styles.savedBanner} id="progSavedBanner" role="status">
          <span>{t('prog.justSavedPrompt')}</span>
          <SafeLink className="pillBtn" href={playHref(justSaved)}>
            {t('prog.btnPlayNow')}
          </SafeLink>
          <button type="button" className={styles.linkBtn} onClick={() => setJustSaved(null)} aria-label={t('prog.dismissAlertAria')}>
            {t('prog.btnClose')}
          </button>
        </div>
      )}

      <div className={styles.layout}>
        <section className={styles.listCol} aria-label={t('prog.listSectionAria')}>
          {jobs.length > 0 && (
            <ul className={styles.jobs} id="progJobs" aria-label={t('prog.jobsListAria')}>
              {openJobs.map((j) => (
                <li key={j.id} data-job={j.id} data-status={j.status} className={isActive(j) ? styles.jobActive : styles.jobFail}>
                  {jobLine(j)}
                </li>
              ))}
              {doneSum.jobCount > 0 && (
                <li key="done" data-status="done" data-done-count={doneSum.jobCount}>
                  {doneLine()}
                </li>
              )}
            </ul>
          )}
          {!loggedIn && (
            <p className={styles.seedNote} id="progSeedNote">
              {t('prog.seedNotice')}
            </p>
          )}
          {loadMsg && (
            <p className="empty" id="progLoadMsg">
              {loadMsg}
            </p>
          )}
          {inScope.length > 0 && (
            <div className={styles.listTools} id="progTools">
              <input
                type="search"
                id="progSearch"
                className={styles.search}
                placeholder={t('prog.searchPlaceholder')}
                aria-label={t('prog.searchAria')}
                value={query}
                maxLength={100}
                onChange={(e) => setQuery(e.target.value)}
              />
              <label className={styles.sortLabel}>
                {t('prog.sortLabel')}
                <select id="progSort" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                  {(Object.keys(SORT_LABEL) as SortBy[]).map((k) => (
                    <option key={k} value={k}>
                      {SORT_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
              {(query || tasteFilter) && (
                <span className={styles.count} id="progSearchCount">
                  {t('prog.filterCount', { total: inScope.length, shown: shown.length })}
                </span>
              )}
            </div>
          )}
          {tasteFilter && inScope.length > 0 && (
            <div className={pStyles.tasteFilter} id="progTasteFilter" role="status">
              <span>
                <b>{tasteFilter}</b>{tasteFilter.includes('→') ? t('prog.tasteActiveMove') : t('prog.tasteActiveGroup')}{t('prog.tasteFilterNotice')}
              </span>
              <button type="button" className="ghostBtn" id="progTasteFilterClear" onClick={() => setTasteFilter('')}>
                {t('prog.btnResetFilter')}
              </button>
            </div>
          )}
          {!loadMsg && inScope.length > 0 && shown.length === 0 && (
            <p className="empty" id="progNoMatch">
              {query ? t('prog.noMatchWithQuery', { query }) : t('prog.noMatch')}
            </p>
          )}
          {!loadMsg && inScope.length === 0 && (
            <div className={styles.empty} id="progEmpty">
              {scope === 'analysis' ? (
                <p>
                  {t('prog.emptyAnalysis')}
                </p>
              ) : (
                <p>{t('prog.emptyManual')}</p>
              )}
              {loggedIn && (
                <button type="button" className="ghostBtn" onClick={() => openAdd(scope === 'analysis' ? 'video' : 'manual')}>
                  {scope === 'analysis' ? t('prog.btnEmptyAnalysisAction') : t('prog.btnEmptyManualAction')}
                </button>
              )}
            </div>
          )}
          <ul className={styles.list} id="progList">
            {shown.map((p) => (
              <ProgressionRow
                key={p.id}
                p={p}
                seed={!loggedIn}
                initiallyOpen={p.id === focusId}
                onUpdate={loggedIn ? handleUpdate : undefined}
                onRemove={loggedIn ? handleRemove : undefined}
              />
            ))}
          </ul>
        </section>

        <aside className={styles.tasteCol} aria-label={t('prog.tasteSectionAria')} id="progTaste">
          <h2>{t('prog.tasteSectionTitle')}</h2>
          <TastePanel list={inScope} scopeLabel={t(SCOPES.find(([s]) => s === scope)?.[1] || 'prog.scopeReference')} filter={tasteFilter} onFilter={pickTaste} />
        </aside>
      </div>

    </AppShell>
  );
}

export default ProgressionsPage;
