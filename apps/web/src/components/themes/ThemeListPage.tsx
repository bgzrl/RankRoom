import type { ThemeDetailDto, ThemeSummaryDto } from '@rankroom/shared';
import {
  Download,
  Lock,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  Unlock,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteTheme,
  fetchThemeDetail,
  importThemeJson,
} from '../../lib/api';
import { useThemeStore } from '../../stores/useThemeStore';
import { DialogShell } from '../ui/DialogShell';
import { ItemThumbnail } from '../ui/ItemThumbnail';
import { ThemeEditorModal } from './ThemeEditorModal';

interface ThemeListPageProps {
  onNavigate: (path: string) => void;
  onPlayTheme: (themeId: string) => void;
}

export function ThemeListPage({ onPlayTheme }: ThemeListPageProps) {
  const themes = useThemeStore((s) => s.themes);
  const loading = useThemeStore((s) => s.loading);
  const error = useThemeStore((s) => s.error);
  const adminRequired = useThemeStore((s) => s.adminRequired);
  const adminUnlocked = useThemeStore((s) => s.adminUnlocked);
  const loadThemes = useThemeStore((s) => s.loadThemes);
  const refreshAdminStatus = useThemeStore((s) => s.refreshAdminStatus);
  const openAdminModal = useThemeStore((s) => s.openAdminModal);
  const handlePotentialAdminError = useThemeStore((s) => s.handlePotentialAdminError);

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<ThemeDetailDto | null>(null);
  const [themeToDelete, setThemeToDelete] = useState<ThemeSummaryDto | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    void loadThemes();
    void refreshAdminStatus();
  }, [loadThemes, refreshAdminStatus]);

  const categories = useMemo(() => {
    const unique = new Set(themes.map((t) => t.category));
    return ['ALL', ...Array.from(unique).sort((a, b) => a.localeCompare(b, 'fr'))];
  }, [themes]);

  const filteredThemes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return themes.filter((theme) => {
      if (selectedCategory !== 'ALL' && theme.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        theme.title.toLowerCase().includes(q) ||
        theme.description.toLowerCase().includes(q) ||
        theme.category.toLowerCase().includes(q)
      );
    });
  }, [themes, selectedCategory, searchQuery]);

  const ensureAdminBeforeMutation = (): boolean => {
    if (adminRequired && !adminUnlocked) {
      openAdminModal();
      return false;
    }
    return true;
  };

  const handleCreateClick = () => {
    if (!ensureAdminBeforeMutation()) return;
    setEditingTheme(null);
    setEditorOpen(true);
  };

  const handleEditClick = async (themeId: string) => {
    if (!ensureAdminBeforeMutation()) return;
    try {
      const detail = await fetchThemeDetail(themeId);
      setEditingTheme(detail);
      setEditorOpen(true);
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Impossible de charger le thème.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!themeToDelete) return;
    try {
      await deleteTheme(themeToDelete.id);
      setThemeToDelete(null);
      await loadThemes();
      setFeedback('Thème supprimé.');
    } catch (err) {
      if (!handlePotentialAdminError(err)) {
        setFeedback(err instanceof Error ? err.message : 'Suppression impossible.');
      }
    }
  };

  const handleImportFile = async (file: File) => {
    setFeedback(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      await importThemeJson(parsed);
      await loadThemes();
      setFeedback('Thème importé avec succès.');
    } catch (err) {
      if (!handlePotentialAdminError(err)) {
        setFeedback(
          err instanceof Error ? err.message : 'Fichier JSON invalide ou refusé.',
        );
      }
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-100">
            Bibliothèque de thèmes
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Créez vos propres packs d’items, importez ou exportez en JSON et lancez une partie.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {adminRequired ? (
            <button
              type="button"
              onClick={openAdminModal}
              className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {adminUnlocked ? (
                <Unlock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : (
                <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              )}
              <span>{adminUnlocked ? 'Admin déverrouillé' : 'Déverrouiller Admin'}</span>
            </button>
          ) : null}

          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleImportFile(file);
              }
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => {
              if (!ensureAdminBeforeMutation()) return;
              importInputRef.current?.click();
            }}
            className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            <span>Importer JSON</span>
          </button>

          <button
            type="button"
            onClick={handleCreateClick}
            className="inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Nouveau thème</span>
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`h-8 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors duration-150 ${
                selectedCategory === cat
                  ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              {cat === 'ALL' ? 'Toutes les catégories' : cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un thème…"
            aria-label="Rechercher un thème"
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      </div>

      {feedback ? (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Fermer
          </button>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </div>
      ) : null}

      {loading && themes.length === 0 ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-56 animate-pulse rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
            />
          ))}
        </div>
      ) : filteredThemes.length === 0 ? (
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-10 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Aucun thème ne correspond à votre recherche.
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Créez un nouveau thème ou réinitialisez les filtres.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredThemes.map((theme) => (
            <article
              key={theme.id}
              className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div>
                {theme.previewImages.length === 0 ? (
                  <ItemThumbnail
                    src=""
                    alt={theme.title}
                    className="h-16 w-full rounded-md border border-zinc-200/80 dark:border-zinc-800"
                  />
                ) : (
                  <div className="grid grid-cols-4 gap-1.5">
                    {[0, 1, 2, 3].map((slot) => {
                      const src = theme.previewImages[slot] ?? '';
                      if (!src) {
                        return (
                          <div
                            key={slot}
                            aria-hidden="true"
                            className="aspect-[4/3] w-full rounded-md border border-zinc-200/60 bg-zinc-50 dark:border-zinc-800/80 dark:bg-zinc-950"
                          />
                        );
                      }
                      return (
                        <ItemThumbnail
                          key={slot}
                          src={src}
                          alt={theme.title}
                          compact
                          className="aspect-[4/3] w-full rounded-md border border-zinc-200/80 dark:border-zinc-800"
                        />
                      );
                    })}
                  </div>
                )}

                <h2 className="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {theme.title}
                </h2>
                <p className="mt-1 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                  {theme.category} · {theme.itemCount} items
                </p>
                {theme.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {theme.description}
                  </p>
                ) : null}
              </div>

              <div className="mt-5 flex items-center justify-between gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => onPlayTheme(theme.id)}
                  className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Jouer</span>
                </button>

                <div className="flex items-center gap-1">
                  <a
                    href={`/api/themes/${theme.id}/export`}
                    download
                    aria-label={`Exporter ${theme.title} en JSON`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    aria-label={`Modifier ${theme.title}`}
                    onClick={() => void handleEditClick(theme.id)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Supprimer ${theme.title}`}
                    onClick={() => {
                      if (!ensureAdminBeforeMutation()) return;
                      setThemeToDelete(theme);
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <ThemeEditorModal
        open={editorOpen}
        initialTheme={editingTheme}
        onOpenChange={setEditorOpen}
        onSaved={() => {
          void loadThemes();
          setFeedback(editingTheme ? 'Thème mis à jour.' : 'Nouveau thème créé.');
        }}
      />

      <DialogShell
        open={Boolean(themeToDelete)}
        onOpenChange={(open) => {
          if (!open) setThemeToDelete(null);
        }}
        title="Supprimer ce thème ?"
        description="Cette action supprime définitivement le thème. Les résultats de parties déjà enregistrés restent consultables."
        maxWidthClass="max-w-md"
      >
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Confirmez-vous la suppression de{' '}
          <strong className="font-semibold">{themeToDelete?.title}</strong> ?
        </p>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setThemeToDelete(null)}
            className="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleConfirmDelete()}
            className="h-10 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
          >
            Supprimer
          </button>
        </div>
      </DialogShell>
    </div>
  );
}
