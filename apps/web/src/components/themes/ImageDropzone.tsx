import type { ImageSearchResultDto, ImageSearchSource } from '@rankroom/shared';
import { Link2, Search, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { searchImages, uploadImageFile, uploadImageFromUrl } from '../../lib/api';
import { useThemeStore } from '../../stores/useThemeStore';
import { ItemThumbnail } from '../ui/ItemThumbnail';

interface ImageDropzoneProps {
  value: string;
  itemName: string;
  onChange: (imagePath: string) => void;
}

type ActiveInputMode = 'none' | 'url' | 'search';

const SOURCE_LABELS: Record<ImageSearchSource, string> = {
  'wikipedia-fr': 'Wikipedia FR',
  'wikipedia-en': 'Wikipedia EN',
  'wikimedia-commons': 'Commons',
};

export function ImageDropzone({ value, itemName, onChange }: ImageDropzoneProps) {
  const handlePotentialAdminError = useThemeStore((s) => s.handlePotentialAdminError);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeMode, setActiveMode] = useState<ActiveInputMode>('none');
  const [urlValue, setUrlValue] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchResults, setSearchResults] = useState<ImageSearchResultDto[]>([]);
  const [importingUrl, setImportingUrl] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const processFile = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const imagePath = await uploadImageFile(file);
      onChange(imagePath);
    } catch (err) {
      if (!handlePotentialAdminError(err)) {
        setError(err instanceof Error ? err.message : "Échec de l'upload.");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleUrlSubmit = async () => {
    if (!urlValue.trim()) return;
    setError(null);
    setUploading(true);
    try {
      const imagePath = await uploadImageFromUrl(urlValue.trim());
      onChange(imagePath);
      setUrlValue('');
      setActiveMode('none');
    } catch (err) {
      if (!handlePotentialAdminError(err)) {
        setError(err instanceof Error ? err.message : "Impossible d'importer cette URL.");
      }
    } finally {
      setUploading(false);
    }
  };

  const runImageSearch = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (trimmed.length < 2) {
      setError('Entrez au moins 2 caractères pour rechercher une image.');
      return;
    }

    setError(null);
    setSearching(true);
    setHasSearched(true);
    try {
      const results = await searchImages(trimmed);
      setSearchResults(results);
    } catch (err) {
      if (!handlePotentialAdminError(err)) {
        setError(
          err instanceof Error ? err.message : 'Erreur lors de la recherche d’images.',
        );
      }
    } finally {
      setSearching(false);
    }
  };

  const toggleSearchMode = () => {
    setError(null);
    if (activeMode === 'search') {
      setActiveMode('none');
      return;
    }

    setActiveMode('search');
    const prefill = searchQuery.trim() || itemName.trim();
    if (prefill && !searchQuery.trim()) {
      setSearchQuery(prefill);
    }
    if (prefill.length >= 2 && searchResults.length === 0 && !hasSearched) {
      void runImageSearch(prefill);
    }
  };

  const toggleUrlMode = () => {
    setError(null);
    setActiveMode((prev) => (prev === 'url' ? 'none' : 'url'));
  };

  const handleSelectSearchResult = async (result: ImageSearchResultDto) => {
    setError(null);
    setUploading(true);
    setImportingUrl(result.fullUrl);
    try {
      let imagePath: string;
      try {
        imagePath = await uploadImageFromUrl(result.fullUrl);
      } catch (primaryErr) {
        if (result.previewUrl !== result.fullUrl) {
          imagePath = await uploadImageFromUrl(result.previewUrl);
        } else {
          throw primaryErr;
        }
      }
      onChange(imagePath);
      setActiveMode('none');
    } catch (err) {
      if (!handlePotentialAdminError(err)) {
        setError(
          err instanceof Error ? err.message : "Impossible d'importer cette image Wikimedia.",
        );
      }
    } finally {
      setImportingUrl(null);
      setUploading(false);
    }
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void runImageSearch(searchQuery);
    }
  };

  const handleUrlKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleUrlSubmit();
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-3">
        <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950">
          <ItemThumbnail
            src={value}
            alt={itemName || 'Aperçu'}
            className="h-full w-full"
            fit="cover"
            compact
          />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-16 flex-1 flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-xs transition-colors duration-150 ${
            dragging
              ? 'border-zinc-900 bg-zinc-100 dark:border-zinc-200 dark:bg-zinc-800'
              : 'border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void processFile(file);
              }
              e.target.value = '';
            }}
          />

          <span className="text-zinc-500 dark:text-zinc-400">
            {uploading ? 'Optimisation WebP…' : 'Glisser une image ici ou choisir'}
          </span>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Fichier</span>
            </button>

            <button
              type="button"
              disabled={uploading}
              onClick={toggleUrlMode}
              aria-pressed={activeMode === 'url'}
              className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium disabled:opacity-50 ${
                activeMode === 'url'
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>URL</span>
            </button>

            <button
              type="button"
              disabled={uploading}
              onClick={toggleSearchMode}
              aria-pressed={activeMode === 'search'}
              className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-medium disabled:opacity-50 ${
                activeMode === 'search'
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Rechercher</span>
            </button>

            {value ? (
              <button
                type="button"
                aria-label="Retirer l'image"
                onClick={() => onChange('')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 hover:text-red-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {activeMode === 'url' ? (
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            placeholder="https://exemple.com/image.jpg"
            className="h-9 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <button
            type="button"
            disabled={uploading || !urlValue.trim()}
            onClick={() => void handleUrlSubmit()}
            className="h-9 whitespace-nowrap rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Importer
          </button>
        </div>
      ) : null}

      {activeMode === 'search' ? (
        <div className="space-y-2.5 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Rechercher sur Wikipedia & Wikimedia…"
              aria-label="Rechercher une image sur Wikipedia et Wikimedia"
              className="h-9 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            />
            <button
              type="button"
              disabled={searching || uploading || searchQuery.trim().length < 2}
              onClick={() => void runImageSearch(searchQuery)}
              className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{searching ? 'Recherche…' : 'Chercher'}</span>
            </button>
          </div>

          {searching ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {[0, 1, 2, 3].map((slot) => (
                <div
                  key={slot}
                  className="aspect-[4/3] animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800"
                />
              ))}
            </div>
          ) : searchResults.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {searchResults.map((result) => {
                const isImportingThis = importingUrl === result.fullUrl;
                return (
                  <button
                    key={result.fullUrl}
                    type="button"
                    disabled={uploading}
                    onClick={() => void handleSelectSearchResult(result)}
                    className="group relative overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 text-left transition-colors hover:border-zinc-900 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-200"
                    title={`${result.title} (${SOURCE_LABELS[result.source]})`}
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                      <img
                        src={result.previewUrl}
                        alt={result.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="px-1.5 py-1">
                      <p className="truncate text-[10px] font-medium text-zinc-800 dark:text-zinc-200">
                        {result.title}
                      </p>
                      <p className="truncate text-[9px] text-zinc-500 dark:text-zinc-400">
                        {SOURCE_LABELS[result.source]}
                      </p>
                    </div>
                    {isImportingThis ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/70 px-2 text-center text-[11px] font-semibold text-white">
                        Conversion WebP…
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : hasSearched ? (
            <p className="py-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
              Aucun visuel trouvé pour « {searchQuery.trim()} ». Essayez des mots-clés plus généraux ou en anglais.
            </p>
          ) : (
            <p className="py-2 text-xs text-zinc-500 dark:text-zinc-400">
              Recherche directe d’illustrations libres via Wikipedia &amp; Wikimedia Commons (converties localement en WebP).
            </p>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
