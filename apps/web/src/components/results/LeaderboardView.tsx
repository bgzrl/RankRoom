import type { RankedItemResult, TieBreakReason } from '@rankroom/shared';
import { ChevronDown, ChevronUp, Star } from 'lucide-react';
import { useState } from 'react';
import { ItemThumbnail } from '../ui/ItemThumbnail';

interface LeaderboardViewProps {
  rankings: RankedItemResult[];
}

function formatTieBreak(reason: TieBreakReason, stdDev: number | null): string | null {
  if (!reason) return null;
  if (reason === 'std_dev') {
    return `Égalité départagée par consensus (σ=${stdDev !== null ? stdDev.toFixed(2) : '—'})`;
  }
  if (reason === 'max_votes') {
    return 'Égalité départagée par nombre de notes 5★';
  }
  return 'Égalité parfaite (ordre alphabétique)';
}

export function LeaderboardView({ rankings }: LeaderboardViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(
    rankings[0]?.itemId ?? null,
  );

  return (
    <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {rankings.map((item) => {
        const isExpanded = expandedId === item.itemId;
        const maxBucketCount = Math.max(
          1,
          ...item.scoreDistribution.map((b) => b.count),
        );
        const tieNote = formatTieBreak(item.tieBreakReason, item.stdDev);

        return (
          <div key={item.itemId} className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <span className="w-9 shrink-0 font-mono text-lg font-bold text-zinc-400 tabular-nums dark:text-zinc-500">
                  #{item.rank}
                </span>

                <ItemThumbnail
                  src={item.imagePath}
                  alt={item.name}
                  compact
                  className="h-14 w-20 shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-800"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.name}
                    </h3>
                    {item.tier ? (
                      <span className="font-mono text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        Tier {item.tier}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-0.5 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                    {item.voteCount} vote{item.voteCount > 1 ? 's' : ''}
                    {item.stdDev !== null ? ` · σ = ${item.stdDev.toFixed(2)}` : ''}
                    {tieNote ? ` · ${tieNote}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  {item.averageScore !== null ? (
                    <div className="flex items-center gap-1.5 font-mono text-xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                      <Star
                        className="h-4 w-4 fill-amber-400 text-amber-500"
                        aria-hidden="true"
                      />
                      <span>{item.averageScore.toFixed(2)}</span>
                      <span className="text-xs font-normal text-zinc-400">/ 5</span>
                    </div>
                  ) : (
                    <span className="font-mono text-sm font-medium text-zinc-400 dark:text-zinc-500">
                      Non noté
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-label={`Détails pour ${item.name}`}
                  onClick={() => setExpandedId(isExpanded ? null : item.itemId)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {isExpanded ? (
              <div className="mt-4 grid gap-5 border-t border-zinc-100 pt-4 sm:grid-cols-12 dark:border-zinc-800/80">
                <div className="sm:col-span-5">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Distribution des notes
                  </p>
                  <div className="mt-2.5 space-y-1.5">
                    {item.scoreDistribution.map((bucket) => (
                      <div
                        key={bucket.score}
                        className="flex items-center gap-2 text-xs tabular-nums"
                      >
                        <span className="w-7 text-right font-mono text-zinc-500 dark:text-zinc-400">
                          {bucket.score}★
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-sm bg-zinc-100 dark:bg-zinc-800">
                          <div
                            className="h-full bg-zinc-800 transition-all duration-150 dark:bg-zinc-200"
                            style={{
                              width:
                                item.voteCount > 0
                                  ? `${(bucket.count / maxBucketCount) * 100}%`
                                  : '0%',
                            }}
                          />
                        </div>
                        <span className="w-5 font-mono text-zinc-600 dark:text-zinc-400">
                          {bucket.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="sm:col-span-7">
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Notes individuelles
                  </p>
                  {item.votesByPlayer.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                      Aucun vote enregistré pour cet item.
                    </p>
                  ) : (
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                      {item.votesByPlayer.map((vote) => (
                        <div
                          key={vote.playerId}
                          className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                        >
                          <span className="truncate text-zinc-800 dark:text-zinc-200">
                            {vote.displayName}
                          </span>
                          <span className="ml-2 font-mono font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
                            {vote.score} / 5
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
