// frontend/src/components/community/QuickAddSheet.tsx
// CMR-3 D7~D12·D22: 카드 빠른 추가(+ 버튼·꾹 누르기)가 여는 하단 시트와 그 보조 함수.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apiClient, type PublicFolderDto, type PublicFolderItemDto } from '../../lib/apiClient';
import { auth, type MeProfile } from '../../lib/auth';
import { communityErrorKey, i18nPick, itemPracticeHref } from '../../lib/community.mts';
import { getLang, t } from '../../lib/i18n.mts';
import type { QuickAddTarget } from './CommunityParts';
import styles from './Community.module.css';

type Msg = { key: string; vars?: Record<string, string> };

/** D7: touch·pen만, ms 유지 시 발동. 10px 이동·손 뗌·취소·벗어남이면 취소. 발동 직후 click 1회 차단 */
export function useLongPress(onFire: () => void, ms = 500) {
  const fireRef = useRef(onFire);
  fireRef.current = onFire;
  const st = useRef<{ id: number | null; x: number; y: number; fired: boolean; touch: boolean }>({
    id: null, x: 0, y: 0, fired: false, touch: false,
  });
  const cancel = () => {
    if (st.current.id !== null) window.clearTimeout(st.current.id);
    st.current.id = null;
  };
  useEffect(() => cancel, []);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      cancel();
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') {
        st.current.touch = false;
        st.current.fired = false;
        return;
      }
      st.current.touch = true;
      st.current.fired = false;
      st.current.x = e.clientX;
      st.current.y = e.clientY;
      st.current.id = window.setTimeout(() => {
        st.current.id = null;
        st.current.fired = true;
        fireRef.current();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (st.current.id !== null && Math.hypot(e.clientX - st.current.x, e.clientY - st.current.y) > 10) cancel();
    },
    onPointerUp: cancel,       // fired는 유지(뒤따르는 click 차단용)
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: React.MouseEvent) => {
      if (st.current.touch) e.preventDefault();
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (!st.current.fired) return;
      st.current.fired = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const inSec = (v: unknown): v is number => finite(v) && v >= 0 && v <= 86400;

/** D12: 서버 400을 피하도록 범위 밖 값은 뺀다. a≥b면 둘 다 뺀다(P12) */
export function songAddInput(it: PublicFolderItemDto): {
  videoId: string; title?: string; artist?: string; rate?: number; a?: number; b?: number;
} {
  const out: { videoId: string; title?: string; artist?: string; rate?: number; a?: number; b?: number } = {
    videoId: it.videoId,
  };
  if (it.title != null) out.title = it.title;
  if (it.artist != null) out.artist = it.artist;
  if (finite(it.rate) && it.rate >= 0.25 && it.rate <= 2.0) out.rate = it.rate;
  const a = inSec(it.a) ? it.a : undefined;
  const b = inSec(it.b) ? it.b : undefined;
  if (!(a !== undefined && b !== undefined && a >= b)) {
    if (a !== undefined) out.a = a;
    if (b !== undefined) out.b = b;
  }
  return out;
}

/** D11: 곡 한도 403만 화면 전용 문구, 나머지는 communityErrorKey */
export function songAddErrorKey(err: unknown): Msg {
  const e = err && typeof err === 'object' ? (err as Record<string, any>) : {};
  const code = typeof e.code === 'string' && e.code ? e.code : typeof e.data?.code === 'string' ? e.data.code : '';
  const status = typeof e.status === 'number' ? e.status : typeof e.data?.status === 'number' ? e.data.status : 0;
  if (status === 403 && code === 'SONG_LIMIT_EXCEEDED') return { key: 'folder.err.songLimit' };
  return communityErrorKey(err);
}

/** D22: 시트 공통 — 열 때 제목 focus, ESC 닫기, Tab 순환, 닫힐 때 연 요소로 focus 복귀 */
export function useSheetFocus(
  rootRef: React.RefObject<HTMLElement>,
  titleRef: React.RefObject<HTMLElement>,
  onClose: () => void,
  ready: boolean,
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener && opener.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    if (ready) titleRef.current?.focus();
  }, [ready]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !rootRef.current) return;
      const focusable = rootRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const inside = rootRef.current.contains(document.activeElement);
      if (e.shiftKey) {
        if (document.activeElement === first || !inside) { e.preventDefault(); last.focus(); }
      } else if (document.activeElement === last || !inside) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export interface QuickAddSheetProps {
  target: QuickAddTarget | null;
  me: MeProfile | null;
  mock: boolean;
  onClose: () => void;
  onOpenDetail: (folderId: string) => void;
  onPatchFolder?: (id: string, patch: Partial<PublicFolderDto>) => void;
}

