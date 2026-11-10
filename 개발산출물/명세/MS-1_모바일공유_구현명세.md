# MS-1 모바일 유튜브 공유 연동 (Android PWA & Capacitor Native App) 구현 명세

- **목표:** 모바일 기기에서 유튜브 앱의 [공유] 버튼을 눌렀을 때, ULevelP가 시스템 공유 대상(Share Sheet)으로 나타나며, 선택 시 해당 유튜브 영상을 ULevelP 연습곡 리스트에 원클릭으로 추가하거나 즉시 연습 플레이어로 이동할 수 있도록 연동한다.
- **범위:**
  1. **안드로이드 웹 (PWA):** Web Share Target API 적용 (`manifest.json` `share_target`)
  2. **모바일 네이티브 앱 (Capacitor):**
     * **Android 앱:** `AndroidManifest.xml`의 `SEND` Intent Filter 설정
     * **iOS 앱:** iOS Share Extension 타깃 및 Custom URL Scheme (`ulevelp://share?url=...`) 설정
  3. **공통 프론트엔드 처리:** 공유 수신 전용 라우트(`/share-target`) 및 유튜브 URL/텍스트 정규식 파서, `POST /api/v1/songs` 등록 처리.
- **선행 조건:** 현재 진행 중인 ST-2(설정 화면) 완료 및 main 머지 후 착수 (Capacitor 도입은 기존 `개발산출물/진행_모바일스파이크.md` M0-0 기반).

---

## 1. Pre-flight 5대 관문

| 관문 | 점검 항목 | 결과 및 증거 (`file:line`) |
|---|---|---|
| ① 앱 격리·호환 | `app_id = 'ulevelp'`, `/api/v1` 규격 준수 | 공유 수신 후 곡 등록은 기존 검증된 `src/main/kotlin/ulevelp/routes/SongRoutes.kt:46-75` (`POST /api/v1/songs`)를 100% 동일하게 호출. 백엔드 신규 라우트 생성 없음. |
| ② 동시성·트랜잭션 | 딥링크 다중 수신 및 세션 복원 | 앱이 백그라운드에 있을 때와 콜드 스타트(Cold Start) 시 중복 인텐트 처리 방지(`handledIntentIdRef`). 미로그인 상태 시 `pendingShareTrack`을 LocalStorage에 임시 저장 후 로그인 완료 시 자동 등록. |
| ③ 전제 실재성 | 프론트엔드 라우터 및 API 클라이언트 | `frontend/src/App.tsx:30-80` 라우트 목록, `frontend/src/lib/api.ts` 또는 `apiClient`의 `POST /api/v1/songs` 호출부 실재 확인. |
| ④ 작업 줄 충돌 | 현재 ST 작업 및 기존 파일 충돌 여부 | 프론트엔드는 신규 페이지 `frontend/src/pages/ShareTargetPage.tsx` 및 `manifest.json` 추가 위주이며, 기존 `SettingsPage.tsx`와 변경 범위 충돌 없음. |
| ⑤ 메뉴얼 게이트 | 스키마·API 계약 변경 여부 | 기존 백엔드 API 계약 변경 없음. 프론트엔드 라우트 추가 및 Capacitor 네이티브 설정 추가만 수행. |

---

## 2. 결정 사항 (Decision Matrix)

| ID | 항목 | 결정 내용 | 근거 |
|---|---|---|---|
| D-MS-01 | 안드로이드 웹 지원 | W3C Web Share Target API v2 | 설치형 PWA(홈 화면 추가) 상태에서 안드로이드 OS 시스템 공유 창에 별도 네이티브 빌드 없이 1순위로 즉시 노출 가능. |
| D-MS-02 | 하이브리드 앱 프레임워크 | Capacitor 6+ 공식 도입 | 기존 Vite + React 코드를 100% 보존하면서 안드로이드 및 iOS 네이티브 기능(Intent, Share Extension)을 브리지 연동. |
| D-MS-03 | 유튜브 공유 텍스트 파싱 | 다중 URL 정규식 파서 (`extractYouTubeVideoId`) | 유튜브 앱에서 공유 시 순수 URL만 오는 것이 아니라 `"제목 https://youtu.be/xxx?si=yyy"` 형태로 텍스트가 섞여 오므로 필수 정제 필요. |
| D-MS-04 | 등록 후 사용자 경험 (UX) | "추가 모달" 표시 후 선택지 제공 | 즉시 등록 후 자동으로 곡 상세/연습 페이지(`/practice?v=...`)로 갈지, 곡 목록(`/songs`)에 머물지 묻는 가벼운 바텀시트(Bottom Sheet) 모달 제공. |
| D-MS-05 | 미로그인 시 Fallback | 로컬 임시 보관 후 로그인 리다이렉트 | 비로그인 상태에서 공유가 들어와도 데이터 유실 없이 로그인 화면으로 이동 후 즉시 복원 등록. |

