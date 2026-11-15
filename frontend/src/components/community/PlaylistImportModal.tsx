// frontend/src/components/community/PlaylistImportModal.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  apiClient,
  type CategoryDto,
  type PlaylistImportResultDto,
  type PlaylistPreviewDto,
} from '../../lib/apiClient';
import type { MeProfile } from '../../lib/auth';
import { communityErrorKey } from '../../lib/community.mts';
import { t } from '../../lib/i18n.mts';
import styles from './Community.module.css';

export interface PlaylistImportModalProps {
  url: string | null;
  me: MeProfile | null;
  onClose: () => void;
  onImported: (result: PlaylistImportResultDto) => void;
  onOnlyThis?: (videoId: string) => void;
}

function extractVideoIdFromPlaylistUrl(rawUrl: string | null): string | null {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl.trim());
    if (u.hostname.toLowerCase() === 'youtu.be') {
      const seg = u.pathname.replace(/^\/+/, '').split('/')[0] || '';
      return seg.trim() || null;
    }
    const v = (u.searchParams.get('v') ?? '').trim();
    return v || null;
  } catch {
    return null;
  }
}

export function PlaylistImportModal({
  url,
  me,
  onClose,
  onImported,
  onOnlyThis,
}: PlaylistImportModalProps) {
  const pvSeq = useRef(0);
  const busyRef = useRef(false);

  const [preview, setPreview] = useState<PlaylistPreviewDto | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [choice, setChoice] = useState<'existing' | 'new'>('new');
  const [categoryId, setCategoryId] = useState<string>('');
  const [categoryName, setCategoryName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlaylistImportResultDto | null>(null);
  const [err, setErr] = useState<{ key: string; vars?: Record<string, string> } | null>(null);
  // WF-1: 사용자가 분류 선택·이름을 직접 바꿨는지. 바꿨으면 바깥 클릭으로 닫지 않고, "이 곡만 열기"도 그 분류를 따른다
  const [touched, setTouched] = useState(false);

  // S4 가져오기 모달 — 미리보기는 url별 seq, 가져오기는 busy 가드, 닫으면 둘 다 무효
  useEffect(() => {
    const my = ++pvSeq.current;
    busyRef.current = false;
    setBusy(false);
    setPreview(null);
    setResult(null);
    setErr(null);
    setTouched(false);
    if (!url) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      apiClient.songs.importPreview(url),
      apiClient.categories.list().catch(() => [] as CategoryDto[]),
    ])
      .then(([pv, catList]) => {
        if (my !== pvSeq.current) return;
        const cats = Array.isArray(catList) ? catList : [];
        setPreview(pv);
        setCategories(cats);
        setCategoryName((pv.title || '').slice(0, 20));
        if (cats.length > 0) {
          setCategoryId(cats[0].id);
        }
        if (pv.remainingCategorySlots === 0 && cats.length > 0) {
          setChoice('existing');
        } else {
          setChoice('new');
        }
        setLoading(false);
      })
      .catch((e) => {
        if (my !== pvSeq.current) return;
        setLoading(false);
        setErr(communityErrorKey(e));
      });
  }, [url]);

  function close() {
    ++pvSeq.current;
    busyRef.current = false;
    setBusy(false);
    setPreview(null);
    setResult(null);
    setErr(null);
    setLoading(false);
    setTouched(false);
    onClose();
  }

  // WF-1: "이 곡만 열기" — 분류를 직접 골랐으면 곡을 계정에 넣고 그 분류에 담은 뒤 연다. 손대지 않았으면 예전처럼 열기만 한다
  async function openOnlyThis(vid: string) {
    if (busyRef.current) return;
    if (!touched || !preview) {
      close();
      onOnlyThis?.(vid);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    const my = pvSeq.current;
    try {
      const song = (await apiClient.songs.byVideo(vid)) ?? (await apiClient.songs.create({ videoId: vid }));
      if (!song) throw new Error('song create failed');
      let catId = categoryId;
      if (choice === 'new') {
        const name = categoryName.trim() || (preview.title || '').slice(0, 20);
        const created = await apiClient.categories.create(name);
        if (!created) throw new Error('category create failed');
        catId = created.id;
        if (my === pvSeq.current) {
          // 뒤 단계가 실패해 다시 누를 때 같은 분류를 또 만들지 않게 기존 분류 선택으로 바꿔 둔다
          setCategories((prev) => [...prev, created]);
          setCategoryId(created.id);
          setChoice('existing');
        }
      }
      const ids = song.categoryIds || [];
      if (catId && !ids.includes(catId)) {
        await apiClient.songs.update(song.id, { categoryIds: [...ids, catId] });
      }
      if (my !== pvSeq.current) return;
      close();
      onOnlyThis?.(vid);
    } catch (eObj) {
      if (my === pvSeq.current) setErr(communityErrorKey(eObj));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current || !preview || !url) return;
    busyRef.current = true;
    setBusy(true);
    setErr(null);
    const my = pvSeq.current;
    try {
      const name = categoryName.trim();   // 비우면 서버 기본 이름(재생목록 제목 앞 20자) — 빈 문자열은 400
      const r = await apiClient.songs.importPlaylist(
        choice === 'new'
          ? name ? { url, newCategory: true, categoryName: name } : { url, newCategory: true }
          : { url, categoryId },
      );
      if (my !== pvSeq.current) return;
      setResult(r);
      onImported(r);
    } catch (eObj) {
      if (my === pvSeq.current) setErr(communityErrorKey(eObj));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (!url) return null;

  const singleVideoId = extractVideoIdFromPlaylistUrl(url);
  const noCatSlots = Boolean(preview && preview.remainingCategorySlots === 0);
  const isFree = !me || me.tier === 'free';

  return (
    <div
      id="playlistImportModal"
      className={styles.modalBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="playlistModalTitle"
      onClick={(e) => {
        // WF-1: 입력을 바꿨거나 처리 중이면 바깥 클릭으로 닫지 않는다(취소 버튼으로만 닫힘)
        if (e.target === e.currentTarget && !touched && !busy) close();
      }}
    >
      <form className={styles.sheetCard} onSubmit={(e) => void submit(e)}>
        <h3 id="playlistModalTitle" className={styles.sheetTitle}>
          {t('playlist.title')}
        </h3>

        {loading ? <p className={styles.sheetMeta}>{t('playlist.loading')}</p> : null}

        {preview ? (
          <>
            <p id="playlistSummary" className={styles.sheetDesc}>
              {t('playlist.summary', {
                title: preview.title,
                n: preview.itemCount,
                slots: preview.remainingSongSlots ?? 0,
              })}
            </p>

            {isFree ? (
              <p id="playlistFreeNotice" className={styles.freeNotice}>
                {t('playlist.freeNotice')}
              </p>
            ) : null}

            <div className={styles.radioGroup}>
              {categories.length > 0 ? (
                <div className={styles.radioRow}>
                  <label className={styles.radioLabel} htmlFor="playlistChoiceExisting">
                    <input
                      id="playlistChoiceExisting"
                      type="radio"
                      name="playlistChoice"
                      value="existing"
                      checked={choice === 'existing'}
                      onChange={() => { setChoice('existing'); setTouched(true); }}
                    />
                    {t('playlist.toExisting')}
                  </label>
                  {choice === 'existing' ? (
                    <select
                      id="playlistCatSelect"
                      className={styles.selectPill}
                      value={categoryId}
                      onChange={(e) => { setCategoryId(e.target.value); setTouched(true); }}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              ) : null}

              <div className={styles.radioRow}>
                <label className={styles.radioLabel} htmlFor="playlistChoiceNew">
                  <input
                    id="playlistChoiceNew"
                    type="radio"
                    name="playlistChoice"
                    value="new"
                    disabled={noCatSlots}
                    checked={choice === 'new'}
                    onChange={() => { setChoice('new'); setTouched(true); }}
                  />
                  {t('playlist.toNew')}
                </label>
                {choice === 'new' && !noCatSlots ? (
                  <input
                    id="playlistCatName"
                    type="text"
                    className="inpField"
                    aria-label={t('playlist.newName')}
                    placeholder={t('playlist.newName')}
                    maxLength={20}
                    value={categoryName}
                    onChange={(e) => { setCategoryName(e.target.value); setTouched(true); }}
                  />
                ) : null}
                {noCatSlots ? (
                  <p id="playlistCatSlotNotice" role="alert" className="msg err">
                    {t('playlist.err.catUpgrade')}
                  </p>
                ) : null}
              </div>
            </div>
          </>
        ) : null}

        {err ? (
          <p id="playlistErrMsg" role="alert" className="msg err">
            {t(err.key as any, err.vars)}
          </p>
        ) : null}

        {result ? (
          <p id="playlistDoneMsg" role="status" className="msg ok">
            {t('playlist.done', {
              imported: result.imported,
              have: result.alreadyInLibrary,
              skip: result.skippedLimit,
              gone: result.skippedUnavailable,
            })}
          </p>
        ) : null}

        <div className={styles.modalFoot}>
          {singleVideoId && onOnlyThis ? (
            <button
              type="button"
              id="playlistOnlyThis"
              className="ghostBtn"
              disabled={busy}
              onClick={() => void openOnlyThis(singleVideoId)}
            >
              {t('playlist.onlyThis')}
            </button>
          ) : null}
          {preview && !result ? (
            <button
              type="submit"
              id="playlistSubmit"
              className="pillBtn"
              disabled={busy || (choice === 'new' && noCatSlots)}
            >
              {t('playlist.submit')}
            </button>
          ) : null}
          <button type="button" id="playlistClose" className="ghostBtn" onClick={close}>
            {t('playlist.cancel')}
          </button>
        </div>
      </form>
    </div>
  );
}
