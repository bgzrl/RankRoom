import { useEffect, useState } from 'react';

interface ItemThumbnailProps {
  src: string;
  alt: string;
  className?: string;
  fit?: 'cover' | 'contain';
  compact?: boolean;
}

function getMonogram(label: string): string {
  const cleaned = label.trim();
  if (!cleaned) return '—';
  const words = cleaned.split(/[\s:–—-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export function ItemThumbnail({
  src,
  alt,
  className = '',
  fit = 'cover',
  compact = false,
}: ItemThumbnailProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    const monogram = getMonogram(alt);
    return (
      <div
        className={`flex flex-col items-center justify-center bg-zinc-100 text-zinc-600 select-none dark:bg-zinc-800/80 dark:text-zinc-300 ${className}`}
        aria-label={alt}
      >
        <span
          className={`font-mono font-bold tracking-wider text-zinc-500 dark:text-zinc-400 ${
            compact ? 'text-xs' : 'text-2xl sm:text-3xl'
          }`}
        >
          {monogram}
        </span>
        {!compact && alt ? (
          <span className="mt-1.5 line-clamp-2 max-w-[85%] px-3 text-center text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {alt}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${fit === 'contain' ? 'object-contain' : 'object-cover'} ${className}`}
    />
  );
}
