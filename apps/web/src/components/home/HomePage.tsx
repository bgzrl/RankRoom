import {
  DEFAULT_ROOM_SETTINGS,
  normalizeRoomCode,
  type RoomSettings,
  type ThemeSummaryDto,
} from '@rankroom/shared';
import { ArrowRight, Plus, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useRoomStore } from '../../stores/useRoomStore';
import { useThemeStore } from '../../stores/useThemeStore';
import { ItemThumbnail } from '../ui/ItemThumbnail';

interface HomePageProps {
  onNavigate: (path: string) => void;
  initialThemeId?: string | null;
}

export function HomePage({ onNavigate, initialThemeId }: HomePageProps) {
  const themes = useThemeStore((s) => s.themes);
  const themesLoading = useThemeStore((s) => s.loading);
  const loadThemes = useThemeStore((s) => s.loadThemes);

  const lastDisplayName = useRoomStore((s) => s.lastDisplayName);
  const createRoom = useRoomStore((s) => s.createRoom);
  const joinRoom = useRoomStore((s) => s.joinRoom);
  const joining = useRoomStore((s) => s.joining);
  const roomError = useRoomStore((s) => s.error);
  const kickedReason = useRoomStore((s) => s.kickedReason);
  const clearError = useRoomStore((s) => s.clearError);
  const clearKickedReason = useRoomStore((s) => s.clearKickedReason);

  const [hostName, setHostName] = useState(lastDisplayName || '');
  const [selectedThemeId, setSelectedThemeId] = useState(initialThemeId ?? '');
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);

  const [joinCode, setJoinCode] = useState('');
  const [guestName, setGuestName] = useState(lastDisplayName || '');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    void loadThemes();
  }, [loadThemes]);

  useEffect(() => {
    if (initialThemeId) {
      setSelectedThemeId(initialThemeId);
      return;
    }
    if (!selectedThemeId && themes.length > 0 && themes[0]) {
      setSelectedThemeId(themes[0].id);
    }
  }, [themes, selectedThemeId, initialThemeId]);

  const selectedTheme: ThemeSummaryDto | undefined = themes.find(
    (t) => t.id === selectedThemeId,
  );

  const themeItemCount = selectedTheme?.itemCount ?? 0;
  const itemCountPresets = [5, 10, 15, 20].filter((n) => n < themeItemCount);

  const handleThemeSelect = (nextThemeId: string) => {
    setSelectedThemeId(nextThemeId);
    const nextTheme = themes.find((t) => t.id === nextThemeId);
    if (
      nextTheme &&
      settings.itemCount !== null &&
      settings.itemCount >= nextTheme.itemCount
    ) {
      setSettings((s) => ({ ...s, itemCount: null }));
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();
    clearKickedReason();

    const trimmedName = hostName.trim();
    if (!trimmedName) {
      setLocalError('Veuillez saisir votre pseudo.');
      return;
    }
    if (!selectedThemeId) {
      setLocalError('Veuillez sélectionner un thème.');
      return;
    }

    try {
      const code = await createRoom({
        displayName: trimmedName,
        themeId: selectedThemeId,
        settings,
      });
      onNavigate(`/room/${code}`);
    } catch {
      // Error already surfaced via store
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();
    clearKickedReason();

    const normalized = normalizeRoomCode(joinCode);
    const trimmedName = guestName.trim();
    if (normalized.length !== 5) {
      setLocalError('Le code de salle doit comporter exactement 5 caractères.');
      return;
    }
    if (!trimmedName) {
      setLocalError('Veuillez saisir votre pseudo.');
      return;
    }

    try {
      await joinRoom({ roomCode: normalized, displayName: trimmedName });
      onNavigate(`/room/${normalized}`);
    } catch {
      // Error surfaced via store
    }
  };

  const activeMessage = localError ?? roomError ?? kickedReason;

  return (
    <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:py-9">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-100">
          Classez et débattez en direct, un item après l’autre.
        </h1>
        <p className="mt-2.5 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
          Créez une salle privée, partagez le code à cinq caractères et obtenez un classement
          consensuel accompagné d’une Tier List exportable.
        </p>
      </div>

      {activeMessage ? (
        <div
          role="alert"
          className="mt-5 flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          <span>{activeMessage}</span>
          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              clearError();
              clearKickedReason();
            }}
            className="whitespace-nowrap shrink-0 text-xs font-medium underline hover:no-underline"
          >
            Fermer
          </button>
        </div>
      ) : null}

      <div className="mt-6 grid items-stretch gap-6 lg:grid-cols-12">
        {/* Créer une salle */}
        <section
          aria-labelledby="create-room-heading"
          className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 lg:col-span-7 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <form onSubmit={handleCreate} className="flex h-full flex-col justify-between gap-5">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 border-b border-zinc-200 pb-3.5 dark:border-zinc-800">
                <div>
                  <h2
                    id="create-room-heading"
                    className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
                  >
                    Créer une salle
                  </h2>
                  <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                    Choisissez un thème et configurez le rythme de vote.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('/themes')}
                  className="whitespace-nowrap shrink-0 text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Gérer les thèmes
                </button>
              </div>

              <div>
                <label
                  htmlFor="host-name"
                  className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
                >
                  Votre pseudo
                </label>
                <input
                  id="host-name"
                  type="text"
                  maxLength={24}
                  required
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="Ex: Camille"
                  className="mt-1.5 h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
                />
              </div>

              <div>
                <label
                  htmlFor="theme-select"
                  className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
                >
                  Thème de la partie
                </label>
                {themesLoading && themes.length === 0 ? (
                  <div className="mt-1.5 h-11 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
                ) : themes.length === 0 ? (
                  <div className="mt-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                    Aucun thème disponible.{' '}
                    <button
                      type="button"
                      onClick={() => onNavigate('/themes')}
                      className="font-medium text-zinc-900 underline dark:text-zinc-100"
                    >
                      Créer un premier thème
                    </button>
                  </div>
                ) : (
                  <select
                    id="theme-select"
                    value={selectedThemeId}
                    onChange={(e) => handleThemeSelect(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 text-sm text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-400"
                  >
                    {themes.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.title} ({theme.category} · {theme.itemCount} items)
                      </option>
                    ))}
                  </select>
                )}

                {selectedTheme ? (
                  <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {selectedTheme.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {selectedTheme.category} · {selectedTheme.itemCount} items
                        {selectedTheme.description ? ` · ${selectedTheme.description}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {selectedTheme.previewImages.slice(0, 3).map((src, idx) => (
                        <ItemThumbnail
                          key={`${src}-${idx}`}
                          src={src}
                          alt={selectedTheme.title}
                          className="h-9 w-9 rounded border border-zinc-200 dark:border-zinc-800"
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="home-time-limit"
                    className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                  >
                    Chrono par item
                  </label>
                  <select
                    id="home-time-limit"
                    value={settings.timeLimitSeconds === null ? 'unlimited' : String(settings.timeLimitSeconds)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSettings((s) => ({
                        ...s,
                        timeLimitSeconds:
                          val === 'unlimited' ? null : (Number(val) as 15 | 30 | 60),
                      }));
                    }}
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="15">15 secondes</option>
                    <option value="30">30 secondes</option>
                    <option value="60">60 secondes</option>
                    <option value="unlimited">Illimité (attente des votes)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="home-scale"
                    className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                  >
                    Barème de notation
                  </label>
                  <select
                    id="home-scale"
                    value={settings.ratingScale}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        ratingScale: e.target.value as RoomSettings['ratingScale'],
                      }))
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="integers">Étoiles entières (1 à 5)</option>
                    <option value="half_stars">Demi-étoiles (0.5 à 5)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="home-item-order"
                    className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                  >
                    Ordre des items
                  </label>
                  <select
                    id="home-item-order"
                    value={settings.itemOrder}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        itemOrder: e.target.value as RoomSettings['itemOrder'],
                      }))
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="random">Aléatoire (pioche intelligente)</option>
                    <option value="sequential">Ordre défini du thème</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="home-item-count"
                    className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                  >
                    Nombre d’items
                  </label>
                  <select
                    id="home-item-count"
                    value={settings.itemCount === null ? 'all' : String(settings.itemCount)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSettings((s) => ({
                        ...s,
                        itemCount: val === 'all' ? null : Number(val),
                      }));
                    }}
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 tabular-nums dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    <option value="all">
                      {themeItemCount > 0 ? `Tous (${themeItemCount})` : 'Tous les items'}
                    </option>
                    {itemCountPresets.map((count) => (
                      <option key={count} value={String(count)}>
                        {count} items
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label
                htmlFor="home-avoid-repeats"
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-950"
              >
                <input
                  id="home-avoid-repeats"
                  type="checkbox"
                  checked={settings.avoidRepeats}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      avoidRepeats: e.target.checked,
                    }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-zinc-800 dark:text-zinc-200">
                    Éviter les répétitions entre manches
                  </span>
                  <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                    Tire en priorité les items inédits avant de réinitialiser la pioche.
                  </span>
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={joining || themes.length === 0}
              className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-zinc-900 px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{joining ? 'Création en cours…' : 'Créer la salle'}</span>
            </button>
          </form>
        </section>

        {/* Rejoindre une salle */}
        <section
          aria-labelledby="join-room-heading"
          className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 lg:col-span-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <form onSubmit={handleJoin} className="flex h-full flex-col justify-between gap-5">
            <div className="space-y-4">
              <div className="border-b border-zinc-200 pb-3.5 dark:border-zinc-800">
                <h2
                  id="join-room-heading"
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
                >
                  Rejoindre une salle
                </h2>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  Entrez le code communiqué par l’hôte pour entrer dans la partie.
                </p>
              </div>

              <div>
                <label
                  htmlFor="join-code"
                  className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
                >
                  Code de salle
                </label>
                <input
                  id="join-code"
                  type="text"
                  maxLength={5}
                  required
                  value={joinCode}
                  onChange={(e) => setJoinCode(normalizeRoomCode(e.target.value))}
                  placeholder="K7M2P"
                  className="mt-1.5 h-12 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-4 font-mono text-xl font-semibold tracking-[0.25em] text-zinc-900 uppercase placeholder:tracking-[0.2em] placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-zinc-400"
                />
              </div>

              <div>
                <label
                  htmlFor="guest-name"
                  className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
                >
                  Votre pseudo
                </label>
                <input
                  id="guest-name"
                  type="text"
                  maxLength={24}
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Ex: Lucas"
                  className="mt-1.5 h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
                />
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-200">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reprise automatique de session</span>
                </div>
                <p className="mt-1">
                  En cas de rafraîchissement ou de micro-coupure réseau, votre place et vos votes
                  sont restaurés instantanément.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={joining}
              className="inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-900 transition-colors duration-150 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <span>{joining ? 'Connexion…' : 'Rejoindre la partie'}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
