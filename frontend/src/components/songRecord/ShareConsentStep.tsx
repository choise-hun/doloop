// frontend/src/components/songRecord/ShareConsentStep.tsx
// S3b-3 D6: 계정 단위 커뮤니티 공유 안내(R02). 공유 창 첫 화면과 공개 이름 폼(선택 체크박스)이 같이 쓴다.
import React from 'react';
import styles from './EpisodeShareDialog.module.css';
import { t } from '../../lib/i18n.mts';

export interface ShareConsentStepProps {
  variant: 'dialog' | 'nameForm';
  busy: boolean;
  onAgree: () => void;
  /** nameForm 전용: 기본 해제 체크박스. 실제 POST는 이름 저장 성공 뒤 폼이 한다(onAgree는 dialog 전용). */
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export function ShareConsentStep({ variant, busy, onAgree, checked = false, onCheckedChange }: ShareConsentStepProps): React.ReactElement {
  if (variant === 'nameForm') {
    return (
      <div className={styles.consentInline}>
        <p className={styles.consentBodySmall}>{t('episode.consent.body')}</p>
        <label className={styles.checkLabel}>
          <input
            id="publicNameShareConsent"
            type="checkbox"
            checked={checked}
            disabled={busy}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
          />
          <span>{t('episode.consent.nameFormLabel')}</span>
        </label>
      </div>
    );
  }
  return (
    <div className={styles.consentStep}>
      <p className={styles.consentBody}>{t('episode.consent.body')}</p>
      <button id="shareConsentAgree" type="button" className={`pillBtn ${styles.consentAgreeBtn}`} disabled={busy} onClick={onAgree}>
        {t('episode.consent.agree')}
      </button>
    </div>
  );
}

export default ShareConsentStep;
