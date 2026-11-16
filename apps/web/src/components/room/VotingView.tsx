import type { PublicRoomState } from '@rankroom/shared';
import { FastForward, Maximize2, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRoomStore } from '../../stores/useRoomStore';
import { DialogShell } from '../ui/DialogShell';
import { ItemThumbnail } from '../ui/ItemThumbnail';
import { PlayerRoster } from './PlayerRoster';
import { StarRatingInput } from './StarRatingInput';

interface VotingViewProps {
  roomState: PublicRoomState;
}

function computeRemainingSeconds(targetMs: number | null, nowMs: number): number | null {
  if (targetMs === null) return null;
  return Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
}

export function VotingView({ roomState }: VotingViewProps) {
  const castVote = useRoomStore((s) => s.castVote);
  const nextItem = useRoomStore((s) => s.nextItem);
  const kickPlayer = useRoomStore((s) => s.kickPlayer);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const item = roomState.currentItem;
  const selfPlayer = roomState.players.find((p) => p.id === roomState.selfPlayerId);
  const isHost = Boolean(selfPlayer?.isHost);
  const currentScore = item ? roomState.myVotes[item.id] : undefined;

  useEffect(() => {
    setNowMs(Date.now());
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 200);
    return () => window.clearInterval(interval);
  }, [roomState.phaseEndsAt, roomState.allVotedGraceEndsAt, item?.id]);

  // Reset lightbox when item changes
  useEffect(() => {
    setLightboxOpen(false);
    setAdvancing(false);
  }, [item?.id]);

  // Keyboard shortcuts 1..5 (disabled in inputs/textarea/select or open modals)
  useEffect(() => {
    if (!item) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (lightboxOpen) return;
      if (document.querySelector('[role="dialog"]')) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const num = Number(e.key);
      if (Number.isInteger(num) && num >= 1 && num <= 5) {
        e.preventDefault();
        void castVote(item.id, num);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, lightboxOpen, castVote]);

  if (!item) return null;

  const phaseSec = computeRemainingSeconds(roomState.phaseEndsAt, nowMs);
  const graceSec = computeRemainingSeconds(roomState.allVotedGraceEndsAt, nowMs);

  const handleForceNext = async () => {
    setAdvancing(true);
    try {
      await nextItem();
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      {/* Top phase bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {roomState.theme.title} · Salle{' '}
            <span className="font-mono font-semibold">{roomState.roomCode}</span>
          </p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
            Item {roomState.currentItemIndex + 1} / {roomState.totalItems}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {phaseSec !== null ? (
            <div
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 font-mono text-sm font-semibold tabular-nums ${
                phaseSec <= 5
                  ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
                  : 'border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'
              }`}
            >
              <Timer className="h-4 w-4" aria-hidden="true" />
              <span>{phaseSec}s</span>
            </div>
          ) : (
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Chrono illimité
            </span>
          )}

          {isHost ? (
            <button
              type="button"
              disabled={advancing}
              onClick={() => void handleForceNext()}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <span>Passer à la suite</span>
              <FastForward className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {graceSec !== null ? (
        <div
          role="status"
          className="mt-4 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 tabular-nums dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          <span className="font-medium">
            Tout le monde a voté — suite dans {Math.max(1, graceSec)}s…
          </span>
          <span className="text-xs text-emerald-700 dark:text-emerald-300">
            Vous pouvez encore ajuster votre note
          </span>
        </div>
      ) : null}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-12">
        <main className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 lg:col-span-8 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="relative overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950">
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label={`Agrandir l'image de ${item.name}`}
              className="group relative block w-full focus-visible:outline-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100"
            >
              <ItemThumbnail
                src={item.imagePath}
                alt={item.name}
                fit="contain"
                className="mx-auto h-64 w-full sm:h-80"
              />
              <span className="absolute right-2.5 bottom-2.5 inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200/80 bg-white/90 px-2.5 text-xs font-medium text-zinc-700 opacity-85 transition-opacity group-hover:opacity-100 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-200">
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Agrandir</span>
              </span>
            </button>
          </div>

          <div className="mt-5 text-center">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl dark:text-zinc-100">
              {item.name}
            </h1>
            {item.description ? (
              <p className="mx-auto mt-1.5 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
                {item.description}
              </p>
            ) : null}
          </div>

          <div className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <StarRatingInput
              value={currentScore}
              scale={roomState.settings.ratingScale}
              onChange={(score) => void castVote(item.id, score)}
            />
          </div>
        </main>

        <div className="lg:col-span-4">
          <PlayerRoster
            players={roomState.players}
            selfPlayerId={roomState.selfPlayerId}
            isHost={isHost}
            showVoteStatus={true}
            voteStatuses={roomState.voteStatuses}
            onKickPlayer={kickPlayer}
          />
        </div>
      </div>

      <DialogShell
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        title={item.name}
        description={item.description || undefined}
        maxWidthClass="max-w-3xl"
      >
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950">
          <ItemThumbnail
            src={item.imagePath}
            alt={item.name}
            fit="contain"
            className="max-h-[70vh] w-full"
          />
        </div>
      </DialogShell>
    </div>
  );
}
