import { useEffect, useState, useCallback } from 'react';
import { apiClient, type MyEpisodeLogDto } from '../../lib/apiClient';
import { auth, useAuth } from '../../lib/auth';
import { t } from '../../lib/i18n.mts';

let globalShares = new Map<string, MyEpisodeLogDto>();
let globalLoading = false;
let globalComplete = false;
let globalError: string | null = null;
let globalUid: string | null = null;
let globalReqSeq = 0;
let profileKey = '';
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((fn) => fn());

function reset() {
  globalReqSeq++;
  globalShares = new Map();
  globalLoading = false;
  globalComplete = false;
  globalError = null;
}

// Invalidate even while no cards are mounted (logout, plan/name changes).
auth.onChange((state) => {
  const uid = state.user?.id ?? null;
  const key = JSON.stringify([uid, state.me?.limits?.communityWrite, state.me?.publicName]);
  if (key !== profileKey) {
    profileKey = key;
    globalUid = uid;
    reset();
    notify();
  }
});

export function useEpisodeShares() {
  const state = useAuth();
  const currentUid = state.user?.id ?? null;
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((n) => n + 1), []);
  if (globalUid !== currentUid) {
    globalUid = currentUid;
    reset();
  }

  const loadAllShares = useCallback(async () => {
    const myUid = currentUid;
    if (!myUid || auth.getUser()?.id !== myUid) return;
    const mySeq = ++globalReqSeq;
    const isCurrent = () => mySeq === globalReqSeq && myUid === globalUid && myUid === auth.getUser()?.id;
    globalShares = new Map();
    globalComplete = false;
    globalLoading = true;
    globalError = null;
    notify();
    const collected = new Map<string, MyEpisodeLogDto>();
    const visited = new Set<string>();
    let cursor: string | null = null;
    try {
      while (isCurrent()) {
        const res = await apiClient.community.myEpisodeLogs(cursor);
        if (!isCurrent()) return;
        if (!Array.isArray(res.posts) || !(res.next === null || (typeof res.next === 'string' && res.next.length > 0)) ||
            res.posts.some((post) => !post || typeof post.sessionId !== 'string')) {
          throw new Error(t('episode.share.stateError'));
        }
        for (const post of res.posts) collected.set(post.sessionId, post);
        globalShares = new Map(collected);
        notify();
        if (res.next === null) {
          globalComplete = true;
          break;
        }
        if (visited.has(res.next)) throw new Error(t('episode.share.stateError'));
        visited.add(res.next);
        cursor = res.next;
      }
    } catch {
      if (isCurrent()) globalError = t('episode.share.stateError');
    } finally {
      if (isCurrent()) {
        globalLoading = false;
        notify();
      }
    }
  }, [currentUid]);

  useEffect(() => {
    if (subscribers.size === 0) reset(); // Page re-entry must revalidate the snapshot.
    subscribers.add(rerender);
    if (currentUid && !globalLoading && !globalComplete) void loadAllShares();
    return () => {
      subscribers.delete(rerender);
      if (subscribers.size === 0) reset();
    };
  }, [currentUid, state.me?.limits?.communityWrite, state.me?.publicName, loadAllShares, rerender]);

  const invalidate = useCallback(() => { void loadAllShares(); }, [loadAllShares]);
  const setShare = useCallback((post: MyEpisodeLogDto) => {
    if (auth.getUser()?.id !== currentUid) return;
    void loadAllShares(); // Invalidates older GET before applying the committed result.
    globalShares.set(post.sessionId, post);
    notify();
  }, [currentUid, loadAllShares]);
  const removeShare = useCallback((sessionId: string) => {
    if (auth.getUser()?.id !== currentUid) return;
    const previous = globalShares.get(sessionId);
    void loadAllShares();
    if (previous) globalShares.set(sessionId, {
      ...previous, title: '', comment: '', card: null, withdrawnAt: new Date().toISOString(),
    });
    notify();
  }, [currentUid, loadAllShares]);

  return { shares: globalShares, loading: globalLoading, complete: globalComplete,
    error: globalError, invalidate, setShare, removeShare };
}
