// frontend/src/App.tsx
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell, AppShellVariant, ActiveNavKey } from './components/layout/AppShell';
import { HomePage } from './pages/HomePage';
import { ChordsPage } from './pages/ChordsPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotesPage } from './pages/NotesPage';
import { NoteDetailPage } from './pages/NoteDetailPage';
import { PrivacyPage } from './pages/PrivacyPage';

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
          <Route path="/" element={<HomePage />} />
          <Route path="/index.html" element={<HomePage />} />
          <Route path="/chords.html" element={<ChordsPage />} />
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
          <Route path="/notes.html" element={<NotesPage />} />
          <Route path="/note.html" element={<NoteDetailPage />} />
          <Route path="/settings.html" element={<SettingsPage />} />
          <Route path="/privacy.html" element={<PrivacyPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
