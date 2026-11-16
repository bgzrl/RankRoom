import type { ThemeDetailDto } from '@rankroom/shared';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { createTheme, updateTheme } from '../../lib/api';
import { useThemeStore } from '../../stores/useThemeStore';
import { DialogShell } from '../ui/DialogShell';
import { ImageDropzone } from './ImageDropzone';

interface EditableItem {
  localKey: string;
  id?: string;
  name: string;
  description: string;
  imagePath: string;
}

interface ThemeEditorModalProps {
  open: boolean;
  initialTheme: ThemeDetailDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function makeEmptyItem(): EditableItem {
  return {
    localKey: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    description: '',
    imagePath: '',
  };
}

export function ThemeEditorModal({
  open,
  initialTheme,
  onOpenChange,
  onSaved,
}: ThemeEditorModalProps) {
  const handlePotentialAdminError = useThemeStore((s) => s.handlePotentialAdminError);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState<EditableItem[]>([
    makeEmptyItem(),
    makeEmptyItem(),
    makeEmptyItem(),
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initialTheme) {
      setTitle(initialTheme.title);
      setCategory(initialTheme.category);
      setDescription(initialTheme.description);
      setItems(
        initialTheme.items.map((item) => ({
          localKey: item.id,
          id: item.id,
          name: item.name,
          description: item.description,
          imagePath: item.imagePath,
        })),
      );
    } else {
      setTitle('');
      setCategory('Divers');
      setDescription('');
      setItems([makeEmptyItem(), makeEmptyItem(), makeEmptyItem()]);
    }
  }, [open, initialTheme]);

  const moveItem = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const current = next[index]!;
      next[index] = next[targetIndex]!;
      next[targetIndex] = current;
      return next;
    });
  };

  const removeItem = (index: number) => {
    if (items.length <= 3) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateItemField = (
    index: number,
    patch: Partial<Pick<EditableItem, 'name' | 'description' | 'imagePath'>>,
  ) => {
    setItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (title.trim().length < 3) {
      setError('Le titre doit contenir au moins 3 caractères.');
      return;
    }
    if (category.trim().length < 2) {
      setError('La catégorie doit contenir au moins 2 caractères.');
      return;
    }
    if (items.length < 3) {
      setError('Un thème doit contenir au moins 3 items.');
      return;
    }
    const emptyNameIndex = items.findIndex((item) => item.name.trim().length === 0);
    if (emptyNameIndex !== -1) {
      setError(`L’item #${emptyNameIndex + 1} doit avoir un nom.`);
      return;
    }

    const payload = {
      title: title.trim(),
      category: category.trim(),
      description: description.trim(),
      items: items.map((item) => ({
        id: item.id,
        name: item.name.trim(),
        description: item.description.trim(),
        imagePath: item.imagePath.trim(),
      })),
    };

    setSubmitting(true);
    try {
      if (initialTheme) {
        await updateTheme(initialTheme.id, payload);
      } else {
        await createTheme(payload);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (!handlePotentialAdminError(err)) {
        setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={initialTheme ? 'Modifier le thème' : 'Nouveau thème'}
      description="Minimum 3 items. Les images importées sont automatiquement optimisées en WebP."
      maxWidthClass="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="theme-title"
              className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
            >
              Titre du thème
            </label>
            <input
              id="theme-title"
              type="text"
              required
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Meilleurs albums des années 2000"
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div>
            <label
              htmlFor="theme-category"
              className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
            >
              Catégorie
            </label>
            <input
              id="theme-category"
              type="text"
              required
              maxLength={40}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex: Musique, Cinéma, Jeux vidéo…"
              className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="theme-desc"
            className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
          >
            Description courte
          </label>
          <input
            id="theme-desc"
            type="text"
            maxLength={280}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Contexte ou consigne rapide pour les joueurs (optionnel)"
            className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Items ({items.length})
            </h3>
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, makeEmptyItem()])}
              disabled={items.length >= 60}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Ajouter un item</span>
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, idx) => (
              <div
                key={item.localKey}
                className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-zinc-500 tabular-nums dark:text-zinc-400">
                    #{idx + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      aria-label={`Monter l'item ${idx + 1}`}
                      onClick={() => moveItem(idx, -1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 disabled:opacity-35 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === items.length - 1}
                      aria-label={`Descendre l'item ${idx + 1}`}
                      onClick={() => moveItem(idx, 1)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 disabled:opacity-35 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={items.length <= 3}
                      aria-label={`Supprimer l'item ${idx + 1}`}
                      onClick={() => removeItem(idx)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-zinc-200 bg-white text-zinc-500 hover:text-red-600 disabled:opacity-35 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={item.name}
                    onChange={(e) => updateItemField(idx, { name: e.target.value })}
                    placeholder="Nom de l’item"
                    aria-label={`Nom de l'item ${idx + 1}`}
                    className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <input
                    type="text"
                    maxLength={200}
                    value={item.description}
                    onChange={(e) => updateItemField(idx, { description: e.target.value })}
                    placeholder="Sous-titre ou note courte (optionnel)"
                    aria-label={`Description de l'item ${idx + 1}`}
                    className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>

                <ImageDropzone
                  value={item.imagePath}
                  itemName={item.name}
                  onChange={(imagePath) => updateItemField(idx, { imagePath })}
                />
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-10 whitespace-nowrap rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-10 whitespace-nowrap rounded-lg bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? 'Enregistrement…' : initialTheme ? 'Mettre à jour' : 'Créer le thème'}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
