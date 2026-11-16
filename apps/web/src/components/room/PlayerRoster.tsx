import type { PublicPlayer } from '@rankroom/shared';
import { Check, Clock, Crown, UserX, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { DialogShell } from '../ui/DialogShell';

interface PlayerRosterProps {
  players: PublicPlayer[];
  selfPlayerId: string;
  isHost: boolean;
  showVoteStatus: boolean;
  voteStatuses: Record<string, boolean>;
  onKickPlayer: (targetPlayerId: string) => Promise<void>;
}

export function PlayerRoster({
  players,
  selfPlayerId,
  isHost,
  showVoteStatus,
  voteStatuses,
  onKickPlayer,
}: PlayerRosterProps) {
  const [kickTarget, setKickTarget] = useState<PublicPlayer | null>(null);
  const [kicking, setKicking] = useState(false);

  const handleConfirmKick = async () => {
    if (!kickTarget) return;
    setKicking(true);
    try {
      await onKickPlayer(kickTarget.id);
      setKickTarget(null);
    } finally {
      setKicking(false);
    }
  };

  return (
    <aside
      aria-label="Liste des joueurs"
      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Joueurs
        </h2>
        <span className="font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
          {players.filter((p) => p.connected).length}/{players.length} en ligne
        </span>
      </div>

      <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800/80">
        {players.map((player) => {
          const hasVoted = Boolean(voteStatuses[player.id]);
          const isSelf = player.id === selfPlayerId;

          return (
            <li
              key={player.id}
              className="flex items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-1"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {player.isHost ? (
                    <Crown
                      className="h-3.5 w-3.5 shrink-0 text-amber-500"
                      aria-label="Hôte"
                    />
                  ) : null}
                  <span
                    className={`truncate text-sm font-medium ${
                      player.connected
                        ? 'text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-400 line-through dark:text-zinc-500'
                    }`}
                  >
                    {player.displayName}
                    {isSelf ? ' (vous)' : ''}
                  </span>
                </div>

                {!player.connected ? (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                    <WifiOff className="h-3 w-3" aria-hidden="true" />
                    <span>Déconnecté</span>
                  </p>
                ) : showVoteStatus ? (
                  <p
                    className={`mt-0.5 flex items-center gap-1 text-xs ${
                      hasVoted
                        ? 'font-medium text-emerald-700 dark:text-emerald-400'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {hasVoted ? (
                      <>
                        <Check className="h-3 w-3" aria-hidden="true" />
                        <span>A voté</span>
                      </>
                    ) : (
                      <>
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        <span>En réflexion</span>
                      </>
                    )}
                  </p>
                ) : null}
              </div>

              {isHost && !isSelf ? (
                <button
                  type="button"
                  aria-label={`Exclure ${player.displayName}`}
                  onClick={() => setKickTarget(player)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <UserX className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <DialogShell
        open={Boolean(kickTarget)}
        onOpenChange={(open) => {
          if (!open) setKickTarget(null);
        }}
        title="Exclure ce joueur ?"
        maxWidthClass="max-w-sm"
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Souhaitez-vous retirer <strong className="text-zinc-900 dark:text-zinc-100">{kickTarget?.displayName}</strong> de la salle ?
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setKickTarget(null)}
            className="h-9 rounded-lg border border-zinc-200 px-3.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={kicking}
            onClick={() => void handleConfirmKick()}
            className="h-9 rounded-lg bg-red-600 px-3.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {kicking ? 'Exclusion…' : 'Exclure'}
          </button>
        </div>
      </DialogShell>
    </aside>
  );
}
