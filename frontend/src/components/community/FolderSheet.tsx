// frontend/src/components/community/FolderSheet.tsx
import React, { useEffect, useRef, useState } from 'react';
import { apiClient, type PublicFolderDto, type PublicFolderItemDto } from '../../lib/apiClient';
import type { MeProfile } from '../../lib/auth';
import {
  communityErrorKey,
  i18nPick,
  itemPracticeHref,
  segText,
} from '../../lib/community.mts';
import { getLang, t } from '../../lib/i18n.mts';
import { thumb } from '../../lib/security';
import { CoverArt, folderTitle } from './CommunityParts';
import styles from './Community.module.css';

export interface FolderSheetProps {
  folderId: string | null;
  me: MeProfile | null;
  onClose: () => void;
  onPatchFolder?: (id: string, patch: Partial<PublicFolderDto>) => void;
}

export function FolderSheet({ folderId, me, onClose, onPatchFolder }: FolderSheetProps) {
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

  function patchFolder(id: string, patch: Partial<PublicFolderDto>) {
    setDetail((prev) =>
      prev && prev.folder.id === id ? { ...prev, folder: { ...prev.folder, ...patch } } : prev,
    );
    onPatchFolder?.(id, patch);
  }

  // S3 FolderSheet 열기 — 폴더 id가 바뀌면 늦은 응답 버림
  useEffect(() => {
    const my = ++sheetSeq.current; setDetail(null); setFollow(null);
    setErr(null); setMsg(null); setOkMsg(''); setReportOpen(false); setReportDetail('');
    if (!folderId) return;
    apiClient.community.folder(folderId).then((d) => {
      if (my !== sheetSeq.current) return; setDetail(d);
      const owner = d.folder.owner;
      if (owner && owner.id !== me?.id) apiClient.community.user(owner.id)
        .then((u) => { if (my === sheetSeq.current) setFollow({ on: u.followingByMe, count: u.followerCount }); })
        .catch(() => { if (my === sheetSeq.current) setFollow(null); });   // 팔로우 버튼만 숨김
    }).catch((e) => { if (my === sheetSeq.current) setErr(communityErrorKey(e)); });
  }, [folderId]);

  // S2 좋아요(팔로우 같음) — 낙관적 + 되돌림, 요청 중 재클릭 무시
  async function toggleLike(f: PublicFolderDto) {
    if (busy.current.has(f.id)) return; busy.current.add(f.id);
    const prev = { liked: f.likedByMe, count: f.likeCount };
    patchFolder(f.id, { likedByMe: !prev.liked, likeCount: prev.count + (prev.liked ? -1 : 1) });
    try { const r = await apiClient.community.setLike(f.id, !prev.liked);
          patchFolder(f.id, { likedByMe: r.liked, likeCount: r.likeCount }); }   // 서버 값이 최종
    catch (e) { patchFolder(f.id, { likedByMe: prev.liked, likeCount: prev.count }); setMsg(communityErrorKey(e)); }
    finally { busy.current.delete(f.id); }
  }

  async function toggleFollow(ownerId: string) {
    const key = `follow:${ownerId}`;
    if (!follow || busy.current.has(key)) return;
    busy.current.add(key);
    const prev = { on: follow.on, count: follow.count };
    setFollow({ on: !prev.on, count: prev.count + (prev.on ? -1 : 1) });
    try {
      const r = await apiClient.community.setFollow(ownerId, !prev.on);
      setFollow({ on: r.following, count: r.followerCount });
    } catch (e) {
      setFollow(prev);
      setMsg(communityErrorKey(e));
    } finally {
      busy.current.delete(key);
    }
  }

  async function handleClone(f: PublicFolderDto) {
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
      patchFolder(f.id, { cloneCount: f.cloneCount + 1 });
      setOkMsg(
        t('folder.cloneDone', {
          n: r.imported,
          have: r.alreadyInLibrary,
          skip: r.skippedLimit,
        }),
      );
    } catch (e) {
      setMsg(communityErrorKey(e));
    } finally {
      busy.current.delete(key);
    }
  }

  async function handleReportSubmit(e: React.FormEvent, f: PublicFolderDto) {
    e.preventDefault();
    setMsg(null);
    setOkMsg('');
    const key = `report:${f.id}`;
    if (busy.current.has(key)) return;
    busy.current.add(key);
    try {
      await apiClient.community.report(f.id, reportReason, reportDetail.trim() || undefined);
      setReportOpen(false);
      setOkMsg(t('folder.reportDone'));
    } catch (errObj) {
      setMsg(communityErrorKey(errObj));
    } finally {
      busy.current.delete(key);
    }
  }

  if (!folderId) return null;

  const f = detail?.folder ?? null;
  const items = detail?.items ?? [];
  const isMine = Boolean(f?.owner && me?.id && f.owner.id === me.id);
  const canFollow = Boolean(f?.owner && f.owner.id !== me?.id && follow !== null);
  const canReport = Boolean(f && f.kind === 'user' && !isMine);
  const desc = f ? i18nPick(f.descriptionI18n, getLang(), '') : '';

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
      <div className={styles.sheetCard}>
        {err ? (
          <p id="folderSheetErr" role="alert" className="msg err">
            {t(err.key as any, err.vars)}
          </p>
        ) : null}

        {f ? (
          <>
            <div className={styles.sheetHead}>
              <div className={styles.sheetCover}>
                <CoverArt coverVideoIds={f.coverVideoIds} />
              </div>
              <div className={styles.sheetHeadInfo}>
                <h3 id="folderSheetTitle" className={styles.sheetTitle}>
                  {folderTitle(f)}
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

            {!isMine ? (
              <div className={styles.sheetActions}>
                <button
                  type="button"
                  id="folderLike"
                  className={styles.switchBtn}
                  aria-checked={f.likedByMe}
                  role="switch"
                  onClick={() => void toggleLike(f)}
                >
                  {t('folder.like')} · {f.likeCount}
                </button>
                <button
                  type="button"
                  id="folderClone"
                  className={styles.republishBtn}
                  onClick={() => void handleClone(f)}
                >
                  {t('folder.clone')}
                </button>
                {canFollow && f.owner ? (
                  <button
                    type="button"
                    id="folderFollow"
                    className={styles.switchBtn}
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
                    onClick={() => setReportOpen((v) => !v)}
                  >
                    {t('folder.report')}
                  </button>
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

            <ul className={styles.sheetItems}>
              {items.map((it, idx) => {
                const seg = segText(it.a, it.b, it.rate);
                const note = i18nPick(it.noteI18n, getLang(), '');
                return (
                  <li key={`${it.videoId}-${idx}`} className={styles.sheetItem}>
                    <div className={styles.sheetItemLeft}>
                      <img
                        className={styles.sheetItemThumb}
                        src={thumb(it.videoId)}
                        alt=""
                        loading="lazy"
                      />
                      <div className={styles.sheetItemBody}>
                        <span className={styles.sheetItemTitle}>{it.title || it.videoId}</span>
                        <span className={styles.sheetItemSub}>
                          {it.artist || ''}
                          {it.artist && seg ? ' · ' : ''}
                          {seg}
                        </span>
                        {note ? <p className={styles.sheetItemNote}>{note}</p> : null}
                      </div>
                    </div>
                    <a className={styles.practiceLink} href={itemPracticeHref(it)}>
                      {t('folder.practice')}
                    </a>
                  </li>
                );
              })}
            </ul>
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
