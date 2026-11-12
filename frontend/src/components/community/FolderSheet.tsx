// frontend/src/components/community/FolderSheet.tsx
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apiClient, type PublicFolderDto, type PublicFolderItemDto } from '../../lib/apiClient';
import { auth, type MeProfile } from '../../lib/auth';
import {
  communityErrorKey,
  i18nPick,
  itemPracticeHref,
  segText,
} from '../../lib/community.mts';
import { getLang, t } from '../../lib/i18n.mts';
import { thumb } from '../../lib/security';
import { CoverArt, folderTitle } from './CommunityParts';
import { songAddErrorKey, songAddInput, useSheetFocus } from './QuickAddSheet';
import styles from './Community.module.css';

export interface FolderSheetProps {
  folderId: string | null;
  me: MeProfile | null;
  onClose: () => void;
  onPatchFolder?: (id: string, patch: Partial<PublicFolderDto>) => void;
}

export function FolderSheet(props: FolderSheetProps) {
  if (!props.folderId || !props.me?.id) return null;
  // 닫기·동일 폴더 재열기·계정 전환마다 상태와 중복 요청 잠금을 분리한다.
  return <FolderSheetSession key={JSON.stringify([props.me.id, props.folderId])} {...props} />;
}

function FolderSheetSession({ folderId, me, onClose, onPatchFolder }: FolderSheetProps) {
  const active = useRef(false);
  useLayoutEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  // auth 갱신과 React commit 사이에 완료된 응답도 이전 계정에 반영하지 않는다.
  const isCurrent = () => active.current && me?.id === auth.getMe()?.id;
  const sheetSeq = useRef(0);
  const busy = useRef(new Set<string>());

  const [detail, setDetail] = useState<{
    folder: PublicFolderDto;
    items: PublicFolderItemDto[];
  } | null>(null);
  const [follow, setFollow] = useState<{ on: boolean; count: number } | null>(null);
  const [err, setErr] = useState<{ key: string; vars?: Record<string, string> } | null>(null);
  const [msg, setMsg] = useState<{ key: string; vars?: Record<string, string> } | null>(null);
  const [okMsg, setOkMsg] = useState<string>('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<'spam' | 'inappropriate' | 'copyright' | 'other'>('spam');
  const [reportDetail, setReportDetail] = useState('');
  // CMR-3 D17·D18: 부분 선택(목록 index 기준), 행별 결과, 순차 추가 중 잠금
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [itemStatus, setItemStatus] = useState<Record<number, { ok: boolean; text: string }>>({});
  const [adding, setAdding] = useState(false);
  const [selAlert, setSelAlert] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // D22: 제목 focus·ESC 닫기·Tab 순환·닫힐 때 focus 복귀
  useSheetFocus(rootRef, titleRef, onClose, Boolean(detail));

  function patchFolder(id: string, patch: Partial<PublicFolderDto>) {
    if (!isCurrent()) return;
    setDetail((prev) =>
      prev && prev.folder.id === id ? { ...prev, folder: { ...prev.folder, ...patch } } : prev,
    );
    onPatchFolder?.(id, patch);
  }

  // S3 FolderSheet 열기 — 폴더 id가 바뀌면 늦은 응답 버림
  useEffect(() => {
    const my = ++sheetSeq.current; setDetail(null); setFollow(null);
    setErr(null); setMsg(null); setOkMsg(''); setReportOpen(false); setReportDetail('');
    setSelectMode(false); setSelected(new Set()); setItemStatus({}); setSelAlert('');
    if (!folderId) return;
    apiClient.community.folder(folderId).then((d) => {
      if (my !== sheetSeq.current || !isCurrent()) return; setDetail(d);
      const owner = d.folder.owner;
      if (owner && owner.id !== me?.id) apiClient.community.user(owner.id)
        .then((u) => { if (my === sheetSeq.current && isCurrent()) setFollow({ on: u.followingByMe, count: u.followerCount }); })
        .catch(() => { if (my === sheetSeq.current && isCurrent()) setFollow(null); });   // 팔로우 버튼만 숨김
    }).catch((e) => { if (my === sheetSeq.current && isCurrent()) setErr(communityErrorKey(e)); });
    return () => { ++sheetSeq.current; };
  }, [folderId, me?.id]);

  // S2 좋아요(팔로우 같음) — 낙관적 + 되돌림, 요청 중 재클릭 무시
  async function toggleLike(f: PublicFolderDto) {
    if (!isCurrent() || busy.current.has(f.id)) return; busy.current.add(f.id);
    const prev = { liked: f.likedByMe, count: f.likeCount };
    patchFolder(f.id, { likedByMe: !prev.liked, likeCount: prev.count + (prev.liked ? -1 : 1) });
    try { const r = await apiClient.community.setLike(f.id, !prev.liked);
          if (!isCurrent()) return;
          patchFolder(f.id, { likedByMe: r.liked, likeCount: r.likeCount }); }   // 서버 값이 최종
    catch (e) { if (!isCurrent()) return; patchFolder(f.id, { likedByMe: prev.liked, likeCount: prev.count }); setMsg(communityErrorKey(e)); }
    finally { busy.current.delete(f.id); }
  }

  async function toggleFollow(ownerId: string) {
    const key = `follow:${ownerId}`;
    if (!isCurrent() || !follow || busy.current.has(key)) return;
    busy.current.add(key);
    const prev = { on: follow.on, count: follow.count };
    setFollow({ on: !prev.on, count: prev.count + (prev.on ? -1 : 1) });
    try {
      const r = await apiClient.community.setFollow(ownerId, !prev.on);
      if (!isCurrent()) return;
      setFollow({ on: r.following, count: r.followerCount });
    } catch (e) {
      if (!isCurrent()) return;
      setFollow(prev);
      setMsg(communityErrorKey(e));
    } finally {
      busy.current.delete(key);
    }
  }

  async function handleClone(f: PublicFolderDto) {
    if (!isCurrent()) return;
    setMsg(null);
    setOkMsg('');
    if (!me?.limits?.communityWrite) {
      setMsg({ key: 'community.err.upgrade' });
      return;
    }
    const key = `clone:${f.id}`;
    if (busy.current.has(key)) return;
    busy.current.add(key);
    try {
      const r = await apiClient.community.clone(f.id);
      if (!isCurrent()) return;
      patchFolder(f.id, { cloneCount: f.cloneCount + 1 });
      setOkMsg(
        t('folder.cloneDone', {
          n: r.imported,
          have: r.alreadyInLibrary,
          skip: r.skippedLimit,
        }),
      );
    } catch (e) {
      if (!isCurrent()) return;
      setMsg(communityErrorKey(e));
    } finally {
      busy.current.delete(key);
    }
  }

  async function handleReportSubmit(e: React.FormEvent, f: PublicFolderDto) {
    e.preventDefault();
    if (!isCurrent()) return;
    setMsg(null);
    setOkMsg('');
    const key = `report:${f.id}`;
    if (busy.current.has(key)) return;
    busy.current.add(key);
    try {
      await apiClient.community.report(f.id, reportReason, reportDetail.trim() || undefined);
      if (!isCurrent()) return;
      setReportOpen(false);
      setOkMsg(t('folder.reportDone'));
    } catch (errObj) {
      if (!isCurrent()) return;
      setMsg(communityErrorKey(errObj));
    } finally {
      busy.current.delete(key);
    }
  }

  function toggleSelectMode() {
    if (adding) return;
    setSelectMode((v) => !v);
    setSelected(new Set());
    setItemStatus({});
    setSelAlert('');
  }

  function toggleSelected(idx: number) {
    if (adding) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  // D18: 목록 순서대로 순차 추가. 곡 한도면 남은 곡은 호출하지 않는다. 닫힘·계정 전환이면 중단
  async function addSelected(list: PublicFolderItemDto[]) {
    if (!isCurrent() || busy.current.has('addSelected') || selected.size === 0) return;
    busy.current.add('addSelected');
    setAdding(true);
    setSelAlert('');
    const order = [...selected].filter((i) => i >= 0 && i < list.length).sort((a, b) => a - b);
    try {
      for (const idx of order) {
        if (!isCurrent()) return;
        try {
          await apiClient.songs.create(songAddInput(list[idx]));
          if (!isCurrent()) return;
          setItemStatus((prev) => ({ ...prev, [idx]: { ok: true, text: t('folder.inLibrary') } }));
          setSelected((prev) => { const next = new Set(prev); next.delete(idx); return next; });
        } catch (e) {
          if (!isCurrent()) return;
          const k = songAddErrorKey(e);
          const text = t(k.key as any, k.vars);
          setItemStatus((prev) => ({ ...prev, [idx]: { ok: false, text } }));
          if (k.key === 'folder.err.songLimit') { setSelAlert(text); break; }
        }
      }
    } finally {
      busy.current.delete('addSelected');
      if (isCurrent()) setAdding(false);
    }
  }

  // D20: 공개 폴더 딥링크 공유 — navigator.share 우선, 없으면 클립보드
  async function handleShare(fd: PublicFolderDto) {
    if (!isCurrent()) return;
    setMsg(null);
    setOkMsg('');
    const url = new URL('community.html#folder=' + encodeURIComponent(fd.id), window.location.href).href;
    const nav = window.navigator as Navigator & { share?: (d: { title?: string; url?: string }) => Promise<void> };
    if (typeof nav.share === 'function') {
      try { await nav.share({ title: folderTitle(fd), url }); } catch { /* 취소(AbortError)·실패는 메시지 없음 */ }
      return;
    }
    try {
      if (!nav.clipboard?.writeText) throw new Error('clipboard unavailable');
      await nav.clipboard.writeText(url);
      if (!isCurrent()) return;
      setOkMsg(t('folder.shareCopied'));
    } catch {
      if (!isCurrent()) return;
      setMsg({ key: 'folder.shareFailed' });
    }
  }

  if (!folderId) return null;

  const f = detail?.folder ?? null;
  const items = detail?.items ?? [];
  const isMine = Boolean(f?.owner && me?.id && f.owner.id === me.id);
  const canFollow = Boolean(f?.owner && f.owner.id !== me?.id && follow !== null);
  const canReport = Boolean(f && f.kind === 'user' && !isMine);
  const desc = f ? i18nPick(f.descriptionI18n, getLang(), '') : '';
  const title = f ? folderTitle(f) : '';
  const showSelect = selectMode && !isMine;

  return (
    <div
      id="folderSheet"
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="folderSheetTitle"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={rootRef} className={`${styles.sheetCard} ${styles.detailCard}`}>
        {err ? (
          <p id="folderSheetErr" role="alert" className="msg err">
            {t(err.key as any, err.vars)}
          </p>
        ) : null}

        {f ? (
          <>
            <div className={styles.detailHero}>
              <div className={styles.detailCover} data-align-group="detailHero:top@768">
                <CoverArt coverVideoId={f.coverVideoId} coverVideoIds={f.coverVideoIds} label={title} />
              </div>
              <div className={styles.detailInfo} data-align-group="detailHero:top@768">
                <h3 id="folderSheetTitle" ref={titleRef} tabIndex={-1} className={styles.sheetTitle}>
                  {title}
                </h3>
                {f.owner ? (
                  <div className={styles.sheetOwnerRow}>
                    <span className={styles.sheetOwnerName}>{f.owner.publicName}</span>
                    {f.owner.isCreator ? (
                      <span className={styles.creatorBadge}>
                        {f.owner.creatorBadge || t('folder.creator')}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {desc ? <p className={styles.sheetDesc}>{desc}</p> : null}
                <p id="folderSheetMeta" className={styles.sheetMeta}>
                  {t('folder.meta', {
                    n: f.itemCount,
                    likes: f.likeCount,
                    clones: f.cloneCount,
                  })}
                </p>
              </div>
            </div>

            <div
              id="folderSheetControls"
              className={styles.detailControls}
              role="toolbar"
              aria-label={t('folder.controlsAria')}
            >
              {!isMine ? (
                <>
                  <button
                    type="button"
                    id="folderClone"
                    className={styles.detailPrimary}
                    data-align-group="detailControls:center-y"
                    onClick={() => void handleClone(f)}
                  >
                    {t('folder.clone')}
                  </button>
                  <button
                    type="button"
                    id="folderSelectMode"
                    className={styles.switchBtn}
                    data-align-group="detailControls:center-y"
                    aria-pressed={selectMode}
                    disabled={adding}
                    onClick={toggleSelectMode}
                  >
                    {selectMode ? t('folder.selectCancel') : t('folder.selectMode')}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                id="folderShare"
                className={styles.switchBtn}
                data-align-group="detailControls:center-y"
                onClick={() => void handleShare(f)}
              >
                {t('folder.share')}
              </button>
              {!isMine ? (
                <button
                  type="button"
                  id="folderLike"
                  className={styles.switchBtn}
                  data-align-group="detailControls:center-y"
                  aria-checked={f.likedByMe}
                  role="switch"
                  onClick={() => void toggleLike(f)}
                >
                  {t('folder.like')} · {f.likeCount}
                </button>
              ) : null}
              {!isMine && canFollow && f.owner ? (
                <button
                  type="button"
                  id="folderFollow"
                  className={styles.switchBtn}
                  data-align-group="detailControls:center-y"
                  aria-checked={follow?.on ?? false}
                  role="switch"
                  onClick={() => void toggleFollow(f.owner!.id)}
                >
                  {follow?.on ? t('folder.unfollow') : t('folder.follow')}
                </button>
              ) : null}
              {canReport ? (
                <button
                  type="button"
                  id="folderReportBtn"
                  className={styles.rowToggle}
                  data-align-group="detailControls:center-y"
                  onClick={() => setReportOpen((v) => !v)}
                >
                  {t('folder.report')}
                </button>
              ) : null}
            </div>

            {showSelect ? (
              <div className={styles.detailSelectBar}>
                <button
                  type="button"
                  id="folderAddSelected"
                  className={styles.detailPrimary}
                  disabled={selected.size === 0 || adding}
                  onClick={() => void addSelected(items)}
                >
                  {t('folder.addSelected', { n: selected.size })}
                </button>
                {selAlert ? (
                  <p id="folderAddSelectedAlert" role="alert" className="msg err">{selAlert}</p>
                ) : null}
              </div>
            ) : null}

            {reportOpen && canReport ? (
              <form className={styles.reportBox} onSubmit={(e) => void handleReportSubmit(e, f)}>
                <div className={styles.reportControls}>
                  <select
                    id="folderReportReason"
                    className={styles.selectPill}
                    value={reportReason}
                    onChange={(e) =>
                      setReportReason(
                        e.target.value as 'spam' | 'inappropriate' | 'copyright' | 'other',
                      )
                    }
                  >
                    <option value="spam">{t('folder.reason.spam')}</option>
                    <option value="inappropriate">{t('folder.reason.inappropriate')}</option>
                    <option value="copyright">{t('folder.reason.copyright')}</option>
                    <option value="other">{t('folder.reason.other')}</option>
                  </select>
                  <input
                    type="text"
                    id="folderReportDetail"
                    className={`inpField ${styles.nameInput}`}
                    value={reportDetail}
                    maxLength={200}
                    onChange={(e) => setReportDetail(e.target.value)}
                  />
                  <button type="submit" id="folderReportSubmit" className="pillBtn">
                    {t('folder.reportSend')}
                  </button>
                </div>
              </form>
            ) : null}

            {msg ? (
              <p id="folderSheetAlert" role="alert" className="msg err">
                {t(msg.key as any, msg.vars)}
              </p>
            ) : null}
            {okMsg ? (
              <p id="folderSheetOk" role="status" className="msg ok">
                {okMsg}
              </p>
            ) : null}

            <ol id="folderSheetItems" className={styles.detailTracks}>
              {items.map((it, idx) => {
                const seg = segText(it.a, it.b, it.rate);
                const note = i18nPick(it.noteI18n, getLang(), '');
                const st = itemStatus[idx];
                const name = it.title || it.videoId;
                return (
                  <li
                    key={`${it.videoId}-${idx}`}
                    className={styles.detailTrack}
                    data-item-video={it.videoId}
                    data-item-pos={it.position}
                  >
                    {showSelect ? (
                      <input
                        type="checkbox"
                        className={styles.detailCheck}
                        data-select-video={it.videoId}
                        data-select-pos={it.position}
                        aria-label={name}
                        checked={selected.has(idx)}
                        disabled={adding}
                        onChange={() => toggleSelected(idx)}
                      />
                    ) : null}
                    <a
                      className={styles.detailTrackLink}
                      href={itemPracticeHref(it)}
                      data-align-group={idx === 0 ? 'detailTrack0:center-y' : undefined}
                    >
                      <span className={styles.detailTrackNo}>{idx + 1}</span>
                      <img className={styles.detailTrackThumb} src={thumb(it.videoId)} alt="" loading="lazy" />
                      <span className={styles.detailTrackBody}>
                        <span className={styles.sheetItemTitle}>{name}</span>
                        {it.artist ? <span className={styles.sheetItemSub}>{it.artist}</span> : null}
                        {note ? <span className={styles.sheetItemNote}>{note}</span> : null}
                      </span>
                      {seg ? <span className={styles.detailTrackSeg}>{seg}</span> : null}
                    </a>
                    {st ? (
                      <span data-item-status={st.ok ? 'ok' : 'err'} className={st.ok ? 'msg ok' : 'msg err'}>
                        {st.text}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </>
        ) : null}

        <div className={styles.modalFoot}>
          <button type="button" id="folderClose" className="ghostBtn" onClick={onClose}>
            {t('folder.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