---

## 3. 플랫폼별 상세 아키텍처

```
[모바일 유튜브 앱]
      │ [공유] 버튼 클릭
      ├─────────────────────────────────────────────────┐
      ▼ (Android Web PWA)                               ▼ (Capacitor Native App)
[Web Share Target]                                [System Share Sheet]
  │ POST/GET /share-target                          │
  ▼                                                 ▼
[ULevelP PWA 웹앱]                         [Android Intent / iOS Share Ext]
  │ URL 파싱 & videoId 추출                         │ Custom URL Scheme (ulevelp://share?url=...)
  └──────────────────────────┬──────────────────────┘
                             ▼
              [ULevelP 라우트: /share-target]
                             │
            ┌────────────────┴────────────────┐
            ▼ (로그인 됨)                     ▼ (미로그인)
     [POST /api/v1/songs]             [LocalStorage에 보관]
            │                                 │
     [연습 플레이어로 이동]            [로그인 페이지 이동 후 복귀]
```

---

## 4. 세부 구현 명세

### 4.1 안드로이드 웹 (PWA Web Share Target) 명세

#### 1) `frontend/public/manifest.json` 설정
```json
{
  "name": "ULeveLP",
  "short_name": "ULeveLP",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#121212",
  "theme_color": "#121212",
  "icons": [
    {
      "src": "/icon-180.png",
      "sizes": "180x180",
      "type": "image/png"
    }
  ],
  "share_target": {
    "action": "/share-target",
    "method": "GET",
    "enctype": "application/x-www-form-urlencoded",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

#### 2) `frontend/index.html` 매니페스트 링크 연결
```html
<link rel="manifest" href="/manifest.json">
```

---

### 4.2 Capacitor 네이티브 앱 (Android & iOS) 연동 명세

#### 1) Capacitor 설치 및 의존성
```bash
npm install @capacitor/core @capacitor/cli @capacitor/app @capacitor/android @capacitor/ios
npx cap init ULeveLP com.ulevelp.app --web-dir dist
```

#### 2) Android 시스템 공유 연동 (`android/app/src/main/AndroidManifest.xml`)
안드로이드 `MainActivity` 선언 내부에 `text/plain`을 수신하는 `intent-filter`를 추가합니다:
```xml
<activity
    android:name=".MainActivity"
    android:label="@string/app_name"
    android:exported="true"
    android:launchMode="singleTask">

    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>

    <!-- 유튜브 등 외부 공유 수신 인텐트 필터 -->
    <intent-filter>
        <action android:name="android.intent.action.SEND" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:mimeType="text/plain" />
    </intent-filter>

    <!-- 커스텀 URL 스킴 (iOS Share Extension 및 딥링크 공용) -->
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="ulevelp" />
    </intent-filter>
</activity>
```

#### 3) Android SEND 인텐트 수신 및 네이티브 브리지 (`MainActivity.java`)
* **배경:** Android YouTube 앱 공유는 `ACTION_SEND`와 `Intent.EXTRA_TEXT`로 전달되나, Capacitor 6 `AppPlugin`의 `handleOnNewIntent()`는 `ACTION_VIEW`와 `intent.getData()`만 `appUrlOpen` 이벤트로 전달함.
* **해결 (네이티브 브리지):** `MainActivity.java`에서 `onCreate()` 및 `onNewIntent()` 시 `ACTION_SEND`를 감지하여 공유 텍스트를 추출하고 커스텀 스킴 URL로 변환하여 처리.
```java
// android/app/src/main/java/com/ulevelp/app/MainActivity.java
package com.ulevelp.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleSendIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleSendIntent(intent);
    }

    private void handleSendIntent(Intent intent) {
        if (intent != null && Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText != null && !sharedText.isEmpty()) {
                // 커스텀 스킴 URL로 변환하여 브리지로 라우팅 (iOS Share Extension과 규격 일원화)
                String schemeUrl = "ulevelp://share?url=" + Uri.encode(sharedText);
                bridge.getWebView().post(() -> {
                    bridge.getWebView().evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('appUrlOpen', { detail: { url: '" + schemeUrl + "' } }));",
                        null
                    );
                });
            }
        }
    }
}
```

#### 4) iOS 시스템 공유 연동 (Share Extension)
* **구성:** Xcode 프로젝트 내 `ShareExtension` 타깃 추가.
* **동작:**
  1. iOS 유튜브 앱에서 [공유] 시 ULevelP Share Extension이 실행됨.
  2. `NSExtensionContext`에서 공유된 `URL` 또는 `Text` 추출.
  3. URL 스킴 `ulevelp://share?url=${encodeURIComponent(sharedUrl)}`를 호출하여 메인 앱을 열고 익스텐션 즉시 종료.
  4. 메인 앱이 포그라운드로 올라오며 해당 URL을 감지.

