// frontend/src/pages/NoteDetailPage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { SafeLink } from '../components/common/SafeLink';
import { SanitizedSvg } from '../components/common/SanitizedSvg';
import { auth, useAuth } from '../lib/auth';
import { apiClient, NoteDetailDto } from '../lib/apiClient';
import { safeUrl } from '../lib/security';
import { NOTE_FORM_TAGS, noteTagLabel } from './NotesPage';
import { t } from '../lib/i18n.mts';
import { buildNoteMarkdown, notePracticeHref } from '../lib/noteMarkdown.mts';
import styles from './NoteDetailPage.module.css';

export function parseTimestampSec(ts: unknown): number | null {
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

function TimestampCell({ ts, videoId }: { ts?: string; videoId?: string }): React.ReactElement {
  const sec = parseTimestampSec(ts);
  if (sec !== null && videoId) {
    return (
      <td>
        <SafeLink href={notePracticeHref(videoId, sec)}>
          {ts}
        </SafeLink>
      </td>
    );
  }
  return <td>{ts || ''}</td>;
}

export function NoteDetailPage(): React.ReactElement {
  useEffect(() => {
    document.title = '학습 노트 상세 · RE:DO'; // i18n-keep: RZ3-4 소스 문자열 단언
  }, []);

  const authState = useAuth();
  const activeUid = authState.user?.id ?? null;

  const [note, setNote] = useState<NoteDetailDto | null>(null);
  const [loadingMsg, setLoadingMsg] = useState<string>(t('note.loading'));
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editMemo, setEditMemo] = useState<string>('');
  const [editMsg, setEditMsg] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '', kind: '' });

  const detailReqSeqRef = useRef(0);

  // M2-1d: 마크다운 복사 상태
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyMsg, setCopyMsg] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '', kind: '' });
  const copySeqRef = useRef(0);
  const copyTimerRef = useRef<number | null>(null);
  const noteIdRef = useRef<string | null>(null);

  const clearCopyTimer = () => {
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearCopyTimer();
  }, []);

  const copyMarkdown = async () => {
    if (!note || copyBusy) return;
    const mySeq = ++copySeqRef.current; // 이 클릭의 번호
    const myUid = activeUid;
    const myNoteId = note.id;
    const text = buildNoteMarkdown(note, window.location.origin); // await 전에 스냅샷
    clearCopyTimer();
    setCopyBusy(true);
    let ok = false;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = false; // 문구로 알린다
    } finally {
      // 늦은 결과: 다른 클릭·노트 재로딩·계정 전환이 끼었으면 아무것도 세우지 않는다
      const stale =
        copySeqRef.current !== mySeq ||
        auth.getUser()?.id !== myUid ||
        noteIdRef.current !== myNoteId; // noteIdRef = setNote 때 같이 갱신
      if (!stale) {
        setCopyBusy(false);
        setCopyMsg(ok ? { text: t('note.copyMdDone'), kind: 'ok' } : { text: t('note.copyMdFail'), kind: 'err' });
        if (ok) copyTimerRef.current = window.setTimeout(() => setCopyMsg({ text: '', kind: '' }), 2500);
      }
    }
  };

  // CH-5: "코드 진행 수집에 넣기" 토글 (PUT /notes/{id}/collect). count = 이 노트에서 온 진행 수(null = 모름)
  const [collectOn, setCollectOn] = useState(false);
  const [collectCount, setCollectCount] = useState<number | null>(null);
  const [collectBusy, setCollectBusy] = useState(false);
  const [collectMsg, setCollectMsg] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '', kind: '' });

  const loadCollectCount = async (noteId: string, uid: string | null) => {
    try {
      const list = await apiClient.progressions.list('analysis');
      if (auth.getUser()?.id !== uid) return;
      setCollectCount(list.filter((p) => p.noteId === noteId).length);
    } catch {
      setCollectCount(null);
    }
  };

  const toggleCollect = async (next: boolean) => {
    if (!note || collectBusy) return;
    const myUid = activeUid;
    if (!next) {
      let edited = 0;
      let total = collectCount ?? 0;
      try {
        const list = (await apiClient.progressions.list('analysis')).filter((p) => p.noteId === note.id);
        total = list.length;
        edited = list.filter((p) => p.origin === 'manual').length;
      } catch {
        /* 개수를 몰라도 확인은 묻는다 */
      }
      const extra = edited > 0 ? t('note.confirmUncollectExtra', { count: edited }) : '';
      if (total > 0 && !window.confirm(t('note.confirmUncollect', { total, extra }))) return;
    }
    setCollectBusy(true);
    setCollectMsg({ text: t(next ? 'note.collecting' : 'note.uncollecting'), kind: '' });
    try {
      const r = await apiClient.notes.setCollect(note.id, next);
      if (auth.getUser()?.id !== myUid) return;
      setCollectOn(r.collect);
      setCollectCount(r.progressions.length);
      setCollectMsg(
        r.collect
          ? r.progressions.length > 0
            ? { text: t('note.collectedCount', { count: r.progressions.length }), kind: 'ok' }
            : { text: t('note.noHarmony'), kind: '' }
          : { text: t('note.uncollected'), kind: 'ok' }
      );
    } catch (err: any) {
      if (auth.getUser()?.id !== myUid) return;
      setCollectMsg({ text: (err && err.message) || t('note.failedChange'), kind: 'err' });
    } finally {
      setCollectBusy(false);
    }
  };

  const clearState = (msg: string) => {
    ++copySeqRef.current;
    clearCopyTimer();
    setCopyBusy(false);
    setCopyMsg({ text: '', kind: '' });
    noteIdRef.current = null;
    setNote(null);
    setCollectOn(false);
    setCollectCount(null);
    setCollectMsg({ text: '', kind: '' });
    setEditTags([]);
    setEditMemo('');
    setEditMsg({ text: '', kind: '' });
    setLoadingMsg(msg);
  };

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const noteId = q.get('id');
    const mySeq = ++detailReqSeqRef.current;
    const myUid = activeUid;

    if (!noteId) {
      clearState(t('note.errNoId'));
      return;
    }

    if (!myUid || !apiClient.isLoggedIn()) {
      clearState(t('note.errLoginRequired'));
      return;
    }

    clearState(t('note.loading'));

    apiClient.notes
      .get(noteId)
      .then((res) => {
        if (detailReqSeqRef.current !== mySeq || auth.getUser()?.id !== myUid) return;
        if (!res) {
          clearState(t('note.errNotFound'));
          return;
        }
        noteIdRef.current = res.id;
        setNote(res);
        setCollectOn(Boolean(res.collectProgressions));
        if (res.collectProgressions) void loadCollectCount(res.id, myUid);
        setEditTags(Array.isArray(res.tags) ? res.tags : []);
        setEditMemo(res.memo || '');
        setLoadingMsg('');
      })
      .catch((err: any) => {
        if (detailReqSeqRef.current !== mySeq || auth.getUser()?.id !== myUid) return;
        clearState((err && err.message) || t('note.errLoadFailed'));
      });
  }, [activeUid]);

  const metaParts: string[] = [];
  if (note?.channel) metaParts.push(note.channel);
  if (note?.model) metaParts.push(note.model);
  if (note?.createdAt) metaParts.push(new Date(note.createdAt).toLocaleDateString('ko-KR'));

  const analysis = note?.analysis || {};
  const tags = Array.isArray(note?.tags) ? note!.tags : [];
  const diagramsSvg = Array.isArray(note?.diagramsSvg) ? note!.diagramsSvg : [];
  const moments = Array.isArray(analysis.moments) ? analysis.moments : [];
  const practiceItems = Array.isArray(analysis.practice) ? analysis.practice : [];

  return (
    <AppShell variant="narrow" activeNav="notes">
      <p className={`back-link ${styles.backLink}`}>
        <SafeLink href="notes.html">{t('note.backToList')}</SafeLink>
      </p>

      <div id="noteContent" hidden={!note}>
        <div className={`card ${styles.card}`} id="noteHeader">
          <h1 className={`page-title ${styles.pageTitle}`} id="noteTitle">
            {note ? note.title || note.url || t('note.noTitle') : ''}
          </h1>
          <div className={`note-meta ${styles.noteMeta}`} id="noteMeta">
            {metaParts.join(' · ')}
          </div>
          <div className={`note-badges ${styles.noteBadges}`}>
            <span className={`badge ${styles.badge}`} id="noteDifficulty" hidden={!note?.difficulty}>
              {note?.difficulty || ''}
            </span>
            <span id="noteTags">
              {tags.map((tag) => (
                <span key={tag} className={`badge ${styles.badge}`}>
                  {noteTagLabel(tag)}
                </span>
              ))}
            </span>
          </div>
          <div
            id="noteActionBar"
            className={`row ${styles.noteActionBar}`}
            role="group"
            aria-label={t('note.actionsAria')}
          >
            <SafeLink
              id="notePracticeLink"
              className="pillBtn"
              href={note?.videoId ? notePracticeHref(note.videoId) : 'practice.html'}
              hidden={!note?.videoId}
              data-align-group="noteActions:center-y@481"
            >
              {t('note.openPlayer')}
            </SafeLink>
            <button
              id="btnCopyMarkdown"
              className="ghostBtn"
              type="button"
              disabled={copyBusy}
              onClick={() => void copyMarkdown()}
              data-align-group="noteActions:center-y@481"
            >
              {t('note.copyMd')}
            </button>
            <label
              className={styles.collectPill}
              data-on={collectOn ? 'true' : 'false'}
              title={t('note.titleCollect')}
              data-align-group="noteActions:center-y@481"
            >
              <input
                type="checkbox"
                id="noteCollectToggle"
                checked={collectOn}
                disabled={collectBusy}
                onChange={(e) => void toggleCollect(e.target.checked)}
              />
              <span>{t('note.labCollect')}</span>
            </label>
          </div>

          <div id="noteActionStatus" className={styles.actionStatus}>
            {collectOn && (
              <SafeLink id="noteCollectLink" href="progressions.html?scope=analysis">
                {collectCount !== null
                  ? t('note.viewInChordsWithCount', { count: collectCount })
                  : t('note.viewInChords')}
              </SafeLink>
            )}
            <p className={`msg${collectMsg.kind ? ' ' + collectMsg.kind : ''}`} id="noteCollectMsg" role="status">
              {collectMsg.text}
            </p>
            <p className={`msg${copyMsg.kind ? ' ' + copyMsg.kind : ''}`} id="noteCopyMsg" role="status">
              {copyMsg.text}
            </p>
          </div>

          <div id="noteSubActions" className={styles.subActions}>
            <SafeLink
              id="noteYoutubeLink"
              className="ghostBtn"
              href={note?.url ? safeUrl(note.url) : ''}
              external
              hidden={!note?.url}
            >
              {t('note.btnYoutubeOriginal')}
            </SafeLink>
            <button
              id="btnDeleteNote"
              className="ghostBtn"
              type="button"
              onClick={async () => {
                if (!note || !note.id) return;
                if (!window.confirm(t('note.confirmDelete'))) return;
                try {
                  await apiClient.notes.remove(note.id);
                  window.location.href = 'notes.html';
                } catch (err: any) {
                  window.alert((err && err.message) || t('note.errDeleteFailed'));
                }
              }}
            >
              {t('note.btnDelete')}
            </button>
          </div>
        </div>

        <div className={`card summary-box ${styles.summaryBox}`} id="noteSummaryBox">
          <h2>{t('note.secSummary')}</h2>
          <p className={`headline ${styles.headline}`} id="noteHeadline">
            {note?.headline || ''}
          </p>
          <ul className={`points ${styles.points}`} id="notePoints">
            {(note?.points || []).map((p, idx) => (
              <li key={idx}>{p}</li>
            ))}
          </ul>
          <div className={`keywords ${styles.keywords}`} id="noteKeywords">
            {(note?.keywords || []).map((k, idx) => (
              <span key={idx} className={`keyword-chip ${styles.keywordChip}`}>
                {k}
              </span>
            ))}
          </div>
        </div>

        <div id="noteSections">
          {tags.map((tag) => {
            if (tag === '화성' && analysis.harmony) { // i18n-keep: 태그 데이터 비교(D5-1)
              const progs = Array.isArray(analysis.harmony.progressions) ? analysis.harmony.progressions : [];
              const concepts = Array.isArray(analysis.harmony.concepts) ? analysis.harmony.concepts : [];
              return (
                <div key="harmony" className={`card note-section ${styles.card}`}>
                  <h2>{t('note.secHarmony')}</h2>
                  {progs.map((prog: any, pIdx: number) => {
                    const chords = Array.isArray(prog.chords) ? prog.chords : [];
                    const pTitle = [
                      prog.name || t('note.defaultProgName'),
                      prog.key ? `(${prog.key})` : '',
                      prog.instrument ? `· ${prog.instrument}` : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <div key={pIdx} className={`progression-box ${styles.subBox}`}>
                        <h3>{pTitle}</h3>
                        {chords.length > 0 && (
                          <>
                            <p className={`progression-arrows ${styles.arrows}`}>
                              {chords.map((c: any) => c.symbol || '').join(' → ')}
                            </p>
                            <div className={`scroll ${styles.tableWrap}`}>
                              <table>
                                <thead>
                                  <tr>
                                    <th>{t('note.thChord')}</th>
                                    <th>{t('note.thRoman')}</th>
                                    <th>{t('note.thFunction')}</th>
                                    <th>{t('note.thVoicing')}</th>
                                    <th>{t('note.thNuance')}</th>
                                    <th>{t('note.thBasis')}</th>
                                    <th>{t('note.thTime')}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {chords.map((c: any, cIdx: number) => {
                                    let voicingStr = '';
                                    if (Array.isArray(c.frets) && c.frets.length > 0) {
                                      voicingStr = c.frets.join(' ');
                                    } else if (c.split) {
                                      voicingStr = `LH ${(c.lh || []).join(' ')} · RH ${(c.rh || []).join(' ')}`;
                                    } else {
                                      voicingStr = (c.lh || []).concat(c.rh || []).join(' ');
                                    }
                                    if (c.voicingNote) voicingStr += ` (${c.voicingNote})`;
                                    return (
                                      <tr key={cIdx}>
                                        <td>{c.symbol ?? ''}</td>
                                        <td>{c.roman ?? ''}</td>
                                        <td>{c.function ?? ''}</td>
                                        <td>{voicingStr}</td>
                                        <td>{c.nuance ?? ''}</td>
                                        <td>{c.basis ?? ''}</td>
                                        <TimestampCell ts={c.timestamp} videoId={note?.videoId} />
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}
                        {diagramsSvg[pIdx] && (
                          <SanitizedSvg className={`scroll svg-box ${styles.svgBox}`} svgText={diagramsSvg[pIdx]} />
                        )}
                      </div>
                    );
                  })}
                  {concepts.length > 0 && (
                    <div className={`concepts-box ${styles.conceptsBox}`}>
                      <h4>{t('note.titleKeyConcepts')}</h4>
                      <ul>
                        {concepts.map((c: any, idx: number) => (
                          <li key={idx}>{typeof c === 'string' ? c : `${c.term}: ${c.description || ''}`}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            }
            return null;
          })}
        </div>

        <div className={`card ${styles.card}`} id="noteMomentsBox">
          <h2>{t('note.secKeySections')}</h2>
          <ul className={`moments-list ${styles.momentsList}`} id="noteMoments">
            {moments.length === 0 ? (
              <li className="empty">{t('note.emptyKeySections')}</li>
            ) : (
              moments.map((m: any, idx: number) => {
                const sec = parseTimestampSec(m.timestamp);
                return (
                  <li key={idx} className={`moment-item ${styles.momentItem}`}>
                    {sec !== null && note?.videoId ? (
                      <SafeLink
                        className={`badge ${styles.badge}`}
                        href={notePracticeHref(note.videoId, sec)}
                      >
                        {m.timestamp}
                      </SafeLink>
                    ) : (
                      <span className={`badge ${styles.badge}`}>{m.timestamp || ''}</span>
                    )}
                    <span className="moment-point"> {m.point || ''}</span>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className={`card ${styles.card}`} id="notePracticeBox">
          <h2>{t('note.secPracticeTasks')}</h2>
          <div className={`practice-list ${styles.practiceList}`} id="notePractice">
            {practiceItems.length === 0 ? (
              <p className="empty">{t('note.emptyPracticeTasks')}</p>
            ) : (
              practiceItems.map((pText: string, idx: number) => (
                <label key={idx} className={`check ${styles.checkLabel}`}>
                  <input type="checkbox" />
                  <span>{pText}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className={`card edit-panel ${styles.card}`} id="noteEditPanel">
          <h2>{t('note.secEdit')}</h2>
          <div>
            <span className="lab">{t('note.labTag')}</span>
            <div className={`tags ${styles.tagsGroup}`} id="editTags" role="group" aria-label={t('note.ariaEditTags')}>
              {NOTE_FORM_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={styles.tagBtn}
                  aria-pressed={editTags.includes(tag)}
                  onClick={() =>
                    setEditTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]))
                  }
                >
                  {noteTagLabel(tag)}
                </button>
              ))}
            </div>
          </div>
          <label>
            <span className="lab">{t('note.labMemo')}</span>
            <textarea
              className="inpField"
              id="noteMemoInput"
              placeholder={t('note.phMemo')}
              value={editMemo}
              onChange={(e) => setEditMemo(e.target.value)}
            />
          </label>
          <div>
            <button
              id="btnSaveNote"
              className="ghostBtn"
              type="button"
              onClick={async () => {
                if (!note || !note.id) return;
                const myUid = activeUid;
                setEditMsg({ text: t('note.saving'), kind: '' });
                try {
                  const ordered = NOTE_FORM_TAGS.filter((t) => editTags.includes(t));
                  const updated = await apiClient.notes.update(note.id, {
                    memo: editMemo.trim(),
                    tags: ordered,
                  });
                  if (auth.getUser()?.id !== myUid) return;
                  if (updated) setNote(updated);
                  setEditMsg({ text: t('note.saved'), kind: 'ok' });
                } catch (err: any) {
                  if (auth.getUser()?.id !== myUid) return;
                  setEditMsg({ text: (err && err.message) || t('note.saveFailed'), kind: 'err' });
                }
              }}
            >
              {t('note.btnSave')}
            </button>
          </div>
          <p className={`msg${editMsg.kind ? ' ' + editMsg.kind : ''}`} id="noteEditMsg" role="status">
            {editMsg.text}
          </p>
        </div>
      </div>

      <p className="empty" id="noteLoadingMsg" hidden={Boolean(note)}>
        {loadingMsg}
      </p>
    </AppShell>
  );
}

export default NoteDetailPage;
