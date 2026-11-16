import { normalizeRoomCode } from '@rankroom/shared';
import { ArrowRight } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useRoomStore } from '../../stores/useRoomStore';
import { ResultsPage } from '../results/ResultsPage';
import { ItemRevealView } from './ItemRevealView';
import { LobbyView } from './LobbyView';
import { VotingView } from './VotingView';

interface RoomPageProps {
  roomCode: string;
  onNavigate: (path: string) => void;
}

export function RoomPage({ roomCode, onNavigate }: RoomPageProps) {
  const normalizedCode = normalizeRoomCode(roomCode);

  const roomState = useRoomStore((s) => s.roomState);
  const lastDisplayName = useRoomStore((s) => s.lastDisplayName);
  const joining = useRoomStore((s) => s.joining);
  const error = useRoomStore((s) => s.error);
  const kickedReason = useRoomStore((s) => s.kickedReason);
  const joinRoom = useRoomStore((s) => s.joinRoom);
  const leaveRoom = useRoomStore((s) => s.leaveRoom);
  const resetToLobby = useRoomStore((s) => s.resetToLobby);

  const [displayName, setDisplayName] = useState(lastDisplayName || '');
  const [autoJoinAttempted, setAutoJoinAttempted] = useState(false);

  // Si un joueur rafraîchit sa page sur /room/K7M2P avec son pseudo déjà en sessionStorage, on reconnecte automatiquement
  useEffect(() => {
    if (kickedReason) {
      onNavigate('/');
      return;
    }
    if (
      !roomState &&
      !autoJoinAttempted &&
      lastDisplayName.trim().length > 0 &&
      normalizedCode.length === 5
    ) {
      setAutoJoinAttempted(true);
      void joinRoom({
        roomCode: normalizedCode,
        displayName: lastDisplayName,
      }).catch(() => {
        // Fallback to manual join form
      });
    }
  }, [
    roomState,
    autoJoinAttempted,
    lastDisplayName,
    normalizedCode,
    joinRoom,
    kickedReason,
    onNavigate,
  ]);

  const handleJoinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    try {
      await joinRoom({ roomCode: normalizedCode, displayName: displayName.trim() });
    } catch {
      // Error surfaced via store
    }
  };

  const handleLeave = async () => {
    await leaveRoom();
    onNavigate('/');
  };

  if (!roomState || roomState.roomCode !== normalizedCode) {
    return (
      <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="font-mono text-xs font-semibold tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
            SALLE {normalizedCode}
          </p>
          <h1 className="mt-1 text-xl font-bold text-zinc-900 dark:text-zinc-100">
            Rejoindre la partie
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Choisissez votre pseudo pour entrer dans la salle.
          </p>

          {error ? (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              {error}
            </div>
          ) : null}

          <form onSubmit={handleJoinSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="direct-join-name"
                className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
              >
                Votre pseudo
              </label>
              <input
                id="direct-join-name"
                type="text"
                maxLength={24}
                required
                autoFocus
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex: Alex"
                className="mt-1.5 h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 text-sm text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </div>

            <button
              type="submit"
              disabled={joining}
              className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <span>{joining ? 'Connexion…' : 'Entrer dans la salle'}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="h-10 w-full rounded-lg border border-zinc-200 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Retour à l’accueil
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (roomState.phase === 'LOBBY') {
    return <LobbyView roomState={roomState} onLeave={() => void handleLeave()} />;
  }

  if (roomState.phase === 'VOTING') {
    return <VotingView roomState={roomState} />;
  }

  if (roomState.phase === 'ITEM_REVEAL') {
    return <ItemRevealView roomState={roomState} />;
  }

  const selfPlayer = roomState.players.find((p) => p.id === roomState.selfPlayerId);

  return (
    <ResultsPage
      liveResult={roomState.finalResult}
      isHost={Boolean(selfPlayer?.isHost)}
      onResetToLobby={resetToLobby}
      onNavigate={onNavigate}
    />
  );
}
