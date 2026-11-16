import { useCallback, useEffect, useState } from 'react';
import { HomePage } from './components/home/HomePage';
import { AppHeader } from './components/layout/AppHeader';
import { ResultsPage } from './components/results/ResultsPage';
import { RoomPage } from './components/room/RoomPage';
import { AdminUnlockModal } from './components/themes/AdminUnlockModal';
import { ThemeListPage } from './components/themes/ThemeListPage';
import { useRoomStore } from './stores/useRoomStore';
import { useThemeStore } from './stores/useThemeStore';

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [preselectedThemeId, setPreselectedThemeId] = useState<string | null>(null);

  const colorMode = useThemeStore((s) => s.colorMode);
  const initSocketListeners = useRoomStore((s) => s.initSocketListeners);

  useEffect(() => {
    initSocketListeners();
  }, [initSocketListeners]);

  useEffect(() => {
    const root = document.documentElement;
    if (colorMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [colorMode]);

  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((nextPath: string) => {
    if (nextPath !== window.location.pathname) {
      window.history.pushState(null, '', nextPath);
      setPath(nextPath);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, []);

  const handlePlayTheme = useCallback(
    (themeId: string) => {
      setPreselectedThemeId(themeId);
      navigate('/');
    },
    [navigate],
  );

  const roomMatch = /^\/room\/([^/]+)\/?$/i.exec(path);
  const resultMatch = /^\/results\/([^/]+)\/?$/i.exec(path);

  let content = <HomePage onNavigate={navigate} initialThemeId={preselectedThemeId} />;

  if (path.startsWith('/themes')) {
    content = <ThemeListPage onNavigate={navigate} onPlayTheme={handlePlayTheme} />;
  } else if (roomMatch?.[1]) {
    content = <RoomPage roomCode={decodeURIComponent(roomMatch[1])} onNavigate={navigate} />;
  } else if (resultMatch?.[1]) {
    content = (
      <ResultsPage resultId={decodeURIComponent(resultMatch[1])} onNavigate={navigate} />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <AppHeader currentPath={path} onNavigate={navigate} />
      {content}
      <AdminUnlockModal />
    </div>
  );
}
