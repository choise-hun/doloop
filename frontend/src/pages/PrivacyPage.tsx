// frontend/src/pages/PrivacyPage.tsx
import React, { useEffect } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { t } from '../lib/i18n.mts';
import styles from './SettingsPage.module.css';

export function PrivacyPage(): React.ReactElement {
  useEffect(() => {
    document.title = '개인정보처리방침 · ULeveLP'; // i18n-keep: RZ3-4 소스 문자열 단언
  }, []);

  return (
    <AppShell variant="narrow" activeNav="privacy">
      <div className={styles.headerBlock} data-align-group="col: left">
        <h1 className={`page-title ${styles.pageTitle}`}>Privacy</h1>
        <p className={`page-sub ${styles.pageSub}`}>{t('privacy.pageSub')}</p>
      </div>

      <section className={`set-sec ${styles.setSec}`} data-align-group="col: left; secs: right" aria-labelledby="privH1">
        <h2 id="privH1">{t('privacy.secCollectTitle')}</h2>
        <p>{t('privacy.secCollectIntro')}</p>
        <ul>
          <li>
            <b>{t('privacy.secCollectAccountLabel')}</b>{t('privacy.secCollectAccountText')}
          </li>
          <li>
            <b>{t('privacy.secCollectUsageLabel')}</b>{t('privacy.secCollectUsageText')}
          </li>
          <li>
            <b>{t('privacy.secCollectRecordLabel')}</b>{t('privacy.secCollectRecordText')}
          </li>
          <li>
            <b>{t('privacy.secCollectKeyLabel')}</b>{t('privacy.secCollectKeyText')}
          </li>
          <li>
            <b>{t('privacy.secCollectPlanLabel')}</b>{t('privacy.secCollectPlanText')}
          </li>
        </ul>
      </section>

      <section className={`set-sec ${styles.setSec}`} data-align-group="col: left; secs: right" aria-labelledby="privH2">
        <h2 id="privH2">{t('privacy.secPurposeTitle')}</h2>
        <p>{t('privacy.secPurposeIntro')}</p>
        <ul>
          <li>{t('privacy.secPurposeSync')}</li>
          <li>{t('privacy.secPurposeNotion')}</li>
          <li>
            {t('privacy.secPurposeGemini')}
          </li>
          <li>{t('privacy.secPurposeCredits')}</li>
        </ul>
      </section>

      <section className={`set-sec ${styles.setSec}`} data-align-group="col: left; secs: right" aria-labelledby="privH3">
        <h2 id="privH3">{t('privacy.secStorageTitle')}</h2>
        <p>{t('privacy.secStorageIntro')}</p>
        <ul>
          <li>
            <b>{t('privacy.secStoragePlaceLabel')}</b>{t('privacy.secStoragePlacePre')}<code>takes</code>{t('privacy.secStoragePlacePost')}
          </li>
          <li>
            <b>{t('privacy.secStorageCryptoLabel')}</b>{t('privacy.secStorageCryptoText')}
          </li>
        </ul>
      </section>

      <section className={`set-sec ${styles.setSec}`} data-align-group="col: left; secs: right" aria-labelledby="privH4">
        <h2 id="privH4">{t('privacy.secDeleteTitle')}</h2>
        <p>{t('privacy.secDeleteIntro')}</p>
        <ul>
          <li>
            {t('privacy.secDeleteGuidePre')}<b>{t('privacy.secDeleteGuideBold')}</b>{t('privacy.secDeleteGuideMid')}<code>{t('privacy.secDeleteGuideCode')}</code>{t('privacy.secDeleteGuidePost')}
          </li>
          <li>
            {t('privacy.secDeleteImmediate')}
          </li>
        </ul>
      </section>

      <section className={`set-sec ${styles.setSec}`} data-align-group="col: left; secs: right" aria-labelledby="privH5">
        <h2 id="privH5">{t('privacy.secCommunityTitle')}</h2>
        <ul>
          <li>{t('privacy.secCommunityOptional')}</li>
          <li>{t('privacy.secCommunityFolder')}</li>
          <li>{t('privacy.secCommunityAutosync')}</li>
          <li>{t('privacy.secCommunityStreak')}</li>
          <li>{t('privacy.secCommunityPrivacy')}</li>
          <li>{t('privacy.secCommunityStrictPrivate')}</li>
          <li>{t('privacy.secCommunityStatsOnly')}</li>
        </ul>
      </section>
    </AppShell>
  );
}

export default PrivacyPage;
