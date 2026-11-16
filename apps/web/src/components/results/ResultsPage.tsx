import * as Tabs from '@radix-ui/react-tabs';
import type { PersistedGameResult } from '@rankroom/shared';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchGameResult } from '../../lib/api';
import { LeaderboardView } from './LeaderboardView';
import { TierListView } from './TierListView';

interface ResultsPageProps {
  resultId?: string;
  liveResult?: PersistedGameResult | null;
  isHost?: boolean;
  onResetToLobby?: () => Promise<void>;
  onNavigate: (path: string) => void;
}

export function ResultsPage({
  resultId,
  liveResult,
  isHost = false,
  onResetToLobby,
  onNavigate,
}: ResultsPageProps) {
  const [fetchedResult, setFetchedResult] = useState<PersistedGameResult | null>(null);
  const [loading, setLoading] = useState(!liveResult && Boolean(resultId));
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [resetting, setResetting] = useState(false);

  const result = liveResult ?? fetchedResult;

  useEffect(() => {
    if (liveResult || !resultId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchGameResult(resultId)
      .then((data) => {
        if (!cancelled) {
          setFetchedResult(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Résultat introuvable ou supprimé.',
          );
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [resultId, liveResult]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="h-48 animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Résultat introuvable
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {error ?? 'Ce lien de résultat ne correspond à aucune partie enregistrée.'}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="mt-6 inline-flex h-10 items-center rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Retour à l’accueil
          </button>
        </div>
      </div>
    );
  }

  const permanentUrl = `${window.location.origin}/results/${result.id}`;
  const formattedDate = new Date(result.createdAt).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const handleCopyPermanentLink = async () => {
    try {
      await navigator.clipboard.writeText(permanentUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleReset = async () => {
    if (!onResetToLobby) return;
    setResetting(true);
    try {
      await onResetToLobby();
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <div>
          <p className="text-xs font-medium text-zinc-500 tabular-nums dark:text-zinc-400">
            {result.themeCategory} · Salle{' '}
            <span className="font-mono">{result.roomCode}</span> · {result.players.length}{' '}
            participant{result.players.length > 1 ? 's' : ''} · {formattedDate}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            {result.themeTitle}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void handleCopyPermanentLink()}
            className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {copiedLink ? (
              <>
                <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                <span>Lien permanent copié</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden="true" />
                <span>Copier le lien permanent</span>
              </>
            )}
          </button>

          {isHost && onResetToLobby ? (
            <button
              type="button"
              disabled={resetting}
              onClick={() => void handleReset()}
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>{resetting ? 'Réinitialisation…' : 'Rejouer dans cette salle'}</span>
            </button>
          ) : null}
        </div>
      </div>

      <Tabs.Root defaultValue="leaderboard" className="mt-6">
        <Tabs.List
          aria-label="Affichage des résultats"
          className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900"
        >
          <Tabs.Trigger
            value="leaderboard"
            className="h-9 whitespace-nowrap rounded-md px-4 text-sm font-medium text-zinc-600 transition-colors data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-xs dark:text-zinc-400 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-zinc-100"
          >
            Classement
          </Tabs.Trigger>
          <Tabs.Trigger
            value="tierlist"
            className="h-9 whitespace-nowrap rounded-md px-4 text-sm font-medium text-zinc-600 transition-colors data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-xs dark:text-zinc-400 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-zinc-100"
          >
            Tier List
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="leaderboard" className="mt-5 focus:outline-none">
          <LeaderboardView rankings={result.rankings} />
        </Tabs.Content>

        <Tabs.Content value="tierlist" className="mt-5 focus:outline-none">
          <TierListView result={result} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
