// frontend/src/lib/auth.ts
import { syncLangFromProfile, t, type LocaleCode } from './i18n.mts';
import { useEffect, useState } from 'react';
import type { SupabaseClientLike, SupabaseSessionLike, SupabaseUserLike } from '../vite-env';

export interface KeySummaryDto {
  hint: string;
  updatedAt: string;
}

export interface MeProfile {
  id: string;
  email: string;
  displayName: string;
  role: string;
  storageProvider: 'supabase' | 'drive' | string;
  driveFolderId: string | null;
  takeUsedBytes: number;
  takeQuotaBytes: number;
  migratedLocalAt: string | null;
  keys: {
    notion: KeySummaryDto | null;
  };
  // M1-2a·M1-3b: 실제 티어(override 반영)·한도·크레딧 잔액. AI 분석 가능 여부는 limits.ai로만 판단한다
  tier?: 'free' | 'pro' | 'pro_plus' | string;
  limits?: TierLimitsDto;
  credits?: { monthly: number; purchased: number };
  // M1-4a·M1-4b·M2-23: 커뮤니티·크리에이터·공유 설정
  isCreator?: boolean;
  creatorBadge?: string | null;
  shareAutosync?: boolean;
  sharePracticeLog?: boolean;
  publicName?: string | null;
  publicNameNextChangeAt?: string | null;
  locale?: LocaleCode | null;
}

export interface TierLimitsDto {
  songs: number | null;
  categories: number | null;
  takeBytes: number;
  takeSongs: number | null;
  takeDurationSec: number | null;
  drive: boolean;
  ai: boolean;
  communityWrite: boolean;
}

/** AI 영상 분석(노트·코드 진행)을 요청할 수 있는 계정인지 — 서버 /me limits.ai(무료 false, 유료 → 무료 유예 중은 true — M1-3e) */
export function canUseAi(me: MeProfile | null | undefined): boolean {
  return Boolean(me && me.limits && me.limits.ai);
}

export interface ProfilePatchInput {
  displayName?: string;
  storageProvider?: 'supabase' | 'drive';
  driveFolderId?: string | null;
  migratedLocalAt?: string | null;
  shareAutosync?: boolean;
  sharePracticeLog?: boolean;
  locale?: LocaleCode | null;
}

export interface AuthState {
  configured: boolean;
  session: SupabaseSessionLike | null;
  user: SupabaseUserLike | null;
  me: MeProfile | null;
}

export interface ApiClientError extends Error {
  status?: number;
  code?: string;
  data?: unknown;
}

