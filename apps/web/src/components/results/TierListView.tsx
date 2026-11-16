import {
  TIER_DEFINITIONS,
  groupResultsByTier,
  type PersistedGameResult,
  type Tier,
} from '@rankroom/shared';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { exportTierListToPng } from '../../lib/export-png';
import { useThemeStore } from '../../stores/useThemeStore';
import { ItemThumbnail } from '../ui/ItemThumbnail';

interface TierListViewProps {
  result: PersistedGameResult;
}

const TIER_HEADER_CLASSES: Record<Tier, string> = {
  S: 'bg-red-700 text-white',
  A: 'bg-orange-700 text-white',
  B: 'bg-amber-700 text-white',
  C: 'bg-emerald-700 text-white',
  D: 'bg-zinc-700 text-white',
};

export function TierListView({ result }: TierListViewProps) {
  const colorMode = useThemeStore((s) => s.colorMode);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { tiers, unranked } = groupResultsByTier(result.rankings);

  const handleExportPng = async () => {
    setExportError(null);
    setExporting(true);
    try {
      await exportTierListToPng(result, colorMode === 'dark');
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Erreur lors de l'export PNG.",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Répartition automatique : S (≥ 4.50) · A (3.75–4.49) · B (2.75–3.74) · C (1.75–2.74) · D (&lt; 1.75)
        </p>

        <button
          type="button"
          disabled={exporting}
          onClick={() => void handleExportPng()}
          className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>{exporting ? 'Génération PNG…' : 'Exporter en PNG'}</span>
        </button>
      </div>

      {exportError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {exportError}
        </p>
      ) : null}

      <div className="space-y-2.5">
        {TIER_DEFINITIONS.map((def) => {
          const items = tiers[def.tier];
          return (
            <div
              key={def.tier}
              className="flex min-h-28 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div
                className={`flex w-24 shrink-0 flex-col items-center justify-center px-2 text-center ${TIER_HEADER_CLASSES[def.tier]}`}
              >
                <span className="text-2xl font-bold tracking-tight">{def.tier}</span>
                <span className="mt-0.5 whitespace-nowrap font-mono text-[10px] opacity-85 tabular-nums">
                  {def.rangeLabel}
                </span>
              </div>

              <div className="flex flex-1 flex-wrap items-center gap-3 p-3">
                {items.length === 0 ? (
                  <span className="px-2 text-xs text-zinc-400 dark:text-zinc-500">
                    Aucun item dans ce palier
                  </span>
                ) : (
                  items.map((item) => (
                    <div
                      key={item.itemId}
                      className="w-32 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 sm:w-36 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <ItemThumbnail
                        src={item.imagePath}
                        alt={item.name}
                        fit="contain"
                        className="h-20 w-full bg-zinc-100 dark:bg-zinc-900"
                      />
                      <div className="px-2.5 py-2">
                        <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {item.name}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                          #{item.rank} ·{' '}
                          {item.averageScore !== null
                            ? `${item.averageScore.toFixed(2)}/5`
                            : '—'}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}

        {unranked.length > 0 ? (
          <div className="flex min-h-24 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex w-24 shrink-0 flex-col items-center justify-center bg-zinc-500 px-2 text-center text-white">
              <span className="text-xl font-bold">—</span>
              <span className="mt-0.5 whitespace-nowrap text-[10px] opacity-90">Non notés</span>
            </div>
            <div className="flex flex-1 flex-wrap items-center gap-3 p-3">
              {unranked.map((item) => (
                <div
                  key={item.itemId}
                  className="w-32 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 sm:w-36 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <ItemThumbnail
                    src={item.imagePath}
                    alt={item.name}
                    fit="contain"
                    className="h-20 w-full bg-zinc-100 dark:bg-zinc-900"
                  />
                  <div className="px-2.5 py-2">
                    <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {item.name}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                      #{item.rank} · 0 vote
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
