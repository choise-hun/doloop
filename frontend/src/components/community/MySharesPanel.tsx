// frontend/src/components/community/MySharesPanel.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  apiClient,
  type CategoryDto,
  type ShareSummaryDto,
} from '../../lib/apiClient';
import { auth, useAuth, type MeProfile } from '../../lib/auth';
import { communityErrorKey } from '../../lib/community.mts';
import { t, type I18nKey } from '../../lib/i18n.mts';
import styles from './Community.module.css';

interface ShareRowState {
  cat: CategoryDto;
  share: ShareSummaryDto | null;
  titleInput: string;
  failed?: boolean;
}

export interface MySharesPanelProps {
  me: MeProfile | null;
  onRequireName?: () => void;
}

export function MySharesPanel({ me, onRequireName }: MySharesPanelProps) {
  useAuth(); // COMMUNITY also needs same-uid session generation changes.
  const identityNow = () => `${auth.getUser()?.id ?? ''}:${auth.getSessionGeneration()}`;
  const identity = identityNow();
  const [owner, setOwner] = useState(identity);
  const [rows, setRows] = useState<ShareRowState[]>([]);
  const [err, setErr] = useState<{ key: string; vars?: Record<string, string> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [, renderBusy] = useState(0);
  const busy = useRef(new Map<string, AbortController>());
  const query = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const mounted = useRef(false);
  const valid = () => mounted.current && identityNow() === identity && auth.getMe()?.id === me?.id;
  const normalize = (share: ShareSummaryDto | null) => share && auth.getMe()?.shareAutosync === false
    ? { ...share, autoSync: false } : share;

  useEffect(() => {
    mounted.current = true;
    const cancel = () => {
      ++seq.current;
      query.current?.abort();
      busy.current.forEach(controller => controller.abort());
      busy.current.clear();
    };
    const off = auth.onChange(() => { if (identityNow() !== identity) cancel(); });
    return () => { mounted.current = false; off(); cancel(); };
  }, [identity]);

  useEffect(() => {
    if (!valid() || !me?.id || busy.current.size) return;
    const my = ++seq.current;
    query.current?.abort();
    const controller = new AbortController();
    query.current = controller;
    const current = () => valid() && my === seq.current && !controller.signal.aborted;
    setOwner(identity);
    setLoading(true);
    if (owner !== identity) { setRows([]); setErr(null); }
    void (async () => {
      try {
        const cats = await apiClient.categories.list(controller.signal);
        if (!current()) return;
        const loaded = await Promise.all(cats.map(async cat => {
          try {
            const res = await apiClient.categories.getShare(cat.id, controller.signal);
            return { cat, share: normalize(res.share), titleInput: res.share?.title || cat.name };
          } catch {
            return { cat, share: null, titleInput: cat.name, failed: true };
          }
        }));
        if (current()) setRows(previous => loaded.map(row => {
          const old = previous.find(old => old.cat.id === row.cat.id);
          return { ...row, titleInput: old && !old.failed ? old.titleInput : row.titleInput };
        }));
      } catch { if (current()) setErr({ key: 'home.catLoadFailed' }); }
      finally { if (current()) setLoading(false); }
    })();
    return () => controller.abort();
  }, [identity, me?.id, me?.limits?.communityWrite, me?.publicName, me?.shareAutosync, retry]);

  function patchRow(catId: string, patch: Partial<ShareRowState>) {
    setRows(prev => prev.map(row => row.cat.id === catId ? { ...row, ...patch } : row));
  }

  async function mutate(row: ShareRowState, kind: 'public' | 'auto' | 'republish') {
    if (!valid() || row.failed || busy.current.has(row.cat.id)) return;
    const nextPublic = !row.share?.isPublic;
    setErr(null);
    if ((kind !== 'public' || nextPublic) && !me?.limits?.communityWrite) {
      setErr({ key: 'community.err.upgrade' }); return;
    }
    if (kind !== 'public' && !row.share?.isPublic) return;
    const controller = new AbortController();
    busy.current.set(row.cat.id, controller);
    ++seq.current;
    query.current?.abort();
    setLoading(false);
    renderBusy(n => n + 1);
    const current = () => valid() && !controller.signal.aborted && busy.current.get(row.cat.id) === controller;
    const previous = row.share;
    const title = row.titleInput.trim() || row.cat.name;
    if (kind === 'public') patchRow(row.cat.id, { share: previous ? { ...previous, isPublic: nextPublic, title } : {
      folderId: `opt-${row.cat.id}`, categoryId: row.cat.id, title, isPublic: nextPublic, autoSync: false,
      hidden: false, itemCount: row.cat.songCount, likeCount: 0, cloneCount: 0, publishedAt: null, publicName: me?.publicName ?? null,
    } });
    if (kind === 'auto' && previous) patchRow(row.cat.id, { share: { ...previous, autoSync: !(previous.autoSync && me?.shareAutosync !== false) } });
    try {
      const res = kind === 'republish'
        ? await apiClient.categories.republish(row.cat.id, title, controller.signal)
        : await apiClient.categories.setShare(row.cat.id, kind === 'public'
          ? nextPublic ? { isPublic: true, title } : { isPublic: false }
          : { isPublic: true, autoSync: !(previous?.autoSync && me?.shareAutosync !== false) }, controller.signal);
      if (current()) patchRow(row.cat.id, { share: normalize(res.share) });
    } catch (e) {
      if (!current()) return;
      patchRow(row.cat.id, { share: normalize(previous) });
      const error = communityErrorKey(e);
      // INVALID_INPUT is a folder-title failure, not a public-name format error.
      const status = e && typeof e === 'object' && 'status' in e ? e.status : null;
      const code = e && typeof e === 'object' && 'code' in e ? e.code : null;
      setErr(status === 404 ? { key: 'folder.err.gone' } : code === 'INVALID_INPUT' ? { key: 'community.err.generic' } : error);
      if (error.key === 'community.err.nameRequired') onRequireName?.();
    } finally {
      if (current()) {
        busy.current.delete(row.cat.id);
        renderBusy(n => n + 1);
      }
    }
  }

  const visibleRows = owner === identity ? rows : [];
  const visibleErr = owner === identity ? err : null;
  if (!me?.id || auth.getUser()?.id !== me.id) return null;

  return (
    <section id="mySharesPanel" className={styles.sharesPanel} aria-labelledby="mySharesTitle">
      <h3 id="mySharesTitle" className={styles.sharesTitle}>
        {t('community.myShares')}
      </h3>

      {visibleErr ? (
        <p id="mySharesErr" role="alert" className="msg err">
          {t(visibleErr.key as I18nKey, visibleErr.vars)}
        </p>
      ) : null}

      {loading || owner !== identity || (!visibleErr && !visibleRows.length) ?
        <p id="mySharesStatus" role="status" aria-live="polite">{t(loading || owner !== identity ? 'home.loading' : 'home.catEmpty')}</p> : null}
      {visibleErr || visibleRows.some(row => row.failed) ? <button id="mySharesRetry" type="button" className="ghostBtn"
        disabled={loading || busy.current.size > 0} onClick={() => { setErr(null); setRetry(n => n + 1); }}>{t('episode.retry')}</button> : null}
      {!loading && !visibleErr && !visibleRows.length ? <a className="ghostBtn" href="index.html">{t('nav.home')}</a> : null}
      <div className={styles.sharesList}>
        {visibleRows.map((row, idx) => {
          const disabled = Boolean(row.failed || busy.current.has(row.cat.id));
          const isPublic = Boolean(row.share?.isPublic);
          const isAutoSync = Boolean(
            isPublic && row.share?.autoSync && me?.shareAutosync !== false,
          );
          const isHidden = Boolean(row.share?.hidden);
          const swGroup = idx === 0 ? 'shareSw:center-y@481' : `shareSw${idx}:center-y@481`;

          return (
            <div
              key={row.cat.id}
              className={styles.shareRow}
              data-share-row={row.cat.id}
            >
              <div className={styles.shareRowMain} data-align-group={swGroup}>
                <div className={styles.shareCatHead}>
                  <span className={styles.shareCatName}>{row.cat.name}</span>
                  {isHidden ? (
                    <span className={styles.hiddenBadge}>{t('community.hidden')}</span>
                  ) : null}
                </div>
                {row.failed ? <p role="alert">{t('community.err.generic')}</p> : null}
                <input
                  type="text"
                  className={styles.shareTitleInput}
                  aria-label={t('community.shareTitle')}
                  value={row.titleInput}
                  maxLength={20}
                  disabled={disabled}
                  onChange={(e) => patchRow(row.cat.id, { titleInput: e.target.value })}
                />
              </div>

              <div className={styles.shareRowSwitches} data-align-group={swGroup}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={row.failed ? undefined : isPublic}
                  disabled={disabled}
                  data-share-public={row.cat.id}
                  className={styles.switchBtn}
                  onClick={() => void mutate(row, 'public')}
                >
                  {t('community.public')}
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={row.failed ? undefined : isAutoSync}
                  disabled={disabled || !isPublic}
                  data-share-autosync={row.cat.id}
                  className={styles.switchBtn}
                  onClick={() => void mutate(row, 'auto')}
                >
                  {t('community.autoSync')}
                </button>
                {isPublic && !isAutoSync ? (
                  <button
                    type="button"
                    data-share-republish={row.cat.id}
                    className={styles.republishBtn}
                    disabled={disabled}
                    onClick={() => void mutate(row, 'republish')}
                  >
                    {t('community.republish')}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