function createAuthModule() {
  const win: Record<string, any> = typeof window !== 'undefined' ? (window as any) : {};
  const cfg = win.ULEVELP_CONFIG || {};
  const supabaseUrl = String(cfg.supabaseUrl || '').trim().replace(/\/+$/, '');
  const supabaseAnonKey = String(cfg.supabaseAnonKey || '').trim();
  const apiBaseUrl = String(cfg.apiBaseUrl || '').trim().replace(/\/+$/, '');

  let client: SupabaseClientLike | null = null;
  if (win.supabase && typeof win.supabase.createClient === 'function' && supabaseUrl && supabaseAnonKey) {
    client = win.supabase.createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storageKey: 'ulp:auth',
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  let currentSession: SupabaseSessionLike | null = null;
  let currentMe: MeProfile | null = null;
  let lastFetchedUid: string | null = null;
  let signingOut = false;
  let authGeneration = 0;
  let profileSeq = 0;
  let profilePatchQueue: Promise<void> = Promise.resolve();
  const listeners = new Set<(state: AuthState) => void>();

  function isConfigured(): boolean {
    return !!client;
  }

  function isEmbedded(): boolean {
    try {
      return typeof window !== 'undefined' && window.self !== window.top;
    } catch {
      return true;
    }
  }

  function stripHash(url?: string): string {
    const fallback = typeof location !== 'undefined' ? location.href : '';
    return String(url || fallback).split('#')[0];
  }

  function clearKeysCache(): void {
    try {
      localStorage.removeItem('ulp:keys');
    } catch {
      /* 저장 불가 무시 */
    }
  }

  function saveKeysCache(me: MeProfile | null): void {
    if (!me || !me.id) return;
    try {
      const payload = {
        uid: me.id,
        notion: me.keys && me.keys.notion ? me.keys.notion : null,
      };
      localStorage.setItem('ulp:keys', JSON.stringify(payload));
    } catch {
      /* 저장 불가 무시 */
    }
  }

  function computeInitial(user?: SupabaseUserLike | null, me?: MeProfile | null): string {
    const rawName = (
      (me && me.displayName) ||
      (user && user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) ||
      (user && user.email ? user.email.split('@')[0] : '') ||
      ''
    ).trim();
    if (!rawName) return 'ME';
    if (/^[가-힣]/.test(rawName)) return rawName.slice(0, 2); // i18n-keep: 한글 이름 2자 추출 정규식(D5-2)
    const parts = rawName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && /^[A-Za-z]/.test(parts[0]) && /^[A-Za-z]/.test(parts[1])) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return rawName.slice(0, 2).toUpperCase();
  }

  function getSnapshot(): AuthState {
    return {
      configured: isConfigured(),
      session: currentSession,
      user: currentSession ? currentSession.user : null,
      me: currentMe,
    };
  }

  function notify(): void {
    const state = getSnapshot();
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch {
        /* 콜백 오류 격리 */
      }
    });
  }

  function acceptSession(session: SupabaseSessionLike | null): void {
    if ((currentSession?.user?.id ?? null) !== (session?.user?.id ?? null)) {
      authGeneration++;
      profileSeq++;
      profilePatchQueue = Promise.resolve();
      currentMe = null;
      lastFetchedUid = null;
      clearKeysCache();
      syncLangFromProfile(null);
    }
    currentSession = session;
  }

  function obsoleteRequest(): Error {
    const error = new Error('Profile request is no longer current');
    error.name = 'AbortError';
    return error;
  }

  function profileRequest() {
    const uid = currentSession?.user?.id;
    const generation = authGeneration;
    const seq = ++profileSeq;
    return { uid, valid: () => Boolean(uid && generation === authGeneration &&
      seq === profileSeq && uid === currentSession?.user?.id) };
  }

  async function getAccessToken(): Promise<string> {
    if (!client || signingOut) return '';
    const generation = authGeneration;
    try {
      const { data } = await client.auth.getSession();
      if (generation !== authGeneration) return '';
      acceptSession(data?.session || null);
      return currentSession?.access_token || '';
    } catch {
      return generation === authGeneration ? currentSession?.access_token || '' : '';
    }
  }

  async function requestApi<T = any>(path: string, opts?: RequestInit, isCurrent?: () => boolean): Promise<T> {
    const options = opts || {};
    const token = await getAccessToken();
    if (isCurrent && !isCurrent()) throw obsoleteRequest();
    const headers: Record<string, string> = Object.assign({}, (options.headers as Record<string, string>) || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
    }
    const url = (apiBaseUrl || '') + path;
    const res = await fetch(url, Object.assign({}, options, { headers }));
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || t('auth.reqFailedStatus', { status: res.status });
      const err: ApiClientError = new Error(msg);
      err.status = res.status;
      err.code = data && data.code ? data.code : '';
      err.data = data;
      throw err;
    }
    return data as T;
  }

  async function apiFetch<T = any>(path: string, opts?: RequestInit): Promise<T> {
    return requestApi<T>(path, opts);
  }

  async function fetchMe(): Promise<MeProfile | null> {
    if (!currentSession || !currentSession.access_token) {
      currentMe = null;
      lastFetchedUid = null;
      clearKeysCache();
      syncLangFromProfile(null);
      notify();
      return null;
    }
    const request = profileRequest();
    const uid = request.uid;
    if (currentMe && uid && currentMe.id !== uid) {
      currentMe = null;
      clearKeysCache();
      syncLangFromProfile(null);
    }
    try {
      const me = await requestApi<MeProfile>('/api/v1/me', undefined, request.valid);
      if (!request.valid()) return null;
      if (me?.id !== uid) throw obsoleteRequest();
      syncLangFromProfile(me?.locale ?? null);
      currentMe = me;
      lastFetchedUid = uid || (me ? me.id : null);
      saveKeysCache(me);
      notify();
      return me;
    } catch {
      if (!request.valid()) return null;
      currentMe = null;
      lastFetchedUid = null;
      clearKeysCache();
      syncLangFromProfile(null);
      notify();
      return null;
    }
  }

  async function signIn(redirectTo?: string): Promise<void> {
    if (isEmbedded()) {
      if (typeof window !== 'undefined' && typeof window.open === 'function') {
        window.open('settings.html#account', '_blank', 'noopener');
      }
      return;
    }
    if (!client) {
      throw new Error(t('auth.supabaseConfigReq'));
    }
    const target = stripHash(redirectTo);
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: target },
    });
    if (error) throw error;
  }

  async function signOut(): Promise<void> {
    signingOut = true;
    authGeneration++;
    profileSeq++;
    profilePatchQueue = Promise.resolve();
    clearKeysCache();
    syncLangFromProfile(null);
    currentMe = null;
    currentSession = null;
    lastFetchedUid = null;
    const generation = authGeneration;
    notify();
    if (client) {
      try {
        await client.auth.signOut({ scope: 'local' });
      } catch {
        /* 네트워크 오류 무시 */
      }
    }
    // The SDK must read the stored session to revoke its refresh token first.
    if (generation === authGeneration) {
      signingOut = false;
      try {
        localStorage.removeItem('ulp:auth');
      } catch {
        /* 저장 불가 무시 */
      }
    }
  }

  async function updateProfile(patch: ProfilePatchInput): Promise<MeProfile> {
    const generation = authGeneration;
    const uid = currentSession?.user?.id;
    const isSessionCurrent = () => Boolean(uid && generation === authGeneration && uid === currentSession?.user?.id);
    const pending = profilePatchQueue.then(async () => {
      // Independent settings writes must all reach the server, in order.
      if (!isSessionCurrent()) throw obsoleteRequest();
      const request = profileRequest();
      try {
        const updated = await requestApi<MeProfile>('/api/v1/me', {
          method: 'PATCH',
          body: JSON.stringify(patch || {}),
        }, request.valid);
        if (!request.valid() || updated?.id !== request.uid) throw obsoleteRequest();
        currentMe = updated;
        lastFetchedUid = updated.id;
        syncLangFromProfile(updated.locale ?? null);
        saveKeysCache(updated);
        notify();
        return updated;
      } catch (error) {
        if (!request.valid()) throw obsoleteRequest();
        throw error;
      }
    });
    // Release the queue after either outcome; the caller still receives the error.
    profilePatchQueue = pending.then(() => undefined, () => undefined);
    return pending;
  }

  async function deleteAccount(confirmText: string): Promise<{ ok: boolean }> {
    const res = await apiFetch<{ ok: boolean }>('/api/v1/me', {
      method: 'DELETE',
      body: JSON.stringify({ confirmText: String(confirmText || '') }),
    });
    await signOut();
    return res;
  }

  function onChange(fn: (state: AuthState) => void): () => void {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    try {
      fn(getSnapshot());
    } catch {
      /* 초기 콜백 오류 무시 */
    }
    return () => {
      listeners.delete(fn);
    };
  }

  async function init(): Promise<void> {
    if (!client) {
      notify();
      return;
    }
    client.auth.onAuthStateChange((event, session) => {
      const prevUid = currentSession && currentSession.user ? currentSession.user.id : null;
      const nextUid = session && session.user ? session.user.id : null;
      if (session) signingOut = false;
      acceptSession(session || null);

      if (event === 'SIGNED_OUT' || !session) {
        currentMe = null;
        lastFetchedUid = null;
        clearKeysCache();
        syncLangFromProfile(null);
        notify();
        return;
      }

      if (prevUid && nextUid && prevUid !== nextUid) {
        currentMe = null;
        lastFetchedUid = null;
        clearKeysCache();
        syncLangFromProfile(null);
      }

      notify();

      const shouldFetch =
        event === 'USER_UPDATED' ||
        (event === 'SIGNED_IN' && (!currentMe || lastFetchedUid !== nextUid)) ||
        Boolean(nextUid && lastFetchedUid !== nextUid);

      if (shouldFetch) {
        void fetchMe();
      }
    });
    try {
      await getAccessToken();
      notify();
      if (currentSession) {
        await fetchMe();
      }
    } catch {
      notify();
    }
  }

  void init();

  return {
    isConfigured,
    isEmbedded,
    stripHash,
    getClient: () => client,
    getSession: () => currentSession,
    getSessionGeneration: () => authGeneration,
    getUser: () => (currentSession ? currentSession.user : null),
    getMe: () => currentMe,
    getAccessToken,
    apiFetch,
    fetchMe,
    signIn,
    signOut,
    updateProfile,
    deleteAccount,
    clearKeysCache,
    computeInitial,
    onChange,
  };
}

export const auth = createAuthModule();

if (typeof window !== 'undefined' && !window.ULAuth) {
  window.ULAuth = auth;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>(() => ({
    configured: auth.isConfigured(),
    session: auth.getSession(),
    user: auth.getUser(),
    me: auth.getMe(),
  }));

  useEffect(() => {
    return auth.onChange((next) => {
      setState(next);
    });
  }, []);

  return state;
}

