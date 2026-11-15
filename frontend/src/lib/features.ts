// frontend/src/lib/features.ts
// 화면에서 잠시 가리는 기능 스위치.
// 커뮤니티: 2026-11-15 사용자 결정으로 화면 진입점(메뉴·버튼·섹션·주소)만 숨긴다.
// 서버 API·컴포넌트 코드는 그대로 두며, 다시 열 때는 기본값을 true로 바꾼다.
// 테스트·개발 확인용으로 localStorage 'ulp-feature-community'='1'이면 켠다.

const COMMUNITY_DEFAULT = false;
export const COMMUNITY_FEATURE_KEY = 'ulp-feature-community';

export function communityEnabled(): boolean {
  if (COMMUNITY_DEFAULT) return true;
  try {
    return globalThis.localStorage?.getItem(COMMUNITY_FEATURE_KEY) === '1';
  } catch {
    return false;
  }
}
