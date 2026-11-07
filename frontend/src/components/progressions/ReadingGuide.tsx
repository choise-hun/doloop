// CH-5: 코드 사이트·악보에서 진행을 읽는 법 (접이식 안내 — CH-1a §2)
import React from 'react';
import { t } from '../../lib/i18n.mts';
import styles from './Progressions.module.css';

export function ReadingGuide(): React.ReactElement {
  return (
    <details className={styles.guide} data-testid="readingGuide">
      <summary>{t('prog.guideSummary')}</summary>
      <ul>
        <li>
          <b>{t('prog.guideBeatBold')}</b> {t('prog.guideOrderBold')}{t('prog.guideBeatPost')}
        </li>
        <li>
          {t('prog.guideSitesPre')}<b>{t('prog.guideSitesBold')}</b>{t('prog.guideSitesPost')}<code>|</code>{t('prog.guideMeasureBar')},{' '}
          <code>x2</code>{t('prog.guideRepeatSign')}, <code>N.C.</code>{t('prog.guideNoChordSign')}
        </li>
        <li>
          {t('prog.guideRepetitionPre')}<b>{t('prog.guideRepetitionBold')}</b>{t('prog.guideRepetitionPost')}
        </li>
        <li>
          {t('prog.guideSeparatorPre')}<code>-</code>{t('prog.guideSeparatorMid')}<code>FM7 - E7 - Am7 - Gm7 C7</code>{t('prog.guideSeparatorPost')}
        </li>
        <li>
          {t('prog.guideKeyAuto')}
        </li>
      </ul>
      <p className={styles.guideExample}>
        {t('prog.guideExampleLabel')}<code>| FM7 | E7 | Am7 | Gm7 C7 |</code>{t('prog.guideExampleArrow')}<code>FM7 - E7 - Am7 - Gm7 - C7</code>{t('prog.guideExampleKey')}{' '}
        <code>bVIM7 - V7 - im7 - bviim7 - bIII7</code>
      </p>
    </details>
  );
}
