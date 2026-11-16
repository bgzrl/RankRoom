import { Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useThemeStore } from '../../stores/useThemeStore';
import { DialogShell } from '../ui/DialogShell';

export function AdminUnlockModal() {
  const open = useThemeStore((s) => s.adminModalOpen);
  const closeAdminModal = useThemeStore((s) => s.closeAdminModal);
  const unlockAdmin = useThemeStore((s) => s.unlockAdmin);

  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Veuillez saisir le mot de passe administrateur.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await unlockAdmin(password);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mot de passe invalide.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          closeAdminModal();
        }
      }}
      title="Accès administrateur requis"
      description="Ce serveur protège la création, l’édition et la suppression des thèmes par mot de passe."
      maxWidthClass="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="admin-password-input"
            className="block text-sm font-medium text-zinc-800 dark:text-zinc-200"
          >
            Mot de passe administrateur
          </label>
          <div className="relative mt-1.5">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <input
              id="admin-password-input"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Saisir le mot de passe…"
              className="h-11 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-3.5 text-sm text-zinc-900 focus:border-zinc-900 focus:bg-white focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-400"
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={closeAdminModal}
            className="h-10 whitespace-nowrap rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="h-10 whitespace-nowrap rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {submitting ? 'Vérification…' : 'Déverrouiller'}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
