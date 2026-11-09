// frontend/src/components/songRecord/useEpisodeShares.ts
// 사용자 단위 세션 공유 상태 순차 조회 및 캐시 관리
import { useEffect, useRef, useState, useCallback } from 'react';
import { apiClient, type MyEpisodeLogDto } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { t } from '../../lib/i18n.mts';

interface SharesState {
  shares: Map<string, MyEpisodeLogDto>;
  loading: boolean;
  complete: boolean;
  error: string | null;
}

// 모듈 레벨 전역 캐시 (동일 uid 세션 카드들 간 조회 공유)
let globalShares = new Map<string, MyEpisodeLogDto>();
let globalLoading = false;
let globalComplete = false;
let globalError: string | null = null;
let globalUid: string | null = null;
let globalReqSeq = 0;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => fn());
}

export function useEpisodeShares() {
  const authState = useAuth();
  const currentUid = authState.user?.id || null;

  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    subscribers.add(rerender);
    return () => {
      subscribers.delete(rerender);
    };
  }, [rerender]);

  // uid 변경 시 캐시 즉시 비움
  if (globalUid !== currentUid) {
    globalUid = currentUid;
    globalShares = new Map();
    globalLoading = false;
    globalComplete = false;
    globalError = null;
    globalReqSeq++;
  }

  const loadAllShares = useCallback(async () => {
    if (!currentUid) {
      globalShares = new Map();
      globalLoading = false;
      globalComplete = false;
      globalError = null;
      notify();
      return;
    }

    const mySeq = ++globalReqSeq;
    const myUid = currentUid;

    globalLoading = true;
    globalError = null;
    notify();

    const visitedCursors = new Set<string>();
    let cursor: string | null = null;
    const collected = new Map<string, MyEpisodeLogDto>();

    try {
      while (true) {
        if (mySeq !== globalReqSeq || myUid !== globalUid) return;

        const res = await apiClient.community.myEpisodeLogs(cursor);
        if (mySeq !== globalReqSeq || myUid !== globalUid) return;

        if (Array.isArray(res.posts)) {
          for (const post of res.posts) {
            if (post?.sessionId) {
              collected.set(post.sessionId, post);
            }
          }
        }

        // 부분 결과 즉시 업데이트
        globalShares = new Map(collected);
        notify();

        if (!res.next) {
          globalComplete = true;
          break;
        }

        if (visitedCursors.has(res.next)) {
          // 커서 중복 루프 방어
          break;
        }
        visitedCursors.add(res.next);
        cursor = res.next;
      }
    } catch (err: any) {
      if (mySeq !== globalReqSeq || myUid !== globalUid) return;
      globalError = err?.message || t('episode.share.stateError');
    } finally {
      if (mySeq === globalReqSeq && myUid === globalUid) {
        globalLoading = false;
        notify();
      }
    }
  }, [currentUid]);

  // 초기 로드
  useEffect(() => {
    if (currentUid && !globalComplete && !globalLoading) {
      loadAllShares();
    }
  }, [currentUid, loadAllShares]);

  const invalidate = useCallback(() => {
    globalShares = new Map();
    globalComplete = false;
    globalError = null;
    loadAllShares();
  }, [loadAllShares]);

  const setShare = useCallback((post: MyEpisodeLogDto) => {
    if (post?.sessionId) {
      globalShares.set(post.sessionId, post);
      notify();
    }
  }, []);

  const removeShare = useCallback((sessionId: string) => {
    if (sessionId) {
      const existing = globalShares.get(sessionId);
      if (existing) {
        globalShares.set(sessionId, {
          ...existing,
          withdrawnAt: new Date().toISOString(),
          status: 'withdrawn',
        });
      } else {
        globalShares.delete(sessionId);
      }
      notify();
    }
  }, []);

  return {
    shares: globalShares,
    loading: globalLoading,
    complete: globalComplete,
    error: globalError,
    invalidate,
    setShare,
    removeShare,
  };
}
