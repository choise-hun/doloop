// frontend/src/components/community/PublicNameModal.tsx
// CMR-2: 커뮤니티 이름 모달 (명세 개발산출물/명세/CMR-2_구현명세.md §3, D5·D7·D12·D13)
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { MeProfile } from '../../lib/auth';
import { t } from '../../lib/i18n.mts';
import { PublicNameForm } from './PublicNameForm';
import styles from './Community.module.css';

export interface PublicNameModalProps {
  me: MeProfile;                       // 호출부가 me.id===user.id 보장
  reason: 'first' | 'share';           // share면 #communityNameModalReason 표시
  onDismiss: () => void;               // 닫기·ESC·나중에·배경 (저장 중엔 호출 안 됨)
  onSaved: (publicName: string) => void;
}

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function PublicNameModal({ me, reason, onDismiss, onSaved }: PublicNameModalProps): React.ReactElement {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const acquireSave = useCallback(() => {
    if (savingRef.current) return null;
    savingRef.current = true;
    setSaving(true);
    return () => { savingRef.current = false; setSaving(false); };
  }, []);

  const dismiss = useCallback(() => {
    if (savingRef.current) return;
    onDismiss();
  }, [onDismiss]);

  // 열릴 때 입력 focus + 배경 스크롤 잠금(닫힘·언마운트 시 이전 값 복원)
  useEffect(() => {
    inputRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, []);

  // ESC 닫기(저장 중 무시) + Tab 순환 (EpisodeReportDialog 기준 패턴)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && dialogRef.current.contains(active);
      if (e.shiftKey) {
        if (!inside || active === first) { e.preventDefault(); last.focus(); }
      } else if (!inside || active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dismiss]);

  return (
    <div
      ref={dialogRef}
      id="communityNameModal"
      className={styles.nameModalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="communityNameModalTitle"
      aria-describedby="communityNameModalDesc"
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div className={styles.nameModalCard}>
        <h2 id="communityNameModalTitle" className={styles.nameModalTitle}>{t('community.nameModalTitle')}</h2>
        <p id="communityNameModalDesc" className={styles.nameModalDesc}>{t('community.nameBanner')}</p>
        {reason === 'share' ? (
          <p id="communityNameModalReason" className={styles.nameModalReason}>{t('community.nameModalShareReason')}</p>
        ) : null}
        <PublicNameForm
          me={me}
          inputId="communityNameModalInput"
          submitId="communityNameModalSave"
          inputRef={inputRef}
          acquireSave={acquireSave}
          onSaved={onSaved}
        />
        <div className={styles.nameModalFoot}>
          <button type="button" id="communityNameModalSkip" className="ghostBtn" disabled={saving} onClick={dismiss}>
            {t('community.nameModalSkip')}
          </button>
        </div>
        <button
          type="button"
          id="communityNameModalClose"
          className={styles.nameModalClose}
          aria-label={t('community.nameModalClose')}
          disabled={saving}
          onClick={dismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
}