#### 5) Capacitor 앱 딥링크/인텐트 통합 수신 리스너 (`frontend/src/App.tsx` 또는 `main.tsx`)
```typescript
import { App as CapApp } from '@capacitor/app';

// 1. Capacitor 공식 딥링크 리스너 (iOS 커스텀 스킴 및 Android ACTION_VIEW)
CapApp.addListener('appUrlOpen', (event) => {
  handleShareUrl(event.url);
});

// 2. Android ACTION_SEND 네이티브 브리지 이벤트 리스너
window.addEventListener('appUrlOpen', (event: any) => {
  if (event.detail && event.detail.url) {
    handleShareUrl(event.detail.url);
  }
});

function handleShareUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'ulevelp:' && url.host === 'share') {
      const targetUrl = url.searchParams.get('url');
      if (targetUrl) {
        window.location.href = `/share-target?url=${encodeURIComponent(targetUrl)}`;
      }
    }
  } catch (e) {
    console.error('Failed to parse share url', e);
  }
}
```

---

### 4.3 공통 수신 페이지 및 파서 명세 (`ShareTargetPage.tsx`)

#### 1) 유튜브 Video ID 추출 정규식 파서
```typescript
export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  // youtu.be/VIDEO_ID, youtube.com/watch?v=VIDEO_ID, youtube.com/shorts/VIDEO_ID 등 전수 매칭
  const regex = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|v\/|embed\/))([a-zA-Z0-9_-]{11})/;
  const match = input.match(regex);
  return match ? match[1] : null;
}
```

#### 2) 화면 UX 플로우 (`/share-target`)
1. **파라미터 수신:** URL 쿼리 스트링에서 `url`, `text`, `title` 파싱.
2. **VideoId 추출:** `extractYouTubeVideoId(url || text)` 실행.
   - 유효하지 않은 경우: "올바른 유튜브 링크가 아닙니다." 안내 메시지 및 홈 이동 버튼 표시.
3. **중복 검사:** `GET /api/v1/songs/by-video/{videoId}` 호출.
   - 이미 저장된 곡이면: *"이미 등록된 연습곡입니다!"* 알림과 함께 [즉시 연습하기] 버튼 노출.
4. **곡 등록:** `POST /api/v1/songs` 호출
   ```json
   {
     "videoId": videoId,
     "title": parsedTitle || "새 연습곡",
     "rate": 1.00
   }
   ```
5. **완료 후 이동 선택 바텀시트:**
   - 🎸 **[바로 연습실로 이동]** -> `/practice?v={videoId}`
   - 📋 **[내 곡 목록 보기]** -> `/songs`

---

## 5. 테스트 및 검증 표 (Test Matrix)

| ID | 검증 항목 | 잡아야 할 버그 | 통과 기준 |
|---|---|---|---|
| TC-MS-01 | 안드로이드 웹 PWA Share Target | 안드로이드 공유 창에 앱 미노출 | PWA 홈화면 추가 후 유튜브 앱 [공유] 시 ULevelP가 목록에 노출되고 클릭 시 `/share-target`으로 진입함. |
| TC-MS-02 | 혼합 텍스트 파싱 | 텍스트와 URL이 섞여 있을 때 videoId 추출 실패 | `"곡명 https://youtu.be/abcdefghijk?si=123"` 형태에서 정확히 `abcdefghijk` 11자리가 추출됨. |
| TC-MS-03 | 안드로이드 Capacitor Intent 수신 | 앱 실행 중 공유 수신 시 기존 상태 덮어쓰기 오류 | 싱글 태스크 모드에서 공유 수신 시 `appUrlOpen` 이벤트로 `/share-target`이 정상 렌더링됨. |
| TC-MS-04 | iOS Share Extension URL 스킴 호출 | Safari 브라우저로 튕김 현상 | Share Extension에서 `ulevelp://share` 호출 시 네이티브 메인 앱이 즉시 열림. |
| TC-MS-05 | `POST /api/v1/songs` 자동 등록 | 비로그인 상태에서 등록 시 401 unhandled 에러 | 미로그인 시 로컬스토리지에 임시 저장 후 로그인 페이지로 안내되며 로그인 직후 등록 완료됨. |
| TC-MS-06 | 이미 등록된 곡 재공유 | 중복 생성 에러(409 또는 중복 등록) 발생 | `by-video` 조회로 기등록 곡임을 인지하고 200 OK 처리 후 바로 연습 화면 연결 안내. |
