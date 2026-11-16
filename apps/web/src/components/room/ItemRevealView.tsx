import type { PublicRoomState } from '@rankroom/shared';
import { ArrowRight, Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRoomStore } from '../../stores/useRoomStore';
import { ItemThumbnail } from '../ui/ItemThumbnail';

interface ItemRevealViewProps {
  roomState: PublicRoomState;
}

export function ItemRevealView({ roomState }: ItemRevealViewProps) {
  const nextItem = useRoomStore((s) => s.nextItem);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [advancing, setAdvancing] = useState(false);

  const reveal = roomState.currentReveal;
  const selfPlayer = roomState.players.find((p) => p.id === roomState.selfPlayerId);
  const isHost = Boolean(selfPlayer?.isHost);

  useEffect(() => {
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [roomState.phaseEndsAt]);

  if (!reveal) return null;

  const remainingSec =
    roomState.phaseEndsAt !== null
      ? Math.max(0, Math.ceil((roomState.phaseEndsAt - nowMs) / 1000))
      : null;

  const isLastItem = reveal.itemIndex + 1 >= reveal.totalItems;

  const handleNext = async () => {
    setAdvancing(true);
    try {
      await nextItem();
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <p className="font-mono text-xs font-medium text-zinc-500 tabular-nums dark:text-zinc-400">
            Révélation · Item {reveal.itemIndex + 1} / {reveal.totalItems}
          </p>

          {remainingSec !== null ? (
            <span className="font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
              Suite automatique dans {remainingSec}s
            </span>
          ) : null}
        </div>

        <div className="mt-6 grid items-center gap-6 sm:grid-cols-12">
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 sm:col-span-5 dark:border-zinc-800 dark:bg-zinc-950">
            <ItemThumbnail
              src={reveal.item.imagePath}
              alt={reveal.item.name}
              fit="contain"
              className="h-52 w-full"
            />
          </div>

          <div className="sm:col-span-7">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {reveal.item.name}
            </h1>
            {reveal.item.description ? (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {reveal.item.description}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-baseline gap-6 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Moyenne obtenue</p>
                <p className="mt-0.5 flex items-center gap-1.5 font-mono text-3xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                  <Star className="h-6 w-6 fill-amber-400 text-amber-500" aria-hidden="true" />
                  <span>
                    {reveal.averageScore !== null
                      ? `${reveal.averageScore.toFixed(2)} / 5`
                      : 'Non noté'}
                  </span>
                </p>
              </div>

              {reveal.stdDev !== null ? (
                <div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Écart-type (σ)</p>
                  <p className="mt-0.5 font-mono text-lg font-semibold text-zinc-700 tabular-nums dark:text-zinc-300">
                    {reveal.stdDev.toFixed(2)}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Détail des votes ({reveal.voteCount})
          </h2>

          {reveal.votes.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Aucun vote enregistré pour cet item.
            </p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {reveal.votes.map((vote) => (
                <div
                  key={vote.playerId}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {vote.displayName}
                  </span>
                  <span className="ml-2 flex shrink-0 items-center gap-1 font-mono text-sm font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden="true" />
                    <span>{vote.score}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {isHost ? (
          <div className="mt-6 flex justify-end border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <button
              type="button"
              disabled={advancing}
              onClick={() => void handleNext()}
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <span>
                {isLastItem ? 'Voir le classement final' : 'Item suivant'}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
