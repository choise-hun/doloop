// frontend/src/App.tsx
import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { communityEnabled } from './lib/features';
import { onLangChange } from './lib/i18n.mts';
import { auth } from './lib/auth';
import { clearOtherTabAccounts } from './lib/tabFiles';
import { HomePage } from './pages/HomePage';
import { ChordsPage } from './pages/ChordsPage';
import { PracticePage } from './pages/PracticePage';
import { LogPage } from './pages/LogPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotesPage } from './pages/NotesPage';
import { NoteDetailPage } from './pages/NoteDetailPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { ProgressionsPage } from './pages/ProgressionsPage';
import { CommunityPage } from './pages/CommunityPage';
import { ProfilePage } from './pages/ProfilePage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App(): React.ReactElement {
  const [, setLangTick] = useState(0);
  useEffect(() => onLangChange(() => setLangTick((n) => n + 1)), []);
  useEffect(() => {
    let stopped = false;
    let unsubscribe: (() => void) | undefined;
    let previous: string | null | undefined;
    const subscribe = () => {
      if (stopped) return;
      unsubscribe = auth.onChange(({ user }) => {
        const uid = user?.id ?? null;
        if (previous === uid) return;
        previous = uid;
        void clearOtherTabAccounts(uid);
      });
    };
    void auth.getAccessToken().then(subscribe, subscribe);
    return () => { stopped = true; unsubscribe?.(); };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/index.html" element={<HomePage />} />
          <Route path="/chords.html" element={<ChordsPage />} />
          <Route path="/practice.html" element={<PracticePage />} />
          <Route path="/log.html" element={<LogPage />} />
          <Route path="/progressions.html" element={<ProgressionsPage />} />
          <Route path="/notes.html" element={<NotesPage />} />
          <Route path="/note.html" element={<NoteDetailPage />} />
          <Route path="/settings.html" element={<SettingsPage />} />
          <Route path="/privacy.html" element={<PrivacyPage />} />
          <Route path="/community.html" element={communityEnabled() ? <CommunityPage /> : <Navigate to="/" replace />} />
          <Route path="/profile.html" element={<ProfilePage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
