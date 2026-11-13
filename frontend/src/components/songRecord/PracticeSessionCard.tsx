// frontend/src/components/songRecord/PracticeSessionCard.tsx
import React, { useState, useRef, useEffect } from 'react';
import styles from './PracticeSessionCard.module.css';
import { apiClient, type TakeDto } from '../../lib/apiClient';
import { auth, useAuth } from '../../lib/auth';
import type { PracticeSessionCardModel } from '../../lib/episode.mts';
import { buildEpisodePracticeUrl } from '../../lib/episode.mts';
import { segText, fmtSec } from '../../lib/community.mts';
import { TakeItemRow } from './SongRecordParts';
import { EpisodeShareDialog } from './EpisodeShareDialog';
import { useEpisodeShares } from './useEpisodeShares';
import { SafeLink } from '../common/SafeLink';
import { t } from '../../lib/i18n.mts';

export interface PracticeSessionCardProps {
  session: PracticeSessionCardModel;
  surface?: 'day' | 'player' | 'detail';
  onTakeRemoved?: (sessionId: string, takeId: string) => void;
  onTakeCompleted?: (take: TakeDto) => void;
  onMemoSaved?: (sessionId: string, memo: string) => void;
  abSelection?: { a: string; b: string };
  onSelectAbSlot?: (takeId: string, slot: 'a' | 'b' | '') => void;
}

export function PracticeSessionCard(props: PracticeSessionCardProps): React.ReactElement {
  const state = useAuth();
  return <OwnedPracticeSessionCard key={`${state.user?.id}:${props.session.sessionId}`} {...props} />;
}

