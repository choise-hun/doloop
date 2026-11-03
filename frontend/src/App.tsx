// frontend/src/App.tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell, AppShellVariant, ActiveNavKey } from './components/layout/AppShell';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

interface RoutePlaceholderProps {
  title: string;
  subtitle: string;
  variant: AppShellVariant;
  activeNav: ActiveNavKey;
  showThemeToggle?: boolean;
}

function RouteShellPage({
  title,
  subtitle,
  variant,
  activeNav,
  showThemeToggle = false,
}: RoutePlaceholderProps): React.ReactElement {
  return (
    <AppShell variant={variant} activeNav={activeNav} showThemeToggle={showThemeToggle}>
      <section className="panelBox">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </section>
    </AppShell>
  );
}

export function App(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <RouteShellPage
                title="ULeveLP"
                subtitle="DIVE INTO SOUND"
                variant="default"
                activeNav="home"
              />
            }
          />
          <Route
            path="/index.html"
            element={
              <RouteShellPage
                title="ULeveLP"
                subtitle="DIVE INTO SOUND"
                variant="default"
                activeNav="home"
              />
            }
          />
          <Route
            path="/chords.html"
            element={
              <RouteShellPage
                title="기타 코드 연습실"
                subtitle="스케일·코드톤·보이싱·5도권·코드 재해석·2-5-1·더블 스탑"
                variant="default"
                activeNav="chords"
                showThemeToggle
              />
            }
          />
          <Route
            path="/practice.html"
            element={
              <RouteShellPage
                title="연습 플레이어"
                subtitle="유튜브 구간 반복 및 오디오 녹음"
                variant="player"
                activeNav="practice"
              />
            }
          />
          <Route
            path="/log.html"
            element={
              <RouteShellPage
                title="Log"
                subtitle="최근 12주 연습 달력과 곡별 기록·녹음"
                variant="narrow"
                activeNav="log"
              />
            }
          />
          <Route
            path="/notes.html"
            element={
              <RouteShellPage
                title="Notes"
                subtitle="Gemini 영상 분석 학습 노트 보관함"
                variant="narrow"
                activeNav="notes"
              />
            }
          />
          <Route
            path="/note.html"
            element={
              <RouteShellPage
                title="학습 노트 상세"
                subtitle="인앱 학습 노트 상세 뷰어"
                variant="narrow"
                activeNav="notes"
              />
            }
          />
          <Route
            path="/settings.html"
            element={
              <RouteShellPage
                title="Setting"
                subtitle="계정·Google Drive·노션·Gemini 키 설정"
                variant="narrow"
                activeNav="settings"
                showThemeToggle
              />
            }
          />
          <Route
            path="/privacy.html"
            element={
              <RouteShellPage
                title="Privacy"
                subtitle="ULeveLP 개인정보처리방침"
                variant="narrow"
                activeNav="privacy"
              />
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;

