// M2-1a: AI 기능 BETA 배지 (계획/앱_명세.md §3.1-1). 문구는 i18n 'beta.label'
// 버튼·링크 안에 넣어도 되는 인라인 요소. 맞춤 그룹이 필요하면 alignGroup으로 받는다(프론트_정렬규격 §3)
import React from 'react';
import { t } from '../../lib/i18n.mts';
import styles from './BetaBadge.module.css';

export interface BetaBadgeProps {
  /** data-align-group 값(선택) */
  alignGroup?: string;
}

export function BetaBadge({ alignGroup }: BetaBadgeProps): React.ReactElement {
  return (
    <span className={styles.badge} data-beta="1" data-align-group={alignGroup}>
      {t('beta.label')}
    </span>
  );
}