function OwnedPracticeSessionCard({
  session,
  surface = 'day',
  onTakeRemoved,
  onTakeCompleted,
  onMemoSaved,
  abSelection,
  onSelectAbSlot,
}: PracticeSessionCardProps): React.ReactElement {
  const authState = useAuth();
  const me = authState.me;
  const isPaid = me?.limits?.communityWrite ?? (me?.tier === 'pro' || me?.tier === 'pro_plus');
  const hasPublicName = Boolean(me?.publicName?.trim());

  const { shares, loading: sharesLoading, complete: sharesComplete, error: sharesError, setShare, removeShare, invalidate } = useEpisodeShares();
  const sharePost = shares.get(session.sessionId) || null;

  const [memoVal, setMemoVal] = useState(session.memo || '');
  const [savingMemo, setSavingMemo] = useState(false);
  const [memoStatus, setMemoStatus] = useState('');
  const [partsOpen, setPartsOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [removingRecording, setRemovingRecording] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const alive = useRef(false);
  const ownerUid = authState.user?.id;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const isCurrent = () => alive.current && ownerUid === auth.getUser()?.id;

  const shareBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = `sessionShareMenu-${surface}-${session.sessionId}`;

  const closeMenu = (focusIcon: boolean) => {
    setMenuOpen(false);
    if (focusIcon) shareBtnRef.current?.focus();
  };

  // D2: 메뉴가 열리면 첫 활성 항목으로 포커스, ESC·바깥 클릭으로 닫는다.
  useEffect(() => {
    if (!menuOpen) return;
    const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || []);
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
      if (e.key === 'Tab') { closeMenu(false); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const list = items();
        if (list.length === 0) return;
        e.preventDefault();
        const idx = list.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'ArrowDown' ? (idx + 1) % list.length : (idx - 1 + list.length) % list.length;
        list[next]?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || shareBtnRef.current?.contains(target)) return;
      closeMenu(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [menuOpen]);

  const titleText = `${session.songTitle || t('log.noTitleSong')}${
    session.songArtist ? ' · ' + session.songArtist : ''
  }`;
  const playHref = buildEpisodePracticeUrl(session.videoId, session.a, session.b, session.rate);

  const segInfo = segText(session.a, session.b, session.rate);
  const coverage = session.coveragePct || 0;
  const parts = session.partStats || [];
  const takes = session.takes || [];

  // 메모 저장 핸들러
  const handleSaveMemo = async () => {
    setSavingMemo(true);
    setMemoStatus(t('log.statusSaving'));
    try {
      await apiClient.sessions.updateMemo(session.sessionId, memoVal);
      if (!isCurrent()) return;
      onMemoSaved?.(session.sessionId, memoVal.trim());
      setMemoStatus(t('log.statusSaved'));
      setTimeout(() => {
        if (!isCurrent()) return;
        setMemoStatus((cur) => (cur === t('log.statusSaved') ? '' : cur));
      }, 2000);
    } catch (err: any) {
      if (!isCurrent()) return;
      setMemoStatus(err?.message || t('log.statusSaveFailed'));
    } finally {
      if (isCurrent()) setSavingMemo(false);
    }
  };

  // 철회 (공유 중지) 핸들러
  const handleWithdraw = async () => {
    if (withdrawing || removingRecording || shareDialogOpen) return;
    if (!window.confirm(t('episode.share.withdrawConfirm'))) return;
    setWithdrawing(true);
    setActionMsg(null);
    try {
      const res = await apiClient.sessions.withdrawShare(session.sessionId);
      if (!isCurrent()) return;
      if (res?.ok) {
        removeShare(session.sessionId);
        setActionMsg(t('episode.share.withdrawn'));
      }
    } catch (err: any) {
      if (!isCurrent()) return;
      setActionMsg(err?.message || t('episode.share.withdrawFailed'));
    } finally {
      if (isCurrent()) setWithdrawing(false);
    }
  };

  // D3: 녹음만 내리기 — 카드·통계는 그대로(R04 ③)
  const handleRemoveRecording = async () => {
    if (withdrawing || removingRecording || shareDialogOpen) return;
    if (!window.confirm(t('episode.share.removeRecordingConfirm'))) return;
    setRemovingRecording(true);
    setActionMsg(null);
    try {
      await apiClient.sessions.removeShareAttachment(session.sessionId);
      if (!isCurrent()) return;
      invalidate();
    } catch (err: any) {
      if (!isCurrent()) return;
      setActionMsg(err?.message || t('episode.err.generic'));
    } finally {
      if (isCurrent()) setRemovingRecording(false);
    }
  };

  // 공유 상태 판정 (명세 §4.2)
  const isHidden = sharePost?.status === 'moderation_hidden';
  const isWithdrawn = Boolean(sharePost?.withdrawnAt);
  const isPaused = sharePost?.status === 'tier_paused' && !isWithdrawn;
  const isPublished = sharePost?.status === 'published' && !isWithdrawn && !isHidden;
  const canRepublish = Boolean(sharePost?.canRepublish);
  const hasAttachment = Boolean(sharePost?.attachment) && !isWithdrawn;
  const cannotShare = !isPaid || !hasPublicName || session.partStats === null;
  const shareTip = !isPaid
    ? t('episode.share.tipFreeNotice')
    : !hasPublicName
      ? t('episode.share.tipNameNotice')
      : undefined;
  // D2: 숨김이면 다시 게시 비활성, 정지·철회는 canRepublish일 때만
  const republishDisabled = isHidden || cannotShare || withdrawing || removingRecording ||
    ((isPaused || isWithdrawn) && !canRepublish);
  const republishTip = !isPaid
    ? t('episode.share.tipProRequired')
    : !hasPublicName
      ? t('episode.share.tipNameRequired')
      : (isPaused || isWithdrawn) && !canRepublish
        ? t('episode.share.tipCannotRepublish')
        : undefined;
  const headGroup = `sessionHead-${surface}-${session.sessionId}:center-y`;

  const shareIconSvg = (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
    </svg>
  );

  let shareIcon: React.ReactNode = null;
  if (!sharePost && sharesComplete) {
    shareIcon = (
      <button
        ref={shareBtnRef}
        type="button"
        data-share-action="open"
        className={styles.shareIconBtn}
        disabled={cannotShare}
        onClick={() => setShareDialogOpen(true)}
        title={shareTip}
        aria-label={t('episode.share.title')}
        data-align-group={headGroup}
      >
        {shareIconSvg}
      </button>
    );
  } else if (sharePost) {
    shareIcon = (
      <span className={styles.menuWrap}>
        <button
          ref={shareBtnRef}
          type="button"
          data-share-action="menu"
          className={`${styles.shareIconBtn} ${isPublished ? styles.shareIconOn : ''}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          aria-label={t('episode.share.menu')}
          disabled={withdrawing || removingRecording}
          onClick={() => setMenuOpen((v) => !v)}
          data-align-group={headGroup}
        >
          {shareIconSvg}
        </button>
        {menuOpen && (
          <div ref={menuRef} id={menuId} role="menu" aria-label={t('episode.share.menu')} className={styles.shareMenu}>
            <button
              type="button"
              role="menuitem"
              data-share-action="edit"
              className={styles.menuItem}
              disabled={republishDisabled}
              title={republishTip}
              onClick={() => { closeMenu(false); setShareDialogOpen(true); }}
            >
              {t('episode.share.republish')}
            </button>
            {hasAttachment && (
              <button
                type="button"
                role="menuitem"
                data-share-action="remove-recording"
                className={styles.menuItem}
                onClick={() => { closeMenu(true); void handleRemoveRecording(); }}
              >
                {t('episode.share.removeRecording')}
              </button>
            )}
            {!isWithdrawn && (
              <button
                type="button"
                role="menuitem"
                data-share-action="withdraw"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={() => { closeMenu(true); void handleWithdraw(); }}
              >
                {withdrawing ? t('episode.submitting') : t('episode.share.withdraw')}
              </button>
            )}
          </div>
        )}
      </span>
    );
  }

  return (
    <div
      className={`card tl-row ${styles.card} ${styles.tlRow || ''}`}
      data-session-id={session.sessionId}
      data-surface={surface}
      aria-label={`${session.date} ${t('episode.defaultTitle')}`}
    >
      {/* 1. 헤더: 곡 제목 / 연습 링크 / 공유 아이콘(D1) */}
      <div className={styles.sessionHead}>
        <div
          className={`session-title ${styles.sessionTitle}`}
          data-align-group={`sessionHead-${surface}-${session.sessionId}:center-y`}
        >
          {titleText}
        </div>
        <div className={styles.headActs}>
          <SafeLink className={`ghost mini ${styles.ghostMini}`} href={playHref}>
            {t('log.btnPractice')}
          </SafeLink>
          {shareIcon}
        </div>
      </div>

      {/* 2. 날짜 · 시간 · 실제 loops */}
      <div className={styles.metaRow}>
        <span>{session.date}</span>
        <span>·</span>
        <span>{fmtSec(session.seconds)}</span>
        <span>·</span>
        <span>{t('episode.loopsCount', { count: session.loops })}</span>
        {segInfo && (
          <>
            <span>·</span>
            <span>{segInfo}</span>
          </>
        )}
      </div>

      {/* 4. coverage (프로그레스 바) */}
      <div className={styles.coverageRow}>
        <div className={styles.coverageBarWrap}>
          <progress
            className={`tlCoverageBar ${styles.coverageBar} ${coverage >= 100 ? styles.coverageComplete : ''}`}
            value={coverage}
            max={100}
            aria-label={t('episode.aria.coverage', { pct: coverage })}
          />
        </div>
        <span className={styles.coveragePct}>{coverage}%</span>
      </div>

      {/* 5. 파트 요약 및 상세 토글 */}
      {parts.length > 0 && (
        <div className={styles.partsSection} aria-label={t('episode.aria.details')}>
          <button
            type="button"
            className={`ghost mini btnAccordion ${styles.partsToggleBtn}`}
            aria-expanded={partsOpen}
            aria-controls={`sessionParts-${surface}-${session.sessionId}`}
            onClick={() => setPartsOpen((prev) => !prev)}
          >
            {partsOpen ? t('episode.partsFold') : t('episode.partsUnfold', { count: parts.length })}
          </button>
          <div
            id={`sessionParts-${surface}-${session.sessionId}`}
            className={`tlPartStats ${styles.partsList}`}
            hidden={!partsOpen}
          >
            {parts.map((p, idx) => (
              <div key={idx} className={styles.partItem}>
                <span className={styles.partName}>{p.name || t('episode.partEmpty')}</span>
                <span className={styles.partStats}>
                  {segText(p.a, p.b, p.rate)} · {fmtSec(p.seconds)} · {t('episode.loopsUnit', { loops: p.loops })}
                  {p.completed ? ' ✓' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {session.partStats === null && (
        <div className={styles.partsUnreadable}>{t('episode.partsUnreadable')}</div>
      )}

      {/* 6. 테이크 목록 */}
      {takes.length > 0 && (
        <div className={styles.takesList}>
          {takes.map((take) => {
            const abSlot: 'a' | 'b' | '' = abSelection
              ? abSelection.a === take.id ? 'a' : abSelection.b === take.id ? 'b' : ''
              : '';
            return (
            <TakeItemRow
              key={take.id}
              take={take}
              {...(abSelection && onSelectAbSlot
                ? { showAbCheck: true, abSlot, abChecked: abSlot !== '', onSelectAbSlot }
                : {})}
              onCompleted={onTakeCompleted}
              onDeleted={(takeId) => onTakeRemoved?.(session.sessionId, takeId)}
            />
            );
          })}
        </div>
      )}

      {/* 7. 개인 메모 */}
      <div className={styles.sessionMemo}>
        <label htmlFor={`memoInp-${surface}-${session.sessionId}`} className="sr-only">
          {t('episode.ariaSessionMemo')}
        </label>
        <textarea
          id={`memoInp-${surface}-${session.sessionId}`}
          className="inpField"
          rows={2}
          maxLength={2000}
          placeholder={t('log.phSessionMemo')}
          value={memoVal}
          onChange={(e) => setMemoVal(e.target.value)}
        />
        <div className={styles.sessionMemoAct}>
          <button
            type="button"
            className={`ghost mini ${styles.ghostMini}`}
            disabled={savingMemo}
            onClick={handleSaveMemo}
          >
            {t('log.btnSaveMemo')}
          </button>
          <span className={styles.memoStatus} role="status">{memoStatus}</span>
        </div>
      </div>

      {/* 8. 커뮤니티 공유 상태 / 행동 (명세 §4.2) */}
      <div className={styles.shareSection}>
        <div className={styles.shareStatusRow}>
          {sharesLoading && !sharesComplete && !sharePost ? (
            <span className={styles.shareBadgeChecking}>{t('episode.share.checking')}</span>
          ) : sharesError && !sharePost ? (
            <div className={styles.shareErrorRow}>
              <span className={styles.shareErrorText}>{t('episode.share.stateError')}</span>
              <button type="button" className="ghost mini" onClick={invalidate}>
                {t('episode.retry')}
              </button>
            </div>
          ) : isHidden ? (
            <div className={styles.moderationBox}>
              <span className={styles.shareBadgeHidden}>{t('episode.share.hidden')}</span>
              {sharePost?.hiddenReason && (
                <p className={styles.hiddenReason}>{t('episode.share.reasonPrefix', { reason: sharePost.hiddenReason })}</p>
              )}
            </div>
          ) : isPublished ? (
            <span className={styles.shareBadgePublished}>{t('episode.share.published')}</span>
          ) : isPaused ? (
            <span className={styles.shareBadgePaused}>{t('episode.share.paused')}</span>
          ) : isWithdrawn ? (
            <span className={styles.shareBadgeWithdrawn}>{t('episode.share.withdrawn')}</span>
          ) : (
            <span className={styles.shareBadgeNone}>{t('episode.share.badgeNone')}</span>
          )}

          {isHidden && isWithdrawn && <span>{t('episode.share.withdrawn')}</span>}
        </div>

        {actionMsg && <p className={styles.actionMsg}>{actionMsg}</p>}
      </div>

      {shareDialogOpen && (
        <EpisodeShareDialog
          session={session}
          existingShare={sharePost}
          onRefresh={invalidate}
          triggerEl={shareBtnRef.current}
          onClose={() => setShareDialogOpen(false)}
          onSuccess={(newPost) => {
            setShare(newPost);
            setActionMsg(t('episode.share.success'));
          }}
        />
      )}
    </div>
  );
}
export default PracticeSessionCard;
