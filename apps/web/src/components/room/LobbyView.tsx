import type { PublicRoomState, RoomSettings } from '@rankroom/shared';
import { Check, Copy, LogOut, Play, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRoomStore } from '../../stores/useRoomStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { PlayerRoster } from './PlayerRoster';

interface LobbyViewProps {
  roomState: PublicRoomState;
  onLeave: () => void;
}

export function LobbyView({ roomState, onLeave }: LobbyViewProps) {
  const themes = useThemeStore((s) => s.themes);
  const loadThemes = useThemeStore((s) => s.loadThemes);

  const updateSettings = useRoomStore((s) => s.updateSettings);
  const resetDeck = useRoomStore((s) => s.resetDeck);
  const startGame = useRoomStore((s) => s.startGame);
  const kickPlayer = useRoomStore((s) => s.kickPlayer);

  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [resettingDeck, setResettingDeck] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selfPlayer = roomState.players.find((p) => p.id === roomState.selfPlayerId);
  const isHost = Boolean(selfPlayer?.isHost);

  useEffect(() => {
    if (isHost && themes.length === 0) {
      void loadThemes();
    }
  }, [isHost, themes.length, loadThemes]);

  const inviteUrl = `${window.location.origin}/room/${roomState.roomCode}`;

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Impossible de copier automatiquement. Copiez l'URL depuis la barre d'adresse.");
    }
  };

  const handleSettingChange = async (payload: {
    themeId?: string;
    settings?: Partial<RoomSettings>;
  }) => {
    setError(null);
    try {
      await updateSettings(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise à jour.');
    }
  };

  const handleThemeChange = async (nextThemeId: string) => {
    const nextTheme = themes.find((t) => t.id === nextThemeId);
    const shouldResetCount =
      nextTheme &&
      roomState.settings.itemCount !== null &&
      roomState.settings.itemCount >= nextTheme.itemCount;

    await handleSettingChange({
      themeId: nextThemeId,
      settings: shouldResetCount ? { itemCount: null } : undefined,
    });
  };

  const handleResetDeck = async () => {
    setError(null);
    setResettingDeck(true);
    try {
      await resetDeck();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Impossible de réinitialiser la pioche.',
      );
    } finally {
      setResettingDeck(false);
    }
  };

  const handleStart = async () => {
    setError(null);
    setStarting(true);
    try {
      await startGame();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de démarrer la partie.');
    } finally {
      setStarting(false);
    }
  };

  const itemCountPresets = [5, 10, 15, 20].filter(
    (n) => n < roomState.totalThemeItems,
  );
  const showDeckStatus = roomState.unplayedCount < roomState.totalThemeItems;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Lobby en attente
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-bold tracking-[0.18em] text-zinc-900 tabular-nums sm:text-3xl dark:text-zinc-100">
              {roomState.roomCode}
            </h1>
            <button
              type="button"
              onClick={() => void handleCopyInvite()}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Lien copié</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copier le lien d’invitation</span>
                </>
              )}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onLeave}
          className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span>Quitter la salle</span>
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Thème sélectionné
            </h2>
            {isHost && themes.length > 0 ? (
              <div className="mt-3">
                <label htmlFor="lobby-theme-select" className="sr-only">
                  Changer de thème
                </label>
                <select
                  id="lobby-theme-select"
                  value={roomState.theme.id}
                  onChange={(e) => void handleThemeChange(e.target.value)}
                  className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 text-sm font-medium text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  {themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.category} · {t.itemCount} items)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {roomState.theme.title}
                </p>
                <p className="mt-1 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                  {roomState.theme.category} · {roomState.theme.itemCount} items
                </p>
              </div>
            )}

            {roomState.theme.description ? (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                {roomState.theme.description}
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Paramètres de la partie
            </h2>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="lobby-time"
                  className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  Temps par item
                </label>
                <select
                  id="lobby-time"
                  disabled={!isHost}
                  value={
                    roomState.settings.timeLimitSeconds === null
                      ? 'unlimited'
                      : String(roomState.settings.timeLimitSeconds)
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    void handleSettingChange({
                      settings: {
                        timeLimitSeconds:
                          val === 'unlimited' ? null : (Number(val) as 15 | 30 | 60),
                      },
                    });
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 disabled:opacity-75 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="15">15 secondes</option>
                  <option value="30">30 secondes</option>
                  <option value="60">60 secondes</option>
                  <option value="unlimited">Illimité</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="lobby-scale"
                  className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  Barème
                </label>
                <select
                  id="lobby-scale"
                  disabled={!isHost}
                  value={roomState.settings.ratingScale}
                  onChange={(e) =>
                    void handleSettingChange({
                      settings: {
                        ratingScale: e.target.value as RoomSettings['ratingScale'],
                      },
                    })
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 disabled:opacity-75 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="integers">Entiers (1 à 5 étoiles)</option>
                  <option value="half_stars">Demi-étoiles (0.5 à 5)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="lobby-order"
                  className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  Ordre des items
                </label>
                <select
                  id="lobby-order"
                  disabled={!isHost}
                  value={roomState.settings.itemOrder}
                  onChange={(e) =>
                    void handleSettingChange({
                      settings: {
                        itemOrder: e.target.value as RoomSettings['itemOrder'],
                      },
                    })
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 disabled:opacity-75 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="sequential">Ordre défini du thème</option>
                  <option value="random">Aléatoire (pioche intelligente)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="lobby-item-count"
                  className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  Nombre d’items
                </label>
                <select
                  id="lobby-item-count"
                  disabled={!isHost}
                  value={
                    roomState.settings.itemCount === null
                      ? 'all'
                      : String(roomState.settings.itemCount)
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    void handleSettingChange({
                      settings: {
                        itemCount: val === 'all' ? null : Number(val),
                      },
                    });
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 tabular-nums disabled:opacity-75 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="all">Tous ({roomState.totalThemeItems})</option>
                  {itemCountPresets.map((count) => (
                    <option key={count} value={String(count)}>
                      {count} items
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="lobby-reveal"
                  className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                >
                  Révélation intermédiaire
                </label>
                <select
                  id="lobby-reveal"
                  disabled={!isHost}
                  value={roomState.settings.revealBetweenItems ? 'yes' : 'no'}
                  onChange={(e) =>
                    void handleSettingChange({
                      settings: { revealBetweenItems: e.target.value === 'yes' },
                    })
                  }
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 disabled:opacity-75 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="yes">Afficher les notes après chaque item</option>
                  <option value="no">Suspense jusqu’au classement final</option>
                </select>
              </div>

              <div className="flex items-end">
                <label
                  htmlFor="lobby-avoid-repeats"
                  className={`flex h-10 w-full items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950 ${
                    isHost ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'
                  }`}
                >
                  <input
                    id="lobby-avoid-repeats"
                    type="checkbox"
                    disabled={!isHost}
                    checked={roomState.settings.avoidRepeats}
                    onChange={(e) =>
                      void handleSettingChange({
                        settings: { avoidRepeats: e.target.checked },
                      })
                    }
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <span className="truncate text-zinc-800 dark:text-zinc-200">
                    Éviter les répétitions entre manches
                  </span>
                </label>
              </div>
            </div>

            {showDeckStatus ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                <span className="tabular-nums">
                  Pioche : <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{roomState.unplayedCount}</strong> / {roomState.totalThemeItems}{' '}
                  {roomState.unplayedCount > 1 ? 'items inédits restants' : 'item inédit restant'}
                </span>
                {isHost ? (
                  <button
                    type="button"
                    disabled={resettingDeck}
                    onClick={() => void handleResetDeck()}
                    className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Réinitialiser la pioche</span>
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 border-t border-zinc-200 pt-5 dark:border-zinc-800">
              {isHost ? (
                <button
                  type="button"
                  disabled={starting}
                  onClick={() => void handleStart()}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 sm:w-auto dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  <span>{starting ? 'Démarrage…' : 'Lancer la partie'}</span>
                </button>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  En attente du lancement de la partie par l’hôte…
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="lg:col-span-4">
          <PlayerRoster
            players={roomState.players}
            selfPlayerId={roomState.selfPlayerId}
            isHost={isHost}
            showVoteStatus={false}
            voteStatuses={roomState.voteStatuses}
            onKickPlayer={kickPlayer}
          />
        </div>
      </div>
    </div>
  );
}
