import { Moon, Sun } from 'lucide-react';
import { useThemeStore } from '../../stores/useThemeStore';

interface AppHeaderProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function AppHeader({ currentPath, onNavigate }: AppHeaderProps) {
  const colorMode = useThemeStore((s) => s.colorMode);
  const toggleColorMode = useThemeStore((s) => s.toggleColorMode);

  const isThemesActive = currentPath.startsWith('/themes');
  const isPlayActive = !isThemesActive && !currentPath.startsWith('/results');

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('/');
          }}
          className="whitespace-nowrap shrink-0 text-lg font-bold tracking-tight text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 dark:text-zinc-100 dark:focus-visible:outline-zinc-100"
        >
          RankRoom
        </a>

        <nav className="flex items-center gap-6" aria-label="Navigation principale">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className={`whitespace-nowrap shrink-0 border-b-2 py-1 text-sm font-medium transition-colors duration-150 ${
              isPlayActive
                ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            Jouer
          </a>
          <a
            href="/themes"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/themes');
            }}
            className={`whitespace-nowrap shrink-0 border-b-2 py-1 text-sm font-medium transition-colors duration-150 ${
              isThemesActive
                ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            Thèmes
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={toggleColorMode}
            aria-label={
              colorMode === 'dark' ? 'Passer au mode clair' : 'Passer au mode sombre'
            }
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus-visible:outline-zinc-100"
          >
            {colorMode === 'dark' ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
