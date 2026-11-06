// L0: 한국어 사전. 키 규칙 <영역>.<camelCase> — 명세 개발산출물/명세/L0_구현명세.md §1 D4
export const KO = {
  // AppShell 위 메뉴·탭 바
  'nav.ariaSite': '사이트',
  'nav.ariaTabs': '주요 메뉴',
  'nav.home': '⌂ HOME',
  'nav.learn': 'LEARN',
  'nav.play': 'PLAY',
  'nav.trails': 'TRAILS',
  'nav.chords': 'CHORDS',
  'nav.notes': 'NOTES',
  'nav.settings': 'SETTING',
  'nav.login': 'LOGIN',
  'nav.disabledTitle': '준비 중',
  'nav.accountAria': '계정 설정 ({who})',
  'nav.loginAria': 'Google 계정으로 로그인',
  // AppShell 푸터 테마
  'theme.group': '화면 모드',
  'theme.light': '라이트',
  'theme.dark': '다크',
  // jobError.mts — 분석 작업 실패
  'job.billing.title': '서비스 점검',
  'job.billing.hint': '서버의 AI 사용 한도에 문제가 생겼어요. 크레딧은 돌려드렸어요. 잠시 뒤 다시 시도하고, 계속되면 운영자에게 알려 주세요.',
  'job.rateLimit.title': '요청 몰림',
  'job.rateLimit.hint': '분석 요청이 몰렸어요. 크레딧은 돌려드렸어요. 잠시 뒤 다시 시도해 주세요.',
  'job.overloaded.title': 'AI 일시 장애',
  'job.overloaded.hint': 'Google 쪽 서버가 붐벼 응답하지 못했어요. 크레딧은 돌려드렸어요. 잠시 뒤 다시 시도해 주세요.',
  'job.keyInvalid.title': '서비스 점검',
  'job.keyInvalid.hint': '서버의 AI 연결에 문제가 생겼어요. 크레딧은 돌려드렸어요. 잠시 뒤 다시 시도하고, 계속되면 운영자에게 알려 주세요.',
  'job.apiError.title': '분석 실패',
  'job.apiError.hint': '영상이 비공개·삭제됐거나 AI가 요청을 거절했어요. 크레딧은 돌려드렸어요.',
  'job.maxTokens.title': '분석량 초과',
  'job.maxTokens.hint': '영상 내용이 많아 결과가 잘렸어요. 크레딧은 돌려드렸어요. 구간을 줄여 다시 시도해 주세요.',
  'job.unknown.title': '분석 실패',
  'job.unknown.hint': '원인을 알 수 없어요. 잠시 뒤 다시 시도해 주세요.',
  // jobError.mts — 티어 이름
  'tier.free': '무료',
  'tier.pro': 'Pro',
  'tier.proPlus': 'Pro+',
  // jobError.mts — 분석 요청 오류
  'analyze.tierRequired': 'AI 영상 분석은 {tier} 플랜부터 쓸 수 있어요.',
  'analyze.creditNums': ' (필요 {required} · 남은 {balance})',
  'analyze.insufficientCredits': '크레딧이 부족해요{nums}. 구간을 줄이거나 다음 지급 뒤에 다시 시도해 주세요.',
  'analyze.unavailable': 'AI 분석을 잠시 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.',
  'analyze.videoNotFound': '영상을 찾을 수 없어요. 공개 또는 일부 공개 영상인지 확인해 주세요.',
  'analyze.requestFailed': '요청 실패',
  // M2-1a — AI 기능 BETA 표시 (BetaBadge·NotesPage·VideoAnalyzeForm)
  'beta.label': 'BETA',
  'beta.notice':
    'AI 분석(Beta)은 영상의 음향·화질에 따라 일부 코드나 보이싱이 실제 연주와 다를 수 있어요. 분석 결과는 나만 보는 학습 참고용으로 보관돼요.',
} as const;
