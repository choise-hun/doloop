// frontend/src/lib/cardAudio.ts
// S3b-4 D3·D4: 피드 카드 녹음 단일 플레이어. 모듈 하나가 HTMLAudioElement 1개를 소유한다.
// 재생 주소(5분 서명)는 매번 새로 받고 캐시하지 않는다(명세 §8).
import { auth } from './auth';
import { apiClient } from './apiClient';

export type CardAudioStatus = 'idle' | 'loading' | 'playing' | 'error';

export interface CardAudioSnapshot {
  postId: string | null;
  attachmentId: string | null;
  status: CardAudioStatus;
  /** gone = 게시물·첨부가 사라짐(404), failed = 그 밖의 오류 */
  error: 'gone' | 'failed' | null;
}

/** toggle 결과: 호출한 카드만 onPostGone 등 후속 처리를 한다. stale = 더 새로운 요청·정지·계정 전환으로 버려짐 */
export type CardAudioResult = 'playing' | 'stopped' | 'stale' | 'gone' | 'failed';

export interface CardAudioDeps {
  fetchUrl(postId: string, attachmentId: string, signal: AbortSignal): Promise<{ url: string }>;
  createAudio(): HTMLAudioElement;
  getUid(): string | null;
}

const IDLE: CardAudioSnapshot = { postId: null, attachmentId: null, status: 'idle', error: null };

export function createCardAudio(deps: CardAudioDeps) {
  let el: HTMLAudioElement | null = null;
  let generation = 0;
  let controller: AbortController | null = null;
  let snapshot: CardAudioSnapshot = IDLE;
  const listeners = new Set<(s: CardAudioSnapshot) => void>();

  function emit(next: CardAudioSnapshot): void {
    snapshot = next;
    listeners.forEach((fn) => {
      try { fn(snapshot); } catch { /* 구독자 오류는 무시 */ }
    });
  }

  // frontend-state §3 필수 순서. src = '' 대입은 문서 주소 재요청 버그가 있어 쓰지 않는다.
  function clearElement(): void {
    if (!el) return;
    try {
      el.pause();
      el.removeAttribute('src');
      el.load();
      delete el.dataset.attachmentId;
    } catch { /* ignore */ }
  }

  function isCurrentTrack(): boolean {
    return Boolean(el && snapshot.attachmentId && el.dataset.attachmentId === snapshot.attachmentId);
  }

  function ensureElement(): HTMLAudioElement {
    if (el) return el;
    const a = deps.createAudio();
    a.preload = 'none';
    a.addEventListener('ended', () => {
      if (snapshot.status !== 'playing' || !isCurrentTrack()) return;
      generation++;
      clearElement();
      emit(IDLE);
    });
    a.addEventListener('error', () => {
      // 정리(load) 뒤의 이벤트는 dataset이 없어 무시된다.
      if ((snapshot.status !== 'playing' && snapshot.status !== 'loading') || !isCurrentTrack()) return;
      const { postId, attachmentId } = snapshot;
      generation++;
      clearElement();
      emit({ postId, attachmentId, status: 'error', error: 'failed' });
    });
    el = a;
    return a;
  }

  function stop(): void {
    generation++;
    controller?.abort();
    controller = null;
    clearElement();
    if (snapshot !== IDLE) emit(IDLE);
  }

  async function play(postId: string, attachmentId: string): Promise<CardAudioResult> {
    const myGen = ++generation;
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    const uid = deps.getUid();
    const isCurrent = () => myGen === generation && uid === deps.getUid();
    // 세대는 그대로인데 계정만 바뀌었으면(구독 알림 전) 이 요청이 남긴 상태도 비운다.
    const abandon = (): CardAudioResult => { if (myGen === generation) stop(); return 'stale'; };

    clearElement();
    emit({ postId, attachmentId, status: 'loading', error: null });
    try {
      const res = await deps.fetchUrl(postId, attachmentId, ctrl.signal);
      if (!isCurrent()) return abandon();
      if (!res || typeof res.url !== 'string' || !res.url) throw new Error('invalid attachment url');
      const a = ensureElement();
      a.src = res.url;
      a.dataset.attachmentId = attachmentId;
      await a.play();
      if (!isCurrent()) return abandon();
      emit({ postId, attachmentId, status: 'playing', error: null });
      return 'playing';
    } catch (err: any) {
      if (!isCurrent()) return abandon();
      if (controller === ctrl) controller = null;
      clearElement();
      const gone = Number(err?.status) === 404;
      emit({ postId, attachmentId, status: 'error', error: gone ? 'gone' : 'failed' });
      return gone ? 'gone' : 'failed';
    }
  }

  /** 같은 첨부가 loading·playing이면 정지, 그 밖(idle·error·다른 첨부)은 새 주소로 재생 */
  function toggle(postId: string, attachmentId: string): Promise<CardAudioResult> {
    const active = snapshot.status === 'loading' || snapshot.status === 'playing';
    if (active && snapshot.postId === postId && snapshot.attachmentId === attachmentId) {
      stop();
      return Promise.resolve('stopped');
    }
    return play(postId, attachmentId);
  }

  /** 카드 언마운트: 그 카드가 재생·대기·오류 상태일 때만 정리한다 */
  function stopPost(postId: string): void {
    if (snapshot.postId === postId) stop();
  }

  function subscribe(fn: (s: CardAudioSnapshot) => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }

  return {
    toggle,
    stop,
    stopPost,
    /** 로그아웃·계정 전환 */
    reset: stop,
    subscribe,
    getSnapshot: (): CardAudioSnapshot => snapshot,
  };
}

export type CardAudio = ReturnType<typeof createCardAudio>;

export const cardAudio: CardAudio = createCardAudio({
  fetchUrl: (postId, attachmentId, signal) => apiClient.community.attachmentUrl(postId, attachmentId, signal),
  createAudio: () => new Audio(),
  getUid: () => auth.getUser()?.id || null,
});

// D4: uid가 바뀌면(로그아웃·계정 전환) 재생을 멈춘다. auth.ts는 수정하지 않는다.
let lastUid: string | null | undefined;
auth.onChange((state) => {
  const uid = state?.user?.id || null;
  if (lastUid !== undefined && uid !== lastUid) cardAudio.reset();
  lastUid = uid;
});
