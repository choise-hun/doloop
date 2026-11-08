// frontend/src/pages/SettingsPage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import { OpsPanel } from '../components/ops/OpsPanel';
import { SafeLink } from '../components/common/SafeLink';
import { auth, canUseAi, useAuth } from '../lib/auth';
import { apiClient, CreditsSummaryDto, IntegrationDto, NotionSyncStatusDto } from '../lib/apiClient';
import { tierLabel } from '../lib/jobError.mts';
import { communityErrorKey } from '../lib/community.mts';
import { getLangChoice, onLangChange, setLang, t, type I18nKey, type LangChoice, type LocaleCode } from '../lib/i18n.mts';
import { drive } from '../lib/drive';
import { getTheme, raw, safeUrl, setTheme, THEME_EVENT } from '../lib/security';
import { PublicNameForm } from '../components/community/PublicNameForm';
import commStyles from '../components/community/Community.module.css';
import styles from './SettingsPage.module.css';

// 노션 DB 링크를 그대로 붙여넣어도 DB ID만 꺼낸다. ID는 마지막 경로 끝에 있고 ?v= 뒤는 보기 ID라 보지 않는다.
// URL이 아니거나 ID를 못 찾으면 입력 그대로(서버가 32자리 형식을 검증)
function notionDbIdFromInput(raw: string): string {
  const s = raw.trim();
  let pathname: string;
  try {
    pathname = new URL(s).pathname;
  } catch {
    return s;
  }
  const seg = pathname.split('/').filter(Boolean).pop() || '';
  const m = seg.match(/([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return m ? m[1] : s;
}

const LANG_LABEL_KEY: Record<LangChoice, I18nKey> = {
  auto: 'settings.langAuto',
  ko: 'settings.langKo',
  en: 'settings.langEn',
  ja: 'settings.langJa',
};

export function SettingsPage(): React.ReactElement {
  useEffect(() => {
    document.title = '설정 · ULeveLP'; // i18n-keep: RZ3-4 소스 문자열 단언
  }, []);

  const authState = useAuth();
  const user = authState.user;
  const signedIn = Boolean(authState.user);
  const activeUid = authState.user?.id ?? null;
  const embedded = auth.isEmbedded();

  // 계정 상태
  const [accMsg, setAccMsg] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '', kind: '' });
  const [delConfirm, setDelConfirm] = useState('');
  const [busyAuth, setBusyAuth] = useState(false);

  // Google Drive 저장소 상태
  const [driveMsg, setDriveMsg] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '', kind: '' });
  const [busyDrive, setBusyDrive] = useState(false);

  // 노션 ZIP 입출력 상태
  const [exportAudio, setExportAudio] = useState(true);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [previewSummary, setPreviewSummary] = useState('');
  const [previewItems, setPreviewItems] = useState<Array<{ text: string; isErr?: boolean }>>([]);
  const [nxMsg, setNxMsg] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '', kind: '' });
  const [busyNx, setBusyNx] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 외부 연동 키 상태
  const [notionKeyMeta, setNotionKeyMeta] = useState<{ hint: string; date: string } | null>(null);
  const [notionHasKey, setNotionHasKey] = useState(false);
  const notionStatusText = notionKeyMeta
    ? t('settings.ntnConfigured', notionKeyMeta)
    : t('settings.ntnUnregistered');
  const [ntnToken, setNtnToken] = useState('');
  const [ntnSongsDb, setNtnSongsDb] = useState('');
  const [ntnSessionsDb, setNtnSessionsDb] = useState('');
  const [ntnNotesDb, setNtnNotesDb] = useState('');
  const [ntnKeyMsg, setNtnKeyMsg] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '', kind: '' });
  const [busyNtnKey, setBusyNtnKey] = useState(false);

  // 실시간 노션 동기화 상태
  const [syncState, setSyncState] = useState<NotionSyncStatusDto>({
    enabled: false,
    pending: 0,
    failed: 0,
  });
  const [syncStatusError, setSyncStatusError] = useState('');
  const [syncMsg, setSyncMsg] = useState<{ text: string; kind: '' | 'ok' | 'err' }>({ text: '', kind: '' });
  const [busySync, setBusySync] = useState(false);

  // AI 분석 크레딧(M1-3c): 잔액은 /me credits, 다음 지급은 GET /credits
  const [creditSummary, setCreditSummary] = useState<CreditsSummaryDto | null>(null);

  // 커뮤니티 설정 스위치(M2-23 D5, S5: 낙관적 + 되돌림)
  const [optAutosync, setOptAutosync] = useState<boolean | null>(null);
  const [optPracticeLog, setOptPracticeLog] = useState<boolean | null>(null);
  const [commErr, setCommErr] = useState<{ key: string; vars?: Record<string, string> } | null>(null);
  const commBusyRef = useRef(new Set<string>());

  useEffect(() => {
    setOptAutosync(null);
    setOptPracticeLog(null);
    setCommErr(null);
  }, [authState.me?.id, authState.me?.shareAutosync, authState.me?.sharePracticeLog]);

  const canCommunityWrite = Boolean(authState.me?.limits?.communityWrite);
  const hasPublicName = Boolean(authState.me?.publicName);
  const currentAutosync = optAutosync !== null ? optAutosync : Boolean(authState.me?.shareAutosync);
  const currentPracticeLog = optPracticeLog !== null ? optPracticeLog : Boolean(authState.me?.sharePracticeLog);

  const handleToggleAutosync = async () => {
    if (!canCommunityWrite || commBusyRef.current.has('autosync')) return;
    const generation = auth.getSessionGeneration();
    commBusyRef.current.add('autosync');
    setCommErr(null);
    const prev = currentAutosync;
    const next = !prev;
    setOptAutosync(next);
    try {
      const updated = await auth.updateProfile({ shareAutosync: next });
      if (generation !== auth.getSessionGeneration()) return;
      setOptAutosync(typeof updated?.shareAutosync === 'boolean' ? updated.shareAutosync : next);
    } catch (e) {
      if (generation !== auth.getSessionGeneration() || (e as Error)?.name === 'AbortError') return;
      setOptAutosync(prev);
      setCommErr(communityErrorKey(e));
    } finally {
      commBusyRef.current.delete('autosync');
    }
  };

  const handleTogglePracticeLog = async () => {
    if (!canCommunityWrite || !hasPublicName || commBusyRef.current.has('practiceLog')) return;
    const generation = auth.getSessionGeneration();
    commBusyRef.current.add('practiceLog');
    setCommErr(null);
    const prev = currentPracticeLog;
    const next = !prev;
    setOptPracticeLog(next);
    try {
      const updated = await auth.updateProfile({ sharePracticeLog: next });
      if (generation !== auth.getSessionGeneration()) return;
      setOptPracticeLog(typeof updated?.sharePracticeLog === 'boolean' ? updated.sharePracticeLog : next);
    } catch (e) {
      if (generation !== auth.getSessionGeneration() || (e as Error)?.name === 'AbortError') return;
      setOptPracticeLog(prev);
      setCommErr(communityErrorKey(e));
    } finally {
      commBusyRef.current.delete('practiceLog');
    }
  };

  // 고급 설정(노션) 접힘: 노션 관련 해시로 들어오면 펼친다
  const [advOpen, setAdvOpen] = useState(() => ['#advanced', '#notion', '#links'].includes(window.location.hash));
  // 노션 바로가기 및 화면 테마
  const [nlPractice, setNlPractice] = useState(() => raw.get('ulp:notion-practice'));
  const [nlNotes, setNlNotes] = useState(() => raw.get('ulp:notion-notes'));
  const [nlMsg, setNlMsg] = useState('');
  const [themeVal, setThemeVal] = useState<'light' | 'dark' | ''>(() => getTheme());
  useEffect(() => {
    const sync = () => setThemeVal(getTheme());
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  const [langChoice, setLangChoiceState] = useState<LangChoice>(() => getLangChoice());
  const pendingLocaleRef = useRef<{ locale: LocaleCode | null; generation: number } | undefined>(undefined);
  const syncingLocaleRef = useRef(false);
  useEffect(() => onLangChange(() => setLangChoiceState(getLangChoice())), []);
  const handleLangChange = (next: LangChoice) => {
    setLangChoiceState(next);
    setLang(next);
    if (!user) return;
    pendingLocaleRef.current = { locale: next === 'auto' ? null : next, generation: auth.getSessionGeneration() };
    if (syncingLocaleRef.current) return;
    syncingLocaleRef.current = true;
    void (async () => {
      while (pendingLocaleRef.current !== undefined) {
        const target = pendingLocaleRef.current;
        pendingLocaleRef.current = undefined;
        if (target.generation !== auth.getSessionGeneration()) continue;
        try { await apiClient.me.update({ locale: target.locale }); }
        catch (err) { console.warn('[i18n] locale sync failed:', err); }
      }
      syncingLocaleRef.current = false;
    })();
  };

  const keysReqSeqRef = useRef(0);
  const syncReqSeqRef = useRef(0);

  const resetAllUserFields = () => {
    setPreviewToken(null);
    setPreviewSummary('');
    setPreviewItems([]);
    setNxMsg({ text: '', kind: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setNotionKeyMeta(null);
    setNotionHasKey(false);
    setNtnToken('');
    setNtnSongsDb('');
    setNtnSessionsDb('');
    setNtnNotesDb('');
    setCreditSummary(null);
    setSyncState({ enabled: false, pending: 0, failed: 0 });
    setSyncStatusError('');
    setNtnKeyMsg({ text: '', kind: '' });
    setSyncMsg({ text: '', kind: '' });
    setDriveMsg({ text: '', kind: '' });
  };

  const applyKeysList = (list: IntegrationDto[]) => {
    const arr = Array.isArray(list) ? list : [];
    const ntn = arr.find((it) => it.provider === 'notion');

    if (ntn) {
      setNotionHasKey(true);
      setNotionKeyMeta({ hint: ntn.hint || '', date: (ntn.updatedAt || '').slice(0, 10) });
      const cfg = ntn.config || {};
      if (cfg.songsDb) setNtnSongsDb(String(cfg.songsDb));
      if (cfg.sessionsDb) setNtnSessionsDb(String(cfg.sessionsDb));
      setNtnNotesDb(cfg.notesDb ? String(cfg.notesDb) : '');
    } else {
      setNotionHasKey(false);
      setNotionKeyMeta(null);
      setNtnToken('');
      setNtnSongsDb('');
      setNtnSessionsDb('');
      setNtnNotesDb('');
    }

  };

  const loadSyncStatusForUid = async (uid: string) => {
    const mySeq = ++syncReqSeqRef.current;
    try {
      const s = await apiClient.notionSync.status();
      if (activeUid !== uid || mySeq !== syncReqSeqRef.current) return;
      setSyncState(s || { enabled: false, pending: 0, failed: 0 });
      setSyncStatusError('');
    } catch (e: any) {
      if (activeUid !== uid || mySeq !== syncReqSeqRef.current) return;
      setSyncStatusError(t('settings.syncLoadErr'));
      setSyncMsg({ text: (e && e.message) || t('settings.syncLoadErr'), kind: 'err' });
    }
  };

  useEffect(() => {
    resetAllUserFields();
    if (!activeUid) return;

    const myKeySeq = ++keysReqSeqRef.current;
    apiClient.integrations
      .list()
      .then((list) => {
        if (activeUid !== auth.getUser()?.id || myKeySeq !== keysReqSeqRef.current) return;
        applyKeysList(list);
      })
      .catch((e: any) => {
        if (activeUid !== auth.getUser()?.id || myKeySeq !== keysReqSeqRef.current) return;
        const msg = (e && e.message) || t('settings.keyLoadErr');
        setNtnKeyMsg({ text: msg, kind: 'err' });
      });

    void loadSyncStatusForUid(activeUid);
  }, [activeUid]);

  // 유료 계정(유예 중 포함 — /me tier가 유료)만 다음 지급·유예 끝 정보를 받는다
  const meTier = authState.me ? authState.me.tier || 'free' : '';
  useEffect(() => {
    if (!activeUid || !meTier || meTier === 'free') return;
    let alive = true;
    apiClient.credits
      .summary()
      .then((c) => {
        if (alive && activeUid === auth.getUser()?.id) setCreditSummary(c);
      })
      .catch(() => {
        /* 다음 지급 줄만 빠진다 */
      });
    return () => {
      alive = false;
    };
  }, [activeUid, meTier]);

  const aiAllowed = canUseAi(authState.me);
  const meCredits = (authState.me && authState.me.credits) || { monthly: 0, purchased: 0 };
  const kstDay = (iso: string | null | undefined): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(d);
  };
  const nextGrantText = (() => {
    if (!creditSummary || !(creditSummary.monthlyGrant > 0)) return '';
    const day = kstDay(creditSummary.nextGrantAt);
    return day ? t('settings.creditNext', { day, grant: creditSummary.monthlyGrant }) : '';
  })();
  // M1-3e 유예: 무료로 바꿨어도 주기 끝까지 Pro — 끝나는 날과 그때 사라질 월 지급분
  const graceText = (() => {
    const day = kstDay(creditSummary?.monthlyExpiresAt);
    if (!day) return '';
    const left = meCredits.monthly > 0 ? t('settings.creditGraceLoss', { left: meCredits.monthly }) : '';
    return t('settings.creditGraceChange', { day, left });
  })();

  // 프로필 및 쿼터 계산
  const email = (authState.me && authState.me.email) || (authState.user && authState.user.email) || '';
  const displayName = (authState.me && authState.me.displayName) || '';
  const nameSuffix = displayName && displayName !== email.split('@')[0] ? `(${displayName})` : '';
  const quota = (authState.me && authState.me.takeQuotaBytes) || 209715200;
  const used = (authState.me && authState.me.takeUsedBytes) || 0;
  const quotaText = `${(used / 1048576).toFixed(1)}MB / ${Math.round(quota / 1048576)}MB`;
  const isDrive = Boolean(authState.me && authState.me.storageProvider === 'drive');

  // 공식 노션 템플릿 URL
  const winCfg = typeof window !== 'undefined' ? window.ULEVELP_CONFIG : undefined;
  const templateHref =
    (winCfg && winCfg.notionTemplateUrl && safeUrl(winCfg.notionTemplateUrl)) || 'https://www.notion.com';

  // 실시간 동기화 상태 문자열
  const formatSyncText = (): string => {
    if (syncStatusError) return syncStatusError;
    if (!syncState.enabled) return t('settings.syncOff');
    let txt = t('settings.syncOn', { pending: syncState.pending || 0, failed: syncState.failed || 0 });
    const parts: string[] = [];
    if (syncState.lastPushAt) parts.push(t('settings.syncLastPush') + syncState.lastPushAt.slice(0, 19).replace('T', ' '));
    if (syncState.lastPullAt) parts.push(t('settings.syncLastPull') + syncState.lastPullAt.slice(0, 19).replace('T', ' '));
    if (parts.length > 0) txt += ` (${parts.join(', ')})`;
    return txt;
  };

  return (
    <AppShell variant="narrow" activeNav="settings" showThemeToggle>
      <div className={styles.headerBlock} data-align-group="col: left">
        <h1 className={`page-title ${styles.pageTitle}`}>Setting</h1>
        <p className={`page-sub ${styles.pageSub}`}>
          {t('settings.pageSub')}
        </p>
      </div>

      {/* 1. 계정 및 Google Drive 저장소 */}
      <section className={`set-sec ${styles.setSec}`} data-align-group="col: left; secs: right" id="account" aria-labelledby="hAccount">
        <h2 id="hAccount">{t('settings.secAccount')}</h2>
        <p id="accDesc">{t('settings.accDesc')}</p>

        <div id="accGuest" className={styles.row} hidden={signedIn}>
          <button
            className="pillBtn"
            type="button"
            id="btnLogin"
            hidden={embedded}
            onClick={async () => {
              setAccMsg({ text: '', kind: '' });
              try {
                await auth.signIn(window.location.href);
              } catch (e: any) {
                setAccMsg({ text: (e && e.message) || t('settings.loginFailed'), kind: 'err' });
              }
            }}
          >
            {t('settings.loginGoogle')}
          </button>
          <SafeLink
            className="pillBtn"
            id="btnLoginBlank"
            href="settings.html#account"
            target="_blank"
            rel="noopener"
            hidden={!embedded}
          >
            {t('settings.loginBlank')}
          </SafeLink>
        </div>

        <div className={styles.stack} id="accUser" hidden={!signedIn}>
          <p>
            {t('settings.accEmailLabel')} <b id="accEmail">{email}</b>{' '}
            <span id="accName" className="hint">
              {nameSuffix}
            </span>
          </p>
          <div className={styles.field} id="accQuota">
            <span className={styles.lab}>
              {t('settings.quotaTitle')} (<span id="quotaText">{quotaText}</span>)
            </span>
            <progress className={`tl-bar ${styles.quotaBar}`} id="quotaBar" max={quota} value={used} />
          </div>

          <div className={styles.panel} id="driveStoragePanel">
            <h3>{t('settings.driveTitle')}</h3>
            <p className="hint">
              {t('settings.driveHintPre')}<b>{t('settings.driveHintBold')}</b>{t('settings.driveHintPost')}
            </p>
            <p className="hint" id="driveProviderText">
              {authState.me
                ? isDrive
                  ? t('settings.driveUsing')
                  : t('settings.driveDefault')
                : ''}
            </p>
            <p className={`msg${driveMsg.kind ? ' ' + driveMsg.kind : ''}`} id="driveStatusMsg" role="status">
              {driveMsg.text}
            </p>
            <p className="msg err" id="driveConflictNotice" role="status" hidden={!syncState.enabled}>
              {t('settings.driveConflictNotice')}
            </p>
            <div className={styles.row}>
              <button
                className="pillBtn"
                type="button"
                id="btnDriveEnable"
                hidden={isDrive}
                disabled={busyDrive || syncState.enabled}
                onClick={async () => {
                  const generation = auth.getSessionGeneration();
                  setDriveMsg({ text: '', kind: '' });
                  setBusyDrive(true);
                  try {
                    await drive.enableDriveStorage();
                    if (generation !== auth.getSessionGeneration()) return;
                    setDriveMsg({ text: t('settings.driveEnableSuccess'), kind: 'ok' });
                    await auth.fetchMe();
                  } catch (err: any) {
                    if (generation !== auth.getSessionGeneration() || err?.name === 'AbortError') return;
                    setDriveMsg({
                      text: (err && err.message) || t('settings.driveEnableFail'),
                      kind: 'err',
                    });
                  } finally {
                    setBusyDrive(false);
                  }
                }}
              >
                {t('settings.driveEnableBtn')}
              </button>
              <button
                className="ghostBtn"
                type="button"
                id="btnDriveDisable"
                hidden={!isDrive}
                disabled={busyDrive}
                onClick={async () => {
                  const generation = auth.getSessionGeneration();
                  setDriveMsg({ text: '', kind: '' });
                  setBusyDrive(true);
                  try {
                    await drive.disableDriveStorage();
                    if (generation !== auth.getSessionGeneration()) return;
                    setDriveMsg({ text: t('settings.driveDisableSuccess'), kind: 'ok' });
                    await auth.fetchMe();
                  } catch (err: any) {
                    if (generation !== auth.getSessionGeneration() || err?.name === 'AbortError') return;
                    setDriveMsg({ text: (err && err.message) || t('settings.driveDisableFail'), kind: 'err' });
                  } finally {
                    setBusyDrive(false);
                  }
                }}
              >
                {t('settings.driveDisableBtn')}
              </button>
              <button
                className="ghostBtn"
                type="button"
                id="btnDriveMigrate"
                hidden={!isDrive}
                disabled={busyDrive || syncState.enabled}
                onClick={async () => {
                  if (!window.confirm(t('settings.driveMigrateConfirm'))) return;
                  setBusyDrive(true);
                  setDriveMsg({ text: t('settings.driveMigrateStart'), kind: '' });
                  try {
                    const res = await drive.migrateAllToDrive((p) => {
                      setDriveMsg({ text: t('settings.driveMigrateProgress', { current: p.current, total: p.total }), kind: '' });
                    });
                    setDriveMsg({
                      text: t('settings.driveMigrateDone', { migrated: res.migrated, skipped: res.skipped }),
                      kind: 'ok',
                    });
                    await auth.fetchMe();
                  } catch (err: any) {
                    setDriveMsg({ text: (err && err.message) || t('settings.driveMigrateFail'), kind: 'err' });
                  } finally {
                    setBusyDrive(false);
                  }
                }}
              >
                {t('settings.driveMigrateBtn')}
              </button>
            </div>
          </div>

          <div className={styles.row}>
            <button
              className="ghostBtn"
              type="button"
              id="btnLogout"
              disabled={busyAuth}
              onClick={async () => {
                setBusyAuth(true);
                try {
                  await auth.signOut();
                  setAccMsg({ text: t('settings.logoutSuccess'), kind: 'ok' });
                } catch (e: any) {
                  setAccMsg({ text: (e && e.message) || t('settings.logoutFail'), kind: 'err' });
                } finally {
                  setBusyAuth(false);
                }
              }}
            >
              {t('settings.logoutBtn')}
            </button>
          </div>

          <details>
            <summary>{t('settings.delAccSummary')}</summary>
            <div className={`${styles.stackTight} ${styles.detailsBody}`}>
              <p className="hint">
                {t('settings.delAccDesc')}
              </p>
              <label className={styles.field}>
                <span className={styles.lab}>
                  {t('settings.deleteConfirmPre')}<b>{t('settings.deleteConfirmWord')}</b>{t('settings.deleteConfirmPost')}
                </span>
                <input
                  className="inpField"
                  id="delConfirm"
                  placeholder={t('settings.deleteConfirmWord')}
                  autoComplete="off"
                  value={delConfirm}
                  onChange={(e) => setDelConfirm(e.target.value)}
                />
              </label>
              <div className={styles.row}>
                <button
                  className="ghostBtn"
                  type="button"
                  id="btnDeleteAcc"
                  disabled={busyAuth}
                  onClick={async () => {
                    if (delConfirm.trim() !== t('settings.deleteConfirmWord')) {
                      setAccMsg({ text: t('settings.deleteConfirmErr', { word: t('settings.deleteConfirmWord') }), kind: 'err' });
                      return;
                    }
                    setBusyAuth(true);
                    setAccMsg({ text: t('settings.delAccProgress'), kind: '' });
                    try {
                      await auth.deleteAccount(delConfirm.trim());
                      setDelConfirm('');
                      setAccMsg({ text: t('settings.delAccSuccess'), kind: 'ok' });
                    } catch (e: any) {
                      setAccMsg({ text: (e && e.message) || t('settings.delAccFail'), kind: 'err' });
                    } finally {
                      setBusyAuth(false);
                    }
                  }}
                >
                  {t('settings.delAccBtn')}
                </button>
              </div>
            </div>
          </details>
        </div>

        <p className={`msg${accMsg.kind ? ' ' + accMsg.kind : ''}`} id="accMsg" role="status">
          {accMsg.text}
        </p>
        <p className="hint">
          <SafeLink href="privacy.html">{t('settings.privacyLink')}</SafeLink>
        </p>
      </section>

      {/* 2. 데이터 백업 */}
      <section className={`set-sec ${styles.setSec}`} data-align-group="col: left; secs: right" id="nx" aria-labelledby="hNx">
        <h2 id="hNx">{t('settings.secNx')}</h2>
        <p>{t('settings.nxDesc')}</p>
        <div className={styles.panel}>
          <h3>{t('settings.nxExportTitle')}</h3>
          <p className="hint">
            {t('settings.nxExportDesc')}
          </p>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              id="chkExportAudio"
              checked={exportAudio}
              onChange={(e) => setExportAudio(e.target.checked)}
            />
            <span>{t('settings.nxExportAudio')}</span>
          </label>
          <div className={styles.row}>
            <button
              className="ghostBtn"
              type="button"
              id="btnExportZip"
              disabled={busyNx}
              onClick={async () => {
                if (!activeUid) {
                  setNxMsg({ text: t('settings.nxLoginReq'), kind: 'err' });
                  return;
                }
                const reqUid = activeUid;
                setBusyNx(true);
                setNxMsg({ text: t('settings.nxExportProgress'), kind: '' });
                try {
                  const res = await apiClient.nx.exportZip(exportAudio);
                  if (auth.getUser()?.id !== reqUid) return;
                  const url = URL.createObjectURL(res.blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = res.filename || 'ULeveLP-export.zip';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  setNxMsg({ text: t('settings.nxExportDone'), kind: 'ok' });
                } catch (e: any) {
                  if (auth.getUser()?.id !== reqUid) return;
                  setNxMsg({ text: (e && e.message) || t('settings.nxExportFail'), kind: 'err' });
                } finally {
                  setBusyNx(false);
                }
              }}
            >
              {t('settings.nxExportBtn')}
            </button>
          </div>
        </div>

        <p className={`msg${nxMsg.kind ? ' ' + nxMsg.kind : ''}`} id="nxMsg" role="status">
          {nxMsg.text}
        </p>
      </section>

      {/* 3. AI 분석 크레딧 (M1-3c — Gemini는 서버 키 + 크레딧, BYOK 칸 삭제) */}
      <section className={`set-sec ${styles.setSec}`} data-align-group="col: left; secs: right" id="credits" aria-labelledby="hCredits">
        <h2 id="hCredits">{t('settings.secCredits')}</h2>
        <p>{t('settings.creditsDesc')}</p>
        <div className={styles.panel}>
          <div className={styles.cardHead}>
            <h3 data-align-group="creditHead: center-y">{t('settings.creditsRemaining')}</h3>
            {signedIn && meTier && (
              <span className={`${styles.badge}${aiAllowed ? ' ' + styles.badgeOk : ''}`} id="creditTier" data-align-group="creditHead: center-y">
                {tierLabel(meTier)}
              </span>
            )}
          </div>
          {!signedIn ? (
            <p className="hint" id="creditMsg">
              {t('settings.creditsLoginReq')}
            </p>
          ) : !aiAllowed ? (
            <p className="hint" id="creditMsg">
              {t('settings.creditsProOnly')}
            </p>
          ) : (
            <>
              <p className={styles.creditTotalLine}>
                <b id="creditTotal" className={styles.creditTotal}>
                  {meCredits.monthly + meCredits.purchased}
                </b>{' '}
                {t('settings.creditsUnit')}
              </p>
              <p className="hint" id="creditBuckets">
                {t('settings.creditsBuckets', { monthly: meCredits.monthly, purchased: meCredits.purchased })}
              </p>
              {nextGrantText && (
                <p className="hint" id="creditNext">
                  {nextGrantText}
                </p>
              )}
              {graceText && (
                <p className="hint" id="creditExpire">
                  {graceText}
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* 3-b. 커뮤니티 (M2-23 D5) */}
      {signedIn ? (
        <section
          className={`set-sec ${styles.setSec}`}
          data-align-group="col: left; secs: right"
          id="community"
          aria-labelledby="hCommunity"
        >
          <h2 id="hCommunity">{t('community.settingsTitle')}</h2>
          <div className={styles.panel}>
            <PublicNameForm
              me={authState.me}
              inputId="settingsPublicNameInput"
              submitId="settingsPublicNameSave"
            />
          </div>
          <div className={styles.panel}>
            <div className={commStyles.commSwitchRow}>
              <div className={commStyles.commRowInfo} data-align-group="commSw:center-y@481">
                <b className={styles.lab}>{t('community.autosyncSetting')}</b>
                <p>{t('community.autosyncHint')}</p>
              </div>
              <button
                type="button"
                id="commAutosync"
                role="switch"
                aria-checked={currentAutosync}
                disabled={!canCommunityWrite}
                className={commStyles.switchBtn}
                data-align-group="commSw:center-y@481"
                onClick={() => void handleToggleAutosync()}
              >
                {t('community.autoSync')}
              </button>
            </div>
            <div className={commStyles.commSwitchRow}>
              <div className={commStyles.commRowInfo} data-align-group="commSw2:center-y@481">
                <b className={styles.lab}>{t('community.logSetting')}</b>
                <p>{t('community.logHint')}</p>
              </div>
              <button
                type="button"
                id="commPracticeLog"
                role="switch"
                aria-checked={currentPracticeLog}
                disabled={!canCommunityWrite || !hasPublicName}
                className={commStyles.switchBtn}
                data-align-group="commSw2:center-y@481"
                onClick={() => void handleTogglePracticeLog()}
              >
                {t('community.public')}
              </button>
            </div>
            {!canCommunityWrite ? (
              <p id="commProNotice" className="hint">
                {t('community.proOnly')}
              </p>
            ) : !hasPublicName ? (
              <p id="commNameRequiredNotice" className="hint">
                {t('community.err.nameRequired')}
              </p>
            ) : null}
            {commErr ? (
              <p id="commErrMsg" role="alert" className="msg err">
                {t(commErr.key as any, commErr.vars)}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 4. 화면 모드 */}
      <section className={`set-sec ${styles.setSec}`} data-align-group="col: left; secs: right" id="screen" aria-labelledby="hScreen">
        <h2 id="hScreen">{t('settings.secScreen')}</h2>
        <div className={`seg-pill ${styles.segPill}`} role="group" aria-label={t('settings.screenAria')}>
          {(
            [
              ['', 'settings.screenThemeSys'],
              ['light', 'settings.screenThemeLight'],
              ['dark', 'settings.screenThemeDark'],
            ] as const
          ).map(([val, labelKey]) => (
            <button
              key={val || 'sys'}
              type="button"
              className={styles.segBtn}
              data-theme={val}
              aria-pressed={themeVal === val}
              onClick={() => {
                setTheme(val);
                setThemeVal(val);
              }}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
      </section>

      {/* 5. 언어 설정 */}
      <section className={`set-sec ${styles.setSec}`} data-align-group="col: left; secs: right" id="langSec" aria-labelledby="hLang">
        <h2 id="hLang">{t('settings.secLang')}</h2>
        <p id="langDesc">{t('settings.langDesc')}</p>
        <div className={`seg-pill ${styles.segPill}`} id="langSelect" role="group" aria-label={t('settings.langAria')}>
          {(['auto', 'ko', 'en', 'ja'] as const).map((code) => (
            <button
              key={code}
              type="button"
              className={`seg-btn ${styles.segBtn}`}
              data-lang={code}
              aria-pressed={langChoice === code}
              onClick={() => handleLangChange(code)}
            >
              {t(LANG_LABEL_KEY[code])}
            </button>
          ))}
        </div>
      </section>

      {/* 6. 고급 설정 — 노션 연동(2026-11-05 중단·동결: 새 기능 없음, 계획/앱_명세.md §5). 기본 접힘 */}
      <section className={`set-sec ${styles.setSec}`} data-align-group="col: left; secs: right" id="advanced" aria-labelledby="hAdvanced">
        <details
          className={styles.advanced}
          id="advNotion"
          open={advOpen}
          onToggle={(e) => setAdvOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary id="hAdvanced">{t('settings.advSummary')}</summary>
          <div className={styles.advBody}>
            <p className="hint">
              {t('settings.advDesc')}
            </p>
            <div className={styles.panel}>
              <h3>{t('settings.templateTitle')}</h3>
              <div className={styles.row}>
                <SafeLink className="ghostBtn" id="btnNotionTemplate" href={templateHref} external>
                  {t('settings.templateCloneBtn')}
                </SafeLink>
              </div>
            </div>
            {/* 노션 연동 카드 */}
            <div className={styles.panel} id="notion">
              <div className={styles.cardHead}>
                <h3>{t('settings.ntnCardTitle')}</h3>
                <span className={`${styles.badge}${notionHasKey ? ' ' + styles.badgeOk : ''}`} id="notionKeyStatus">
                  {notionStatusText}
                </span>
              </div>
              <ol className={`hint ${styles.guide}`} id="ntnGuide">
                <li>
                  <SafeLink href={templateHref} external>{t('settings.ntnGuideCloneLink')}</SafeLink>{t('settings.ntnGuideClonePost')}
                </li>
                <li>
                  <SafeLink href="https://www.notion.so/my-integrations" external>notion.so/my-integrations</SafeLink>{t('settings.ntnGuideTokenPost')}
                </li>
                <li>{t('settings.ntnGuideConnectPre')}<b>{t('settings.ntnGuideConnectDots')}</b>{t('settings.ntnGuideConnectArrow')}<b>{t('settings.ntnGuideConnectWord')}</b>{t('settings.ntnGuideConnectPost')}</li>
                <li>
                  {t('settings.ntnGuideDbPre')}<b>{t('settings.ntnGuideDbSongs')}</b>{t('settings.ntnGuideDbDotOne')}<b>{t('settings.ntnGuideDbSessions')}</b>{t('settings.ntnGuideDbDotTwo')}<b>{t('settings.ntnGuideDbNotes')}</b>{t('settings.ntnGuideDbPost')}
                </li>
                <li><b>{t('settings.ntnGuideVerifySave')}</b>{t('settings.ntnGuideVerifyArrow')}<b>{t('settings.ntnGuideVerifyCheck')}</b>{t('settings.ntnGuideVerifyPost')}</li>
              </ol>
              <label className={styles.field}>
                <span className={styles.lab}>{t('settings.ntnTokenLab')}</span>
                <input
                  className="inpField"
                  id="ntnToken"
                  type="password"
                  placeholder={t('settings.ntnTokenPh')}
                  autoComplete="off"
                  value={ntnToken}
                  onChange={(e) => setNtnToken(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.lab}>{t('settings.ntnSongsDbLab')}</span>
                <input
                  className="inpField"
                  id="ntnSongsDb"
                  type="text"
                  placeholder={t('settings.ntnSongsDbPh')}
                  autoComplete="off"
                  value={ntnSongsDb}
                  onChange={(e) => setNtnSongsDb(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.lab}>{t('settings.ntnSessionsDbLab')}</span>
                <input
                  className="inpField"
                  id="ntnSessionsDb"
                  type="text"
                  placeholder={t('settings.ntnSessionsDbPh')}
                  autoComplete="off"
                  value={ntnSessionsDb}
                  onChange={(e) => setNtnSessionsDb(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.lab}>{t('settings.ntnNotesDbLab')}</span>
                <input
                  className="inpField"
                  id="ntnNotesDb"
                  type="text"
                  placeholder={t('settings.ntnNotesDbPh')}
                  autoComplete="off"
                  value={ntnNotesDb}
                  onChange={(e) => setNtnNotesDb(e.target.value)}
                />
              </label>
              <div className={styles.row}>
                <button
                  className="pillBtn"
                  type="button"
                  id="btnSaveNotionKey"
                  disabled={busyNtnKey}
                  onClick={async () => {
                    if (!activeUid) {
                      setNtnKeyMsg({ text: t('settings.ntnSaveLoginReq'), kind: 'err' });
                      return;
                    }
                    const reqUid = activeUid;
                    setBusyNtnKey(true);
                    setNtnKeyMsg({ text: t('settings.ntnSaving'), kind: '' });
                    keysReqSeqRef.current++;
                    try {
                      const dto = await apiClient.integrations.saveNotion({
                        token: ntnToken.trim() || null,
                        songsDb: notionDbIdFromInput(ntnSongsDb),
                        sessionsDb: notionDbIdFromInput(ntnSessionsDb),
                        notesDb: notionDbIdFromInput(ntnNotesDb) || null,
                      });
                      if (auth.getUser()?.id !== reqUid) return;
                      setNtnToken('');
                      if (dto) {
                        setNotionHasKey(true);
                        setNotionKeyMeta({ hint: dto.hint || '', date: (dto.updatedAt || '').slice(0, 10) });
                        if (dto.config) {
                          if (dto.config.songsDb) setNtnSongsDb(String(dto.config.songsDb));
                          if (dto.config.sessionsDb) setNtnSessionsDb(String(dto.config.sessionsDb));
                          setNtnNotesDb(dto.config.notesDb ? String(dto.config.notesDb) : '');
                        }
                      }
                      setNtnKeyMsg({ text: t('settings.ntnSaveSuccess'), kind: 'ok' });
                      void loadSyncStatusForUid(reqUid);
                    } catch (e: any) {
                      if (auth.getUser()?.id !== reqUid) return;
                      setNtnKeyMsg({ text: (e && e.message) || t('settings.ntnSaveFail'), kind: 'err' });
                    } finally {
                      setBusyNtnKey(false);
                    }
                  }}
                >
                  {t('settings.ntnSaveBtn')}
                </button>
                <button
                  className="ghostBtn"
                  type="button"
                  id="btnCheckNotionKey"
                  disabled={busyNtnKey}
                  onClick={async () => {
                    if (!activeUid) {
                      setNtnKeyMsg({ text: t('settings.ntnCheckLoginReq'), kind: 'err' });
                      return;
                    }
                    const reqUid = activeUid;
                    setBusyNtnKey(true);
                    setNtnKeyMsg({ text: t('settings.ntnChecking'), kind: '' });
                    keysReqSeqRef.current++;
                    try {
                      const r = await apiClient.integrations.check('notion');
                      if (auth.getUser()?.id !== reqUid) return;
                      const notesPart = r.notesTitle ? ` · ${r.notesTitle}` : '';
                      setNtnKeyMsg({
                        text: t('settings.ntnCheckSuccess', {
                          songs: r.songsTitle || '',
                          sessions: r.sessionsTitle || '',
                          notes: notesPart,
                          max: r.maxUploadMB || 5,
                        }),
                        kind: 'ok',
                      });
                    } catch (e: any) {
                      if (auth.getUser()?.id !== reqUid) return;
                      setNtnKeyMsg({ text: (e && e.message) || t('settings.ntnCheckFail'), kind: 'err' });
                    } finally {
                      setBusyNtnKey(false);
                    }
                  }}
                >
                  {t('settings.ntnCheckBtn')}
                </button>
                <button
                  className="ghostBtn"
                  type="button"
                  id="btnDelNotionKey"
                  disabled={busyNtnKey}
                  onClick={async () => {
                    if (!activeUid) {
                      setNtnKeyMsg({ text: t('settings.ntnDelLoginReq'), kind: 'err' });
                      return;
                    }
                    const reqUid = activeUid;
                    setBusyNtnKey(true);
                    setNtnKeyMsg({ text: t('settings.ntnDelProgress'), kind: '' });
                    keysReqSeqRef.current++;
                    try {
                      await apiClient.integrations.remove('notion');
                      if (auth.getUser()?.id !== reqUid) return;
                      setNotionHasKey(false);
                      setNotionKeyMeta(null);
                      setNtnToken('');
                      setNtnSongsDb('');
                      setNtnSessionsDb('');
                      setNtnNotesDb('');
                      setSyncState({ enabled: false, pending: 0, failed: 0 });
                      setNtnKeyMsg({ text: t('settings.ntnDelSuccess'), kind: 'ok' });
                      void loadSyncStatusForUid(reqUid);
                    } catch (e: any) {
                      if (auth.getUser()?.id !== reqUid) return;
                      setNtnKeyMsg({ text: (e && e.message) || t('settings.ntnDelFail'), kind: 'err' });
                    } finally {
                      setBusyNtnKey(false);
                    }
                  }}
                >
                  {t('settings.ntnDelBtn')}
                </button>
              </div>
              <p className={`msg${ntnKeyMsg.kind ? ' ' + ntnKeyMsg.kind : ''}`} id="ntnKeyMsg" role="status">
                {ntnKeyMsg.text}
              </p>

              <div className={styles.stackTight} id="notionSyncPanel">
                <p className="hint" id="syncStatusText">
                  {formatSyncText()}
                </p>
                <p className="hint" id="syncErrorText" hidden={!syncState.lastError}>
                  {syncState.lastError ? t('settings.syncErrLabel', { err: syncState.lastError }) : ''}
                </p>
                <div className={styles.row}>
                  <button
                    className="pillBtn"
                    type="button"
                    id="btnSyncEnable"
                    hidden={syncState.enabled}
                    disabled={busySync}
                    onClick={async () => {
                      if (!activeUid) {
                        setSyncMsg({ text: t('settings.syncLoginReq'), kind: 'err' });
                        return;
                      }
                      const reqUid = activeUid;
                      setBusySync(true);
                      setSyncMsg({ text: t('settings.syncEnabling'), kind: '' });
                      try {
                        syncReqSeqRef.current++;
                        const res = await apiClient.notionSync.enable();
                        if (auth.getUser()?.id !== reqUid) return;
                        const quotaPart = res.skippedTakesByQuota
                          ? t('settings.syncQuotaSkipped', { n: res.skippedTakesByQuota })
                          : '';
                        setSyncMsg({
                          text: t('settings.syncEnableDone', {
                            songs: res.importedSongs,
                            sessions: res.importedSessions,
                            takes: res.importedTakes,
                            quota: quotaPart,
                          }),
                          kind: 'ok',
                        });
                        await loadSyncStatusForUid(reqUid);
                      } catch (e: any) {
                        if (auth.getUser()?.id !== reqUid) return;
                        setSyncMsg({ text: (e && e.message) || t('settings.syncEnableFail'), kind: 'err' });
                      } finally {
                        setBusySync(false);
                      }
                    }}
                  >
                    {t('settings.syncEnableBtn')}
                  </button>
                  <button
                    className="ghostBtn"
                    type="button"
                    id="btnSyncDisable"
                    hidden={!syncState.enabled}
                    disabled={busySync}
                    onClick={async () => {
                      if (!activeUid) {
                        setSyncMsg({ text: t('settings.syncLoginReq'), kind: 'err' });
                        return;
                      }
                      const reqUid = activeUid;
                      setBusySync(true);
                      setSyncMsg({ text: t('settings.syncDisabling'), kind: '' });
                      try {
                        syncReqSeqRef.current++;
                        await apiClient.notionSync.disable();
                        if (auth.getUser()?.id !== reqUid) return;
                        setSyncMsg({ text: t('settings.syncDisableDone'), kind: 'ok' });
                        await loadSyncStatusForUid(reqUid);
                      } catch (e: any) {
                        if (auth.getUser()?.id !== reqUid) return;
                        setSyncMsg({ text: (e && e.message) || t('settings.syncDisableFail'), kind: 'err' });
                      } finally {
                        setBusySync(false);
                      }
                    }}
                  >
                    {t('settings.syncDisableBtn')}
                  </button>
                  <button
                    className="ghostBtn"
                    type="button"
                    id="btnSyncPull"
                    disabled={busySync}
                    onClick={async () => {
                      if (!activeUid) {
                        setSyncMsg({ text: t('settings.syncLoginReq'), kind: 'err' });
                        return;
                      }
                      const reqUid = activeUid;
                      setBusySync(true);
                      setSyncMsg({ text: t('settings.syncPulling'), kind: '' });
                      try {
                        syncReqSeqRef.current++;
                        const res = await apiClient.notionSync.pull();
                        if (auth.getUser()?.id !== reqUid) return;
                        setSyncMsg({
                          text: t('settings.syncPullDone', { songs: res.updatedSongs, sessions: res.updatedSessions }),
                          kind: 'ok',
                        });
                        await loadSyncStatusForUid(reqUid);
                      } catch (e: any) {
                        if (auth.getUser()?.id !== reqUid) return;
                        setSyncMsg({ text: (e && e.message) || t('settings.syncPullFail'), kind: 'err' });
                      } finally {
                        setBusySync(false);
                      }
                    }}
                  >
                    {t('settings.syncPullBtn')}
                  </button>
                  <button
                    className="ghostBtn"
                    type="button"
                    id="btnSyncPush"
                    disabled={busySync}
                    onClick={async () => {
                      if (!activeUid) {
                        setSyncMsg({ text: t('settings.syncLoginReq'), kind: 'err' });
                        return;
                      }
                      const reqUid = activeUid;
                      setBusySync(true);
                      setSyncMsg({ text: t('settings.syncPushing'), kind: '' });
                      try {
                        syncReqSeqRef.current++;
                        const res = await apiClient.notionSync.push();
                        if (auth.getUser()?.id !== reqUid) return;
                        setSyncMsg({
                          text: t('settings.syncPushDone', { processed: res.processed, failed: res.failed }),
                          kind: 'ok',
                        });
                        await loadSyncStatusForUid(reqUid);
                      } catch (e: any) {
                        if (auth.getUser()?.id !== reqUid) return;
                        setSyncMsg({ text: (e && e.message) || t('settings.syncPushFail'), kind: 'err' });
                      } finally {
                        setBusySync(false);
                      }
                    }}
                  >
                    {t('settings.syncPushBtn')}
                  </button>
                </div>
                <p className={`msg${syncMsg.kind ? ' ' + syncMsg.kind : ''}`} id="syncMsg" role="status">
                  {syncMsg.text}
                </p>
              </div>
            </div>

            <div className={styles.panel}>
              <h3>{t('settings.nxImportTitle')}</h3>
              <p className="hint">{t('settings.nxImportDesc')}</p>
              <label className={styles.field}>
                <span className={styles.lab}>{t('settings.nxImportLab')}</span>
                <input
                  ref={fileInputRef}
                  className={styles.fileInput}
                  type="file"
                  id="inpImportZip"
                  accept=".zip,application/zip"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
              </label>
              <div className={styles.row}>
                <button
                  className="ghostBtn"
                  type="button"
                  id="btnPreviewZip"
                  disabled={busyNx}
                  onClick={async () => {
                    if (!activeUid) {
                      setNxMsg({ text: t('settings.nxImportLoginReq'), kind: 'err' });
                      return;
                    }
                    if (!importFile) {
                      setNxMsg({ text: t('settings.nxImportSelectZip'), kind: 'err' });
                      return;
                    }
                    const reqUid = activeUid;
                    setBusyNx(true);
                    setNxMsg({ text: t('settings.nxImportAnalyzing'), kind: '' });
                    try {
                      const r = await apiClient.nx.previewNotionZip(importFile);
                      if (auth.getUser()?.id !== reqUid) return;
                      setPreviewToken(r.previewToken);
                      const errSuffix =
                        Array.isArray(r.errors) && r.errors.length > 0 ? t('settings.nxImportErrCount', { count: r.errors.length }) : '';
                      setPreviewSummary(
                        t('settings.nxImportSummary', {
                          newSongs: r.newSongs || 0,
                          updatedSongs: r.updatedSongs || 0,
                          sessions: r.sessions || 0,
                          takes: r.takes || 0,
                          errSuffix,
                        })
                      );
                      const rows: Array<{ text: string; isErr?: boolean }> = [];
                      if (Array.isArray(r.songsSample)) {
                        r.songsSample.forEach((s: any) => {
                          const tag = s.isNew ? t('settings.nxImportNewTag') : t('settings.nxImportUpdateTag');
                          rows.push({
                            text: `${tag}${s.title || t('settings.nxImportUntitled')}${s.artist ? ' · ' + s.artist : ''}`,
                          });
                        });
                      }
                      if (Array.isArray(r.errors)) {
                        r.errors.forEach((er: any) => {
                          const rowPart = er.row != null ? t('settings.nxImportRowSuffix', { row: er.row }) : '';
                          rows.push({
                            text: `${t('settings.nxImportErrTag')}${er.file || t('settings.nxImportDefaultFile')} ${rowPart}${er.reason || ''}`,
                            isErr: true,
                          });
                        });
                      }
                      setPreviewItems(rows);
                      setNxMsg({ text: '', kind: '' });
                    } catch (e: any) {
                      if (auth.getUser()?.id !== reqUid) return;
                      setPreviewToken(null);
                      setPreviewItems([]);
                      setNxMsg({ text: (e && e.message) || t('settings.nxImportPreviewFail'), kind: 'err' });
                    } finally {
                      setBusyNx(false);
                    }
                  }}
                >
                  {t('settings.nxImportPreviewBtn')}
                </button>
              </div>

              <div className={styles.previewBox} id="nxPreviewBox" hidden={!previewToken}>
                <p className={styles.previewSummary} id="nxPreviewSummary">
                  {previewSummary}
                </p>
                <ul className={styles.previewList} id="nxPreviewList">
                  {previewItems.map((it, idx) => (
                    <li key={idx} className={it.isErr ? styles.previewItemErr : undefined}>
                      {it.text}
                    </li>
                  ))}
                </ul>
                <div className={styles.row}>
                  <button
                    className="pillBtn"
                    type="button"
                    id="btnConfirmZip"
                    disabled={busyNx}
                    onClick={async () => {
                      if (!previewToken) {
                        setNxMsg({ text: t('settings.nxImportNoPreview'), kind: 'err' });
                        return;
                      }
                      const reqUid = activeUid;
                      setBusyNx(true);
                      setNxMsg({ text: t('settings.nxImportApplying'), kind: '' });
                      try {
                        const r = await apiClient.nx.confirmNotionZip(previewToken);
                        if (auth.getUser()?.id !== reqUid) return;
                        setNxMsg({
                          text: t('settings.nxImportDone', {
                            created: r.createdSongs || 0,
                            updated: r.updatedSongs || 0,
                            sessions: r.upsertedSessions || 0,
                            takes: r.importedTakes || 0,
                          }),
                          kind: 'ok',
                        });
                        setPreviewToken(null);
                        setPreviewItems([]);
                        setImportFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      } catch (e: any) {
                        if (auth.getUser()?.id !== reqUid) return;
                        setNxMsg({ text: (e && e.message) || t('settings.nxImportConfirmFail'), kind: 'err' });
                      } finally {
                        setBusyNx(false);
                      }
                    }}
                  >
                    {t('settings.nxImportConfirmBtn')}
                  </button>
                  <button
                    className="ghostBtn"
                    type="button"
                    id="btnCancelZip"
                    disabled={busyNx}
                    onClick={() => {
                      setPreviewToken(null);
                      setPreviewItems([]);
                      setNxMsg({ text: t('settings.nxImportCancelled'), kind: '' });
                    }}
                  >
                    {t('settings.nxImportCancelBtn')}
                  </button>
                </div>
              </div>
            </div>

          <div className={styles.panel} id="links">
            <h3 id="hLinks">{t('settings.linksTitle')}</h3>
            <p>
              {t('settings.linksDescPre')}<b>{t('settings.linksDescBold')}</b>{t('settings.linksDescPost')}
            </p>
            <label className={styles.field}>
              <span className={styles.lab}>{t('settings.linksPracticeLab')}</span>
              <input
                className="inpField"
                id="nlPractice"
                type="url"
                placeholder="https://www.notion.so/…"
                autoComplete="off"
                value={nlPractice}
                onChange={(e) => setNlPractice(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.lab}>{t('settings.linksNotesLab')}</span>
              <input
                className="inpField"
                id="nlNotes"
                type="url"
                placeholder="https://www.notion.so/…"
                autoComplete="off"
                value={nlNotes}
                onChange={(e) => setNlNotes(e.target.value)}
              />
            </label>
            <div className={styles.row}>
              <button
                className="ghostBtn"
                type="button"
                id="nlSave"
                onClick={() => {
                  raw.set('ulp:notion-practice', nlPractice.trim());
                  raw.set('ulp:notion-notes', nlNotes.trim());
                  setNlMsg(t('settings.linksSaved'));
                }}
              >
                {t('settings.linksSaveBtn')}
              </button>
            </div>
            <p className={`msg${nlMsg ? ' ok' : ''}`} id="nlMsg" role="status">
              {nlMsg}
            </p>
          </div>

          </div>
        </details>
      </section>

      {/* 7. 운영 — owner만(M2-4, 권한 판정은 서버 /admin). 기본 접힘 */}
      {authState.me && authState.me.role === 'owner' ? <OpsPanel /> : null}
    </AppShell>
  );
}

export default SettingsPage;
