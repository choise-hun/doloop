// frontend/src/components/community/MySharesPanel.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  apiClient,
  type CategoryDto,
  type ShareSummaryDto,
} from '../../lib/apiClient';
import { auth, type MeProfile } from '../../lib/auth';
import { communityErrorKey } from '../../lib/community.mts';
import { t } from '../../lib/i18n.mts';
import styles from './Community.module.css';

interface ShareRowState {
  cat: CategoryDto;
  share: ShareSummaryDto | null;
  titleInput: string;
}

export interface MySharesPanelProps {
  me: MeProfile | null;
  onRequireName?: () => void;
}

export function MySharesPanel({ me, onRequireName }: MySharesPanelProps) {
  const [rows, setRows] = useState<ShareRowState[]>([]);
  const [err, setErr] = useState<{ key: string; vars?: Record<string, string> } | null>(null);
  const busy = useRef(new Set<string>());
  const seq = useRef(0);

  // S1 uid + seq (D16)
  useEffect(() => {
    const my = ++seq.current;
    const uid = me?.id ?? null;
    setRows([]);
    setErr(null);
    if (!uid) return;
    apiClient.categories
      .list()
      .then(async (cats) => {
        if (my !== seq.current || uid !== (auth.getMe()?.id ?? null)) return;
        const list = Array.isArray(cats) ? cats : [];
        const loaded = await Promise.all(
          list.map(async (cat) => {
            try {
              const sh = await apiClient.categories.getShare(cat.id);
              return {
                cat,
                share: sh?.share ?? null,
                titleInput: sh?.share?.title || cat.name,
              };
            } catch {
              return { cat, share: null, titleInput: cat.name };
            }
          }),
        );
        if (my !== seq.current || uid !== (auth.getMe()?.id ?? null)) return;
        setRows(loaded);
      })
      .catch((e) => {
        if (my === seq.current) setErr(communityErrorKey(e));
      });
  }, [me?.id]);

  // S5: shareAutosync를 끄면 MySharesPanel의 autoSync 표시도 false
  useEffect(() => {
    if (me?.shareAutosync === false) {
      setRows((prev) =>
        prev.map((r) => (r.share ? { ...r, share: { ...r.share, autoSync: false } } : r)),
      );
    }
  }, [me?.shareAutosync]);

  function patchRow(catId: string, patch: Partial<ShareRowState>) {
    setRows((prev) => prev.map((r) => (r.cat.id === catId ? { ...r, ...patch } : r)));
  }

  async function togglePublic(row: ShareRowState) {
    setErr(null);
    if (!me?.limits?.communityWrite) {
      setErr({ key: 'community.err.upgrade' });
      return;
    }
    const key = `pub:${row.cat.id}`;
    if (busy.current.has(key)) return;
    busy.current.add(key);

    const prevShare = row.share;
    const nextPublic = !(prevShare?.isPublic ?? false);
    const titleVal = (row.titleInput || row.cat.name).trim() || row.cat.name;

    const optShare: ShareSummaryDto = prevShare
      ? { ...prevShare, isPublic: nextPublic, title: titleVal }
      : {
          folderId: `opt-${row.cat.id}`,
          categoryId: row.cat.id,
          title: titleVal,
          isPublic: nextPublic,
          autoSync: false,
          hidden: false,
          itemCount: row.cat.songCount ?? 0,
          likeCount: 0,
          cloneCount: 0,
          publishedAt: null,
          publicName: me?.publicName ?? null,
        };
    patchRow(row.cat.id, { share: optShare });

    try {
      const body = nextPublic ? { isPublic: true, title: titleVal } : { isPublic: false };
      const res = await apiClient.categories.setShare(row.cat.id, body);
      patchRow(row.cat.id, { share: res.share });
    } catch (e) {
      patchRow(row.cat.id, { share: prevShare });
      const errKey = communityErrorKey(e);
      setErr(errKey);
      if (errKey.key === 'community.err.nameRequired') {
        onRequireName?.();
      }
    } finally {
      busy.current.delete(key);
    }
  }

  async function toggleAutoSync(row: ShareRowState) {
    setErr(null);
    if (!me?.limits?.communityWrite) {
      setErr({ key: 'community.err.upgrade' });
      return;
    }
    const key = `auto:${row.cat.id}`;
    if (busy.current.has(key)) return;
    busy.current.add(key);

    const prevShare = row.share;
    const prevAuto = Boolean(prevShare?.autoSync && me?.shareAutosync !== false);
    const nextAuto = !prevAuto;
    const titleVal = (row.titleInput || row.cat.name).trim() || row.cat.name;

    const optShare: ShareSummaryDto = prevShare
      ? { ...prevShare, isPublic: true, autoSync: nextAuto, title: titleVal }
      : {
          folderId: `opt-${row.cat.id}`,
          categoryId: row.cat.id,
          title: titleVal,
          isPublic: true,
          autoSync: nextAuto,
          hidden: false,
          itemCount: row.cat.songCount ?? 0,
          likeCount: 0,
          cloneCount: 0,
          publishedAt: null,
          publicName: me?.publicName ?? null,
        };
    patchRow(row.cat.id, { share: optShare });

    try {
      const res = await apiClient.categories.setShare(row.cat.id, {
        isPublic: prevShare?.isPublic ?? true,
        autoSync: nextAuto,
        title: titleVal,
      });
      patchRow(row.cat.id, { share: res.share });
    } catch (e) {
      patchRow(row.cat.id, { share: prevShare });
      const errKey = communityErrorKey(e);
      setErr(errKey);
      if (errKey.key === 'community.err.nameRequired') {
        onRequireName?.();
      }
    } finally {
      busy.current.delete(key);
    }
  }

  async function handleRepublish(row: ShareRowState) {
    setErr(null);
    if (!me?.limits?.communityWrite) {
      setErr({ key: 'community.err.upgrade' });
      return;
    }
    const key = `repub:${row.cat.id}`;
    if (busy.current.has(key)) return;
    busy.current.add(key);
    try {
      const titleVal = (row.titleInput || row.cat.name).trim() || row.cat.name;
      const res = await apiClient.categories.republish(row.cat.id, titleVal);
      patchRow(row.cat.id, { share: res.share });
    } catch (e) {
      setErr(communityErrorKey(e));
    } finally {
      busy.current.delete(key);
    }
  }

  if (!me?.id) return null;

  return (
    <section id="mySharesPanel" className={styles.sharesPanel} aria-labelledby="mySharesTitle">
      <h3 id="mySharesTitle" className={styles.sharesTitle}>
        {t('community.myShares')}
      </h3>

      {err ? (
        <p id="mySharesErr" role="alert" className="msg err">
          {t(err.key as any, err.vars)}
        </p>
      ) : null}

      <div className={styles.sharesList}>
        {rows.map((row, idx) => {
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
                <input
                  type="text"
                  className={styles.shareTitleInput}
                  aria-label={t('community.shareTitle')}
                  value={row.titleInput}
                  maxLength={80}
                  onChange={(e) => patchRow(row.cat.id, { titleInput: e.target.value })}
                />
              </div>

              <div className={styles.shareRowSwitches} data-align-group={swGroup}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPublic}
                  data-share-public={row.cat.id}
                  className={styles.switchBtn}
                  onClick={() => void togglePublic(row)}
                >
                  {t('community.public')}
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isAutoSync}
                  data-share-autosync={row.cat.id}
                  className={styles.switchBtn}
                  onClick={() => void toggleAutoSync(row)}
                >
                  {t('community.autoSync')}
                </button>
                {isPublic && !isAutoSync ? (
                  <button
                    type="button"
                    data-share-republish={row.cat.id}
                    className={styles.republishBtn}
                    onClick={() => void handleRepublish(row)}
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
