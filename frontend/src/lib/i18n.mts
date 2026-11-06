// L0: 다국어 엔진 — t(key, vars). 사전은 ./i18n/<lang>.mts. 언어 전환·자동 감지는 L1-2(계획/l1_2.md)
// 규칙: t()는 함수 안에서 호출한다(모듈 최상위 상수에 결과를 저장하지 않는다 — 명세 L0 §1 D5)
import { KO } from './i18n/ko.mts';

export type LocaleCode = 'ko' | 'en' | 'ja';
export type I18nKey = keyof typeof KO;
export type I18nVars = Record<string, string | number>;

const DICTS: Partial<Record<LocaleCode, Record<I18nKey, string>>> = { ko: KO };
let current: LocaleCode = 'ko';

export function getLang(): LocaleCode {
  return current;
}

export function t(key: I18nKey, vars?: I18nVars): string {
  const dict = DICTS[current] || KO;
  const s: unknown = dict[key] ?? KO[key];
  if (typeof s !== 'string') return String(key);
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m
  );
}
