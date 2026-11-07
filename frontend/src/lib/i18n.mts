import { KO } from './i18n/ko.mts';
import { EN } from './i18n/en.mts';
import { JA } from './i18n/ja.mts';
export type LocaleCode = 'ko' | 'en' | 'ja';
export type LangChoice = LocaleCode | 'auto';
export type I18nKey = keyof typeof KO;
export type I18nVars = Record<string, string | number>;
const STORAGE_KEY = 'ulp:lang';
const SUPPORTED: readonly LocaleCode[] = ['ko', 'en', 'ja'];
const DICTS: Record<LocaleCode, Record<I18nKey, string>> = { ko: KO, en: EN, ja: JA };
let profileLocaleCache: LocaleCode | null = null;
let explicitChoice: LangChoice | null = null;
const listeners = new Set<(lang: LocaleCode) => void>();

function isLocale(v: unknown): v is LocaleCode {
  return typeof v === 'string' && (SUPPORTED as readonly string[]).includes(v);
}
function readStoredChoice(): LocaleCode | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isLocale(raw) ? raw : null;
  } catch { return null; }
}
function applyDomLang(lang: LocaleCode): void {
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lang;
}
export function resolveActiveLang(): LocaleCode {
  const stored = readStoredChoice();
  if (stored) return stored;
  if (explicitChoice && explicitChoice !== 'auto') return explicitChoice;
  if (profileLocaleCache) return profileLocaleCache;
  if (typeof window === 'undefined') return 'ko'; // D4: Node 기본 격리
  if (typeof navigator !== 'undefined') {
    const navs = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages : navigator.language ? [navigator.language] : [];
    for (const raw of navs) {
      const primary = String(raw || '').split('-')[0].toLowerCase();
      if (isLocale(primary)) return primary;
    }
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === 'Asia/Tokyo') return 'ja';
    if (tz === 'Asia/Seoul') return 'ko';
  } catch { /* ignore */ }
  return 'ko';
}

let current: LocaleCode = resolveActiveLang();
applyDomLang(current);

export function getLang(): LocaleCode { return current; }
export function getLangChoice(): LangChoice { return readStoredChoice() ?? explicitChoice ?? 'auto'; }
export function setLang(choice: LangChoice): LocaleCode {
  explicitChoice = choice;
  if (choice === 'auto') profileLocaleCache = null; // Auto 선택 시 기존 프로필 캐시 즉시 해제
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (choice === 'auto') window.localStorage.removeItem(STORAGE_KEY);
      else if (isLocale(choice)) window.localStorage.setItem(STORAGE_KEY, choice);
    }
  } catch { /* ignore */ }
  current = resolveActiveLang();
  applyDomLang(current);
  listeners.forEach((fn) => fn(current));
  return current;
}
export function syncLangFromProfile(locale: string | null | undefined): LocaleCode {
  profileLocaleCache = isLocale(locale) ? locale : null;
  const next = resolveActiveLang();
  const changed = next !== current;
  current = next;
  applyDomLang(current);
  if (changed) listeners.forEach((fn) => fn(current));
  return current;
}
export function onLangChange(listener: (lang: LocaleCode) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function t(key: I18nKey, vars?: I18nVars): string {
  const dict = DICTS[current] || KO;
  const raw = dict[key] ?? KO[key] ?? String(key);
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}
