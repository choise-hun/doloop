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
let globalController: AbortController | null = null;
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((fn) => fn());

function reset() {
  globalController?.abort();
  globalReqSeq++;
  globalShares = new Map();
  globalLoading = false;
  globalComplete = false;
  globalError = null;
}

// Invalidate even while no cards are mounted (logout, plan/name changes).
auth.onChange((state) => {
  const uid = state.user?.id ?? null;
  const key = JSON.stringify([uid, auth.getSessionGeneration(), state.me?.limits?.communityWrite, state.me?.publicName]);
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
  const generation = auth.getSessionGeneration();
  const ownsIdentity = () => Boolean(currentUid && auth.getUser()?.id === currentUid && auth.getSessionGeneration() === generation);
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((n) => n + 1), []);
  if (globalUid !== currentUid) {
    globalUid = currentUid;
    reset();
  }

  const loadAllShares = useCallback(async () => {
    const myUid = currentUid;
    if (!myUid || !ownsIdentity()) return;
    const controller = new AbortController();
    globalController = controller;
    const mySeq = ++globalReqSeq;
    const isCurrent = () => mySeq === globalReqSeq && myUid === globalUid && !controller.signal.aborted && ownsIdentity();
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
        const res = await apiClient.community.myEpisodeLogs(cursor, controller.signal);
        if (!isCurrent()) return;
        if (!Array.isArray(res.posts) || !(res.next === null || (typeof res.next === 'string' && res.next.length > 0)) ||
            res.posts.some((post) => !post || typeof post.sessionId !== 'string')) {
          throw new Error(t('episode.share.stateError'));
        }
        for (const post of res.posts) if (!collected.has(post.sessionId)) collected.set(post.sessionId, post);
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
  }, [currentUid, generation]);

  useEffect(() => {
    if (subscribers.size === 0) reset(); // Page re-entry must revalidate the snapshot.
    subscribers.add(rerender);
    if (currentUid && !globalLoading && !globalComplete) void loadAllShares();
    return () => {
      subscribers.delete(rerender);
      if (subscribers.size === 0) reset();
    };
  }, [currentUid, generation, state.me?.limits?.communityWrite, state.me?.publicName, loadAllShares, rerender]);

  const invalidate = useCallback(() => { void loadAllShares(); }, [loadAllShares]);
  const setShare = useCallback((post: MyEpisodeLogDto) => {
    if (!ownsIdentity()) return;
    void loadAllShares(); // Invalidates older GET before applying the committed result.
    globalShares.set(post.sessionId, post);
    notify();
  }, [currentUid, generation, loadAllShares]);
  const removeShare = useCallback((sessionId: string) => {
    if (!ownsIdentity()) return;
    const previous = globalShares.get(sessionId);
    void loadAllShares();
    if (previous) globalShares.set(sessionId, {
      ...previous, title: '', comment: '', card: null, canRepublish: false, withdrawnAt: new Date().toISOString(),
    });
    notify();
  }, [currentUid, generation, loadAllShares]);

  return { shares: globalShares, loading: globalLoading, complete: globalComplete,
    error: globalError, invalidate, setShare, removeShare };
}
