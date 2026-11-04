// frontend/src/pages/HomePage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { SafeLink } from '../components/common/SafeLink';
import { GeminiKeyOnboardingModal } from '../components/common/GeminiKeyOnboardingModal';
import { useAuth } from '../lib/auth';
import { apiClient, LocalSongRecord, NoteDetailDto, NoteSummaryDto, SongDto } from '../lib/apiClient';
import { raw, safeUrl, thumb, videoIdFrom } from '../lib/security';
import {
  buildPracticeResumeHref,
  CHORD_MODES,
  computeWeeklyStreak,
  DEFAULT_ARCHIVE_PROGRESSIONS,
  DEFAULT_REFERENCE_PROGRESSIONS,
  extractProgressionsFromNotes,
  formatRecentSongSegment,
  getLastChordTab,
  getLocalTodayStr,
  pickNextIndex,
  ProgressionItem,
} from '../lib/progressions';
import styles from './HomePage.module.css';

export function HomePage(): React.ReactElement {
  const authState = useAuth();
  const activeUid = authState.user?.id ?? null;

  // 1. 유튜브 링크 빠른 시작 상태
  const [goUrl, setGoUrl] = useState('');
  const goUrlRef = useRef<HTMLInputElement | null>(null);

  // csp_check.js처럼 el.value 대입 후 native input 이벤트만 보내는 경우에도 상태를 맞춘다
  useEffect(() => {
    const el = goUrlRef.current;
    if (!el) return;
    const handleNativeInput = (e: Event) => {
      const target = e.target as HTMLInputElement | null;
      if (target && typeof target.value === 'string') {
        setGoUrl(target.value);
      }
    };
    el.addEventListener('input', handleNativeInput);
    return () => el.removeEventListener('input', handleNativeInput);
  }, []);
  const [geminiModalOpen, setGeminiModalOpen] = useState(false);
  const pickedVideoId = videoIdFrom(goUrl);
  const hasInvalidUrl = Boolean(goUrl.trim() && !pickedVideoId);

  const checkHasGeminiKey = (): boolean => {
    if (!apiClient.isLoggedIn()) return false;
    const cached = apiClient.getCachedKeys();
    if (cached && cached.gemini) return true;
    const me = authState.me;
    if (me && me.keys && me.keys.gemini) return true;
    return false;
  };

  // 2. 코드 연습실 마지막 탭
  const [lastTab] = useState<string>(() => getLastChordTab());

  // 3. 연습 곡, 주간 스트릭, 최근 노트, 코드 진행 상태
  const [songs, setSongs] = useState<SongDto[]>([]);
  const [songsLoading, setSongsLoading] = useState<boolean>(false);
  const [songsError, setSongsError] = useState<string>('');
  const [activeDates, setActiveDates] = useState<string[]>([]);
  const [localSongs, setLocalSongs] = useState<LocalSongRecord[]>(() => apiClient.listLocalSongs());
  const [recentNote, setRecentNote] = useState<NoteSummaryDto | null>(null);
  const [refList, setRefList] = useState<ProgressionItem[]>(() => [...DEFAULT_REFERENCE_PROGRESSIONS]);
  const [archList, setArchList] = useState<ProgressionItem[]>(() => [...DEFAULT_ARCHIVE_PROGRESSIONS]);
  const [refIdx, setRefIdx] = useState<number>(0);
  const [archIdx, setArchIdx] = useState<number>(0);

  const reqSeqRef = useRef(0);

  useEffect(() => {
    const mySeq = ++reqSeqRef.current;
    const myUid = activeUid;

    if (!myUid || !apiClient.isLoggedIn()) {
      const locals = apiClient.listLocalSongs();
      setLocalSongs(locals);
      setSongs([]);
      setSongsLoading(false);
      setSongsError('');
      setActiveDates(locals.map((it) => it.date || '').filter(Boolean));
      setRecentNote(null);
      const extracted = extractProgressionsFromNotes([]);
      setRefList(extracted.reference);
      setArchList(extracted.archive);
      setRefIdx(0);
      setArchIdx(0);
      return;
    }

    setSongsLoading(true);
    setSongsError('');

    // 곡 목록 조회
    apiClient.songs
      .list()
      .then((list) => {
        if (reqSeqRef.current !== mySeq || activeUid !== myUid) return;
        setSongs(Array.isArray(list) ? list : []);
        setSongsLoading(false);
      })
      .catch((err: any) => {
        if (reqSeqRef.current !== mySeq || activeUid !== myUid) return;
        setSongs([]);
        setSongsLoading(false);
        setSongsError((err && err.message) || '곡 목록을 불러오지 못했어요');
      });

    // 세션 달력 조회 (주간 스트릭용)
    apiClient.sessions
      .list({ today: getLocalTodayStr() })
      .then((res) => {
        if (reqSeqRef.current !== mySeq || activeUid !== myUid) return;
        const calDates = (res?.calendar || [])
          .filter((d) => d && d.totalSeconds > 0)
          .map((d) => d.date);
        const sessDates = (res?.sessions || [])
          .filter((s) => s && s.seconds > 0)
          .map((s) => s.date);
        setActiveDates([...calDates, ...sessDates]);
      })
      .catch(() => {
        if (reqSeqRef.current !== mySeq || activeUid !== myUid) return;
        setActiveDates([]);
      });

    // 최근 학습 노트 조회 및 상세 병렬 조회로 코드 진행 추출 (PR #38 리뷰 반영)
    apiClient.notes
      .list()
      .then(async (notes) => {
        if (reqSeqRef.current !== mySeq || activeUid !== myUid) return;
        const safeNotes = Array.isArray(notes) ? notes : [];
        setRecentNote(safeNotes[0] || null);

        // 상위 최대 3개 노트 상세를 병렬 조회하여 analysis(화성 진행) 확보
        const topNotes = safeNotes.slice(0, 3);
        const detailNotes: NoteDetailDto[] = [];
        await Promise.all(
          topNotes.map(async (n) => {
            try {
              const detail = await apiClient.notes.get(n.id);
              if (detail) detailNotes.push(detail);
            } catch {
              /* 개별 노트 상세 조회 실패 격리 */
            }
          })
        );

        if (reqSeqRef.current !== mySeq || activeUid !== myUid) return;
        const extracted = extractProgressionsFromNotes(detailNotes.length > 0 ? detailNotes : safeNotes);
        setRefList(extracted.reference);
        setArchList(extracted.archive);
        setRefIdx(0);
        setArchIdx(0);
      })
      .catch(() => {
        if (reqSeqRef.current !== mySeq || activeUid !== myUid) return;
        setRecentNote(null);
      });
  }, [activeUid]);

  // 주간 스트릭 계산 (로그인 시 세션 날짜 + 곡 lastDate 병합, 비로그인 시 로컬 날짜)
  const mergedDates = activeUid
    ? [...activeDates, ...songs.map((s) => s.lastDate || '').filter(Boolean)]
    : activeDates;
  const streak = computeWeeklyStreak(mergedDates);

  // 최근 연습 곡 결정
  const recentSong: {
    videoId: string;
    title: string;
    a: number | null;
    b: number | null;
    pos: number | null;
    rate: number | null;
  } | null = activeUid
    ? songs[0]
      ? {
          videoId: songs[0].videoId,
          title: songs[0].title,
          a: songs[0].a,
          b: songs[0].b,
          pos: songs[0].pos,
          rate: songs[0].rate,
        }
      : null
    : localSongs[0]
      ? {
          videoId: localSongs[0].videoId,
          title: `최근 기기 연습 영상 (${localSongs[0].videoId})`,
          a: localSongs[0].a,
          b: localSongs[0].b,
          pos: localSongs[0].pos,
          rate: localSongs[0].rate,
        }
      : null;

  // 노션 바로가기 링크
  const nlPracticeUrl = safeUrl(raw.get('ulp:notion-practice'));
  const nlNotesUrl = safeUrl(raw.get('ulp:notion-notes'));
  const mainNotionUrl = nlPracticeUrl || nlNotesUrl;

  const currentRef = refList[refIdx] || DEFAULT_REFERENCE_PROGRESSIONS[0];
  const currentArch = archList[archIdx] || DEFAULT_ARCHIVE_PROGRESSIONS[0];

  const handleGoSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pickedVideoId) {
      window.location.href = 'practice.html?v=' + encodeURIComponent(pickedVideoId);
    }
  };

  return (
    <AppShell variant="default" activeNav="home">
      <div className={styles.hero}>
        <h1 className={`wordmark ${styles.wordmark}`}>ULeveLP</h1>
        <hr className={`home-rule ${styles.homeRule}`} />
        <p className={`tagline ${styles.tagline}`}>DIVE INTO SOUND</p>

        <form className={`go ${styles.goForm}`} id="go" onSubmit={handleGoSubmit}>
          <input
            className="inpField"
            id="goUrl"
            ref={goUrlRef}
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="유튜브 링크를 붙여넣으세요"
            aria-label="유튜브 링크"
            value={goUrl}
            onChange={(e) => setGoUrl(e.target.value)}
          />
          <div className={`go-pick ${styles.goPick}`} id="goPick" hidden={!pickedVideoId}>
            <img
              id="goThumb"
              className={styles.goThumb}
              src={pickedVideoId ? thumb(pickedVideoId) : undefined}
              alt=""
            />
            <div className={`acts ${styles.goActs}`}>
              <SafeLink
                className="pillBtn"
                id="goPlay"
                href={pickedVideoId ? 'practice.html?v=' + encodeURIComponent(pickedVideoId) : 'practice.html'}
              >
                ▶ 바로 연습
              </SafeLink>
              <SafeLink
                className="ghostBtn"
                id="goNote"
                onClick={(e) => {
                  if (apiClient.isLoggedIn() && !checkHasGeminiKey()) {
                    e.preventDefault();
                    setGeminiModalOpen(true);
                  }
                }}
                href={
                  pickedVideoId
                    ? 'notes.html?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + pickedVideoId)
                    : 'notes.html'
                }
              >
                노트 만들기
              </SafeLink>
            </div>
          </div>
          <p className={`msg${hasInvalidUrl ? ' err' : ''}`} id="goMsg" role="status">
            {hasInvalidUrl ? '유튜브 영상 링크가 아니에요' : ''}
          </p>
        </form>
      </div>

      {/* 상단 연속성 위젯: 주간 스트릭(Mo~Su)·작심삼일 + 가장 최근 연습했던 곡 */}
      <section className={styles.topWidgets} aria-label="연습 연속성 대시보드">
        <div className={styles.widgetCard} id="weeklyStreakCard">
          <div className={styles.widgetHead}>
            <h2 className={styles.widgetTitle}>WEEKLY STREAK</h2>
            <SafeLink href="log.html" className={styles.widgetLink}>
              기록 보기 →
            </SafeLink>
          </div>
          <div className={styles.streakGrid} id="streakDays">
            {streak.days.map((d) => (
              <div
                key={d.dateStr}
                className={`${styles.streakCell} ${d.practiced ? styles.streakCellDone : ''} ${
                  d.isToday ? styles.streakCellToday : ''
                }`}
                data-date={d.dateStr}
                data-practiced={d.practiced ? '1' : '0'}
              >
                <span className={styles.dowText}>{d.dowLabel}</span>
                <span className={styles.dayNum}>{d.dayNumber}</span>
              </div>
            ))}
          </div>
          <SafeLink href="log.html" className={styles.streakBar} id="streakChallengeBar">
            <span id="streakChallengeText">{streak.challengeText}</span>
            <span className={styles.streakDots} aria-hidden="true">
              {[1, 2, 3].map((step) => (
                <i
                  key={step}
                  className={`${styles.streakDot} ${streak.cycleStep >= step ? styles.streakDotOn : ''}`}
                />
              ))}
            </span>
          </SafeLink>
        </div>

        <div className={styles.widgetCard} id="recentSongCard">
          <div className={styles.widgetHead}>
            <h2 className={styles.widgetTitle}>가장 최근 연습했던 곡</h2>
            {recentSong && (
              <SafeLink
                href={buildPracticeResumeHref(recentSong)}
                className={styles.widgetLink}
                id="recentSongGo"
              >
                (바로가기)
              </SafeLink>
            )}
          </div>
          {recentSong ? (
            <div className={styles.recentBody} id="recentSongBody">
              <img
                id="recentSongThumb"
                className={styles.recentThumb}
                src={thumb(recentSong.videoId)}
                alt=""
              />
              <div className={styles.recentInfo}>
                <p className={styles.recentSongTitle} id="recentSongTitle">
                  {recentSong.title}
                </p>
                <p className={styles.recentSegment} id="recentSongSegment">
                  {formatRecentSongSegment(recentSong)}
                </p>
                <SafeLink
                  href={buildPracticeResumeHref(recentSong)}
                  className={styles.widgetLink}
                >
                  ▶ 이어서 구간 연습하기 →
                </SafeLink>
              </div>
            </div>
          ) : (
            <div className={styles.recentBody} id="recentSongEmpty">
              <div className={styles.recentPlaceholder}>NO SONG</div>
              <div className={styles.recentInfo}>
                <p className={styles.emptyText}>
                  아직 연습 중인 곡이 없어요. 위 입력창에 유튜브 링크를 붙여넣어 시작하세요.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 하단 메인 분할 대시보드: 좌측 BETTER (연습실) | 우측 VAULT (학습) */}
      <div className={`frames ${styles.splitFrames}`}>
        <section className={`frame ${styles.frame}`} id="betterFrame" aria-labelledby="fBetter">
          <div className={`frame-head ${styles.frameHead}`}>
            <h2 id="fBetter">BETTER</h2>
            <span>연습실</span>
          </div>

          <div className={styles.betterCols}>
            <div className={styles.subCol}>
              <div className={styles.subColHead}>
                <h3 className={styles.subColTitle}>CHORDS · 7가지 연습 모드</h3>
              </div>
              <ul className={`frame-list ${styles.frameList}`} id="modes">
                {CHORD_MODES.map(([id, name], idx) => {
                  const isCur = id === lastTab;
                  return (
                    <li key={id} className={isCur ? `cur ${styles.curItem}` : undefined}>
                      <SafeLink href={`chords.html#${encodeURIComponent(id)}`}>
                        <span className={`t ${styles.itemTitle}`}>
                          {idx + 1} · {name}
                        </span>
                        <span className={`m ${styles.itemMeta}`}>{isCur ? '이어서' : ''}</span>
                      </SafeLink>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className={styles.subCol}>
              <div className={styles.subColHead}>
                <h3 className={styles.subColTitle}>PLAYER · 내 연습 곡</h3>
                <SafeLink href="settings.html#keys" className={styles.widgetLink}>
                  노션 연결 →
                </SafeLink>
              </div>
              <ul
                className={`frame-list ${styles.frameList}${activeUid && songs.length > 0 ? '' : ` ${styles.songsEmpty}`}`}
                id="songs"
              >
                {!activeUid ? (
                  <li className={`note ${styles.noteItem}`}>
                    로그인하면 내 연습 곡이 여기 보여요.
                    <SafeLink href="settings.html#account">로그인하러 가기 →</SafeLink>
                  </li>
                ) : songsLoading ? (
                  <li className={`note ${styles.noteItem}`}>불러오는 중…</li>
                ) : songsError ? (
                  <li className={`note ${styles.noteItem}`}>{songsError}</li>
                ) : songs.length === 0 ? (
                  <li className={`note ${styles.noteItem}`}>
                    아직 곡이 없어요. 위에 유튜브 링크를 붙여넣어 시작하세요.
                  </li>
                ) : (
                  songs.slice(0, 5).map((s) => {
                    const meta = [
                      s.status,
                      s.rate ? `${s.rate}×` : '',
                      s.lastDate ? s.lastDate.slice(5).replace('-', '/') : '',
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <li key={s.id}>
                        <SafeLink href={`practice.html?v=${encodeURIComponent(s.videoId)}`}>
                          <span className={`t ${styles.itemTitle}`}>{s.title}</span>
                          <span className={`m ${styles.itemMeta}`}>{meta}</span>
                        </SafeLink>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </div>

          <div className={styles.betterActions}>
            <SafeLink className="ghostBtn" href="chords.html">
              코드 연습실 열기
            </SafeLink>
            <SafeLink className="ghostBtn" href="practice.html">
              플레이어 열기
            </SafeLink>
          </div>
        </section>

        <section className={`frame ${styles.frame}`} id="vaultFrame" aria-labelledby="fVault">
          <div className={`frame-head ${styles.frameHead}`}>
            <h2 id="fVault">VAULT</h2>
            <span>학습</span>
          </div>

          <div className={styles.vaultSection} id="recentNoteCard">
            <div className={styles.subColHead}>
              <h3 className={styles.subColTitle}>최근 공부한 내용</h3>
              <SafeLink href="notes.html" className={styles.widgetLink}>
                전체 노트 →
              </SafeLink>
            </div>
            {recentNote ? (
              <div className={styles.noteBox} id="recentNoteBody">
                <img
                  className={styles.noteThumb}
                  src={thumb(recentNote.videoId)}
                  alt=""
                />
                <div className={styles.noteBoxBody}>
                  <p className={styles.noteBoxTitle} id="recentNoteTitle">
                    {recentNote.title || '(제목 없음)'}
                  </p>
                  <p className={styles.noteBoxSummary} id="recentNoteHeadline">
                    {recentNote.headline || recentNote.channel || '핵심 요약 노트'}
                  </p>
                  <div className={styles.noteBoxFoot}>
                    <SafeLink
                      href={`note.html?id=${encodeURIComponent(recentNote.id)}`}
                      className={styles.widgetLink}
                      id="recentNoteLink"
                    >
                      확인하기 →
                    </SafeLink>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.noteBox} id="recentNoteEmpty">
                <div className={styles.recentPlaceholder}>NO NOTE</div>
                <div className={styles.noteBoxBody}>
                  <p className={styles.noteBoxSummary}>아직 생성한 학습 노트가 없어요.</p>
                  <div className={styles.noteBoxFoot}>
                    <SafeLink href="notes.html" className={styles.widgetLink}>
                      노트 만들러 가기 →
                    </SafeLink>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={styles.vaultSection} id="progressionPickerSection">
            <div className={styles.subColHead}>
              <h3 className={styles.subColTitle}>취향 코드 진행 꺼내보기</h3>
              <SafeLink href="chords.html#reint" className={styles.widgetLink}>
                보이싱 탐색 →
              </SafeLink>
            </div>
            <div className={styles.progGrid}>
              <div className={styles.progCard} id="progRefBox">
                <div className={styles.progHead}>
                  <span className={styles.progBadge}>REFERENCE</span>
                  <span className={styles.progKey} id="progRefKey">
                    {currentRef.keyLabel}
                  </span>
                </div>
                <SafeLink
                  href={currentRef.href}
                  className={styles.progChordsLink}
                  id="progRefChords"
                >
                  {currentRef.chordsText}
                </SafeLink>
                <p className={styles.progSub} id="progRefTitle">
                  {currentRef.title}
                  <span className={styles.progSource}>출처: {currentRef.sourceType}</span>
                </p>
                <button
                  type="button"
                  className={styles.randBtn}
                  id="btnRandRef"
                  onClick={() => setRefIdx((cur) => pickNextIndex(cur, refList.length))}
                >
                  # 랜덤으로 보여주기
                </button>
              </div>

              <div className={styles.progCard} id="progArchBox">
                <div className={styles.progHead}>
                  <span className={styles.progBadge}>ARCHIVE</span>
                  <span className={styles.progKey} id="progArchKey">
                    {currentArch.keyLabel}
                  </span>
                </div>
                <SafeLink
                  href={currentArch.href}
                  className={styles.progChordsLink}
                  id="progArchChords"
                >
                  {currentArch.chordsText}
                </SafeLink>
                <p className={styles.progSub} id="progArchTitle">
                  {currentArch.title}
                  <span className={styles.progSource}>출처: {currentArch.sourceType}</span>
                </p>
                <button
                  type="button"
                  className={styles.randBtn}
                  id="btnRandArch"
                  onClick={() => setArchIdx((cur) => pickNextIndex(cur, archList.length))}
                >
                  # 랜덤으로 보여주기
                </button>
              </div>
            </div>
          </div>

          <div className={styles.betterActions}>
            <SafeLink className="ghostBtn" href="notes.html">
              학습 노트 열기
            </SafeLink>
          </div>
        </section>
      </div>

      <SafeLink
        className={`notion-big ${styles.notionBig}`}
        id="notionBig"
        href={mainNotionUrl || 'settings.html#links'}
        external={Boolean(mainNotionUrl)}
      >
        NOTION
      </SafeLink>
      <div
        className={`notion-links ${styles.notionLinks}`}
        id="notionLinks"
        hidden={!nlPracticeUrl && !nlNotesUrl}
      >
        <SafeLink id="nlPractice" href={nlPracticeUrl || 'settings.html#links'} external={Boolean(nlPracticeUrl)} hidden={!nlPracticeUrl}>
          악기 연습 ↗
        </SafeLink>
        <SafeLink id="nlNotes" href={nlNotesUrl || 'settings.html#links'} external={Boolean(nlNotesUrl)} hidden={!nlNotesUrl}>
          학습 영상 노트 ↗
        </SafeLink>
      </div>

      <footer className={`home-foot ${styles.homeFoot}`}>
        <span>DAILY DIARY</span>
        <SafeLink href="privacy.html">PRIVACY</SafeLink>
        <span id="copy">©{new Date().getFullYear()}</span>
      </footer>

      <GeminiKeyOnboardingModal
        open={geminiModalOpen}
        onClose={() => setGeminiModalOpen(false)}
        onSaved={() => {
          setGeminiModalOpen(false);
          const target = pickedVideoId
            ? 'notes.html?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + pickedVideoId)
            : 'notes.html';
          window.location.href = target;
        }}
      />
    </AppShell>
  );
}

export default HomePage;