export function QuickAddSheet(props: QuickAddSheetProps) {
  if (!props.target || !props.me?.id) return null;
  const tid = props.target.kind === 'folder' ? `f:${props.target.folder.id}` : `s:${props.target.item.videoId}`;
  return <QuickAddSession key={JSON.stringify([props.me.id, tid])} {...props} target={props.target} />;
}

function QuickAddSession({
  target, me, mock, onClose, onOpenDetail, onPatchFolder,
}: QuickAddSheetProps & { target: QuickAddTarget }) {
  const active = useRef(false);
  useLayoutEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const isCurrent = () => active.current && me?.id === auth.getMe()?.id;
  const busy = useRef(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string>(mock ? t('folder.mockNotice') : '');
  const [alert, setAlert] = useState<Msg | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useSheetFocus(rootRef, titleRef, onClose, true);

  const title = target.kind === 'folder'
    ? i18nPick(target.folder.titleI18n, getLang(), target.folder.title)
    : target.item.title || target.item.videoId;

  async function run(job: () => Promise<string>, failKey: (e: unknown) => Msg) {
    if (!isCurrent() || busy.current || mock) return;
    busy.current = true;
    setRunning(true);
    setAlert(null);
    setStatus('');
    try {
      const ok = await job();
      if (!isCurrent()) return;
      setStatus(ok);
    } catch (e) {
      if (!isCurrent()) return;
      setAlert(failKey(e));
    } finally {
      busy.current = false;
      if (isCurrent()) setRunning(false);
    }
  }

  function cloneFolder(f: PublicFolderDto) {
    if (!isCurrent() || mock) return;
    if (!me?.limits?.communityWrite) {   // D10: 요청 0
      setStatus('');
      setAlert({ key: 'community.err.upgrade' });
      return;
    }
    void run(async () => {
      const r = await apiClient.community.clone(f.id);
      if (isCurrent()) onPatchFolder?.(f.id, { cloneCount: f.cloneCount + 1 });
      return t('folder.cloneDone', { n: r.imported, have: r.alreadyInLibrary, skip: r.skippedLimit });
    }, communityErrorKey);
  }

  function addSong(it: PublicFolderItemDto) {
    void run(async () => {
      await apiClient.songs.create(songAddInput(it));
      return t('folder.inLibrary');
    }, songAddErrorKey);
  }

  const mockTarget = mock || (target.kind === 'folder' && target.folder.id.startsWith('mock-'));

  return (
    <div
      id="quickAddSheet"
      className={styles.quickBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quickAddTitle"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={rootRef} className={styles.quickCard}>
        <h3 id="quickAddTitle" ref={titleRef} tabIndex={-1} className={styles.quickTitle}>
          {title}
        </h3>
        <div className={styles.quickActions}>
          {target.kind === 'folder' ? (
            <>
              <button
                type="button"
                id="quickAddClone"
                className={styles.quickPrimary}
                disabled={mockTarget || running}
                onClick={() => cloneFolder(target.folder)}
              >
                {t('folder.clone')}
              </button>
              <button
                type="button"
                id="quickAddOpen"
                className={styles.quickSecondary}
                disabled={mockTarget}
                onClick={() => onOpenDetail(target.folder.id)}
              >
                {t('folder.openDetail')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                id="quickAddSong"
                className={styles.quickPrimary}
                disabled={mock || running}
                onClick={() => addSong(target.item)}
              >
                {t('folder.addSong')}
              </button>
              <a id="quickAddPractice" className={styles.quickSecondary} href={itemPracticeHref(target.item)}>
                {t('folder.practice')}
              </a>
            </>
          )}
          <button type="button" id="quickAddCancel" className={styles.quickSecondary} onClick={onClose}>
            {t('folder.quickCancel')}
          </button>
        </div>
        {status ? (
          <p id="quickAddStatus" role="status" className="msg ok">{status}</p>
        ) : null}
        {alert ? (
          <p id="quickAddAlert" role="alert" className="msg err">{t(alert.key as any, alert.vars)}</p>
        ) : null}
      </div>
    </div>
  );
}
