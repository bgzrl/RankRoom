import type { RatingScale } from '@rankroom/shared';
import { Star } from 'lucide-react';
import { useState } from 'react';

interface StarRatingInputProps {
  value: number | undefined;
  scale: RatingScale;
  onChange: (score: number) => void;
}

export function StarRatingInput({ value, scale, onChange }: StarRatingInputProps) {
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const displayedScore = hoverScore ?? value ?? 0;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Note de 1 à 5 étoiles"
        className="flex items-center gap-1.5 sm:gap-2"
        onMouseLeave={() => setHoverScore(null)}
      >
        {[1, 2, 3, 4, 5].map((starIndex) => {
          const fullFilled = displayedScore >= starIndex;
          const halfFilled =
            scale === 'half_stars' && !fullFilled && displayedScore >= starIndex - 0.5;

          if (scale === 'integers') {
            return (
              <button
                key={starIndex}
                type="button"
                role="radio"
                aria-checked={value === starIndex}
                aria-label={`Noter ${starIndex} sur 5`}
                onMouseEnter={() => setHoverScore(starIndex)}
                onClick={() => onChange(starIndex)}
                className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 transition-transform duration-150 hover:scale-105 hover:border-amber-400 focus-visible:outline-2 focus-visible:outline-zinc-900 active:scale-95 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-amber-500 dark:focus-visible:outline-zinc-100"
              >
                <Star
                  className={`h-6 w-6 transition-colors duration-150 ${
                    fullFilled
                      ? 'fill-amber-400 text-amber-500'
                      : 'fill-transparent text-zinc-300 dark:text-zinc-700'
                  }`}
                  aria-hidden="true"
                />
              </button>
            );
          }

          const halfValue = starIndex - 0.5;
          return (
            <div
              key={starIndex}
              className="relative inline-flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
            >
              {/* Visual star */}
              <div className="pointer-events-none relative h-6 w-6">
                <Star
                  className="h-6 w-6 fill-transparent text-zinc-300 dark:text-zinc-700"
                  aria-hidden="true"
                />
                {fullFilled ? (
                  <Star
                    className="absolute inset-0 h-6 w-6 fill-amber-400 text-amber-500"
                    aria-hidden="true"
                  />
                ) : halfFilled ? (
                  <div className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
                    <Star
                      className="h-6 w-6 fill-amber-400 text-amber-500"
                      aria-hidden="true"
                    />
                  </div>
                ) : null}
              </div>

              {/* Left half tap target */}
              <button
                type="button"
                role="radio"
                aria-checked={value === halfValue}
                aria-label={`Noter ${halfValue} sur 5`}
                onMouseEnter={() => setHoverScore(halfValue)}
                onClick={() => onChange(halfValue)}
                className="absolute inset-y-0 left-0 w-1/2 rounded-l-lg focus-visible:outline-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100"
              />

              {/* Right half tap target */}
              <button
                type="button"
                role="radio"
                aria-checked={value === starIndex}
                aria-label={`Noter ${starIndex} sur 5`}
                onMouseEnter={() => setHoverScore(starIndex)}
                onClick={() => onChange(starIndex)}
                className="absolute inset-y-0 right-0 w-1/2 rounded-r-lg focus-visible:outline-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100"
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="font-mono font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
          {value !== undefined ? `${value} / 5` : 'Aucune note sélectionnée'}
        </span>
        <span className="hidden text-xs text-zinc-400 sm:inline dark:text-zinc-500">
          · Raccourcis clavier 1–5
        </span>
      </div>
    </div>
  );
}
