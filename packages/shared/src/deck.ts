import type { ItemOrder } from './types.js';

export type RandomIndexFn = (maxExclusive: number) => number;

function defaultRandomIndex(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

export function fisherYatesShuffle<T>(
  items: readonly T[],
  randomIndex: RandomIndexFn = defaultRandomIndex,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const rawIndex = randomIndex(i + 1);
    const j = Math.max(0, Math.min(i, Math.floor(rawIndex)));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

function shuffleAvoidingFirst<T extends { id: string }>(
  items: readonly T[],
  forbiddenFirstId: string | null | undefined,
  randomIndex: RandomIndexFn,
): T[] {
  const shuffled = fisherYatesShuffle(items, randomIndex);
  if (!forbiddenFirstId || shuffled.length <= 1 || shuffled[0]?.id !== forbiddenFirstId) {
    return shuffled;
  }

  const candidateIndices: number[] = [];
  for (let i = 1; i < shuffled.length; i += 1) {
    if (shuffled[i]?.id !== forbiddenFirstId) {
      candidateIndices.push(i);
    }
  }
  if (candidateIndices.length === 0) {
    return shuffled;
  }

  const pickIdx = Math.max(
    0,
    Math.min(candidateIndices.length - 1, Math.floor(randomIndex(candidateIndices.length))),
  );
  const swapIdx = candidateIndices[pickIdx]!;
  const temp = shuffled[0]!;
  shuffled[0] = shuffled[swapIdx]!;
  shuffled[swapIdx] = temp;
  return shuffled;
}

export function computeRoundItemCount(
  totalThemeItems: number,
  targetCount: number | null,
): number {
  if (totalThemeItems <= 0) return 0;
  if (targetCount === null) return totalThemeItems;
  return Math.min(Math.max(1, Math.floor(targetCount)), totalThemeItems);
}

export function prunePlayedItemIds<T extends { id: string }>(
  items: readonly T[],
  playedItemIds: ReadonlySet<string>,
): Set<string> {
  if (playedItemIds.size === 0 || items.length === 0) {
    return new Set();
  }
  const validIds = new Set(items.map((item) => item.id));
  const pruned = new Set<string>();
  for (const id of playedItemIds) {
    if (validIds.has(id)) {
      pruned.add(id);
    }
  }
  return pruned;
}

export function getUnplayedItemsCount<T extends { id: string }>(
  items: readonly T[],
  playedItemIds: ReadonlySet<string>,
): number {
  if (items.length === 0) return 0;
  const pruned = prunePlayedItemIds(items, playedItemIds);
  return items.length - pruned.size;
}

export interface DrawSmartDeckParams<T extends { id: string }> {
  items: readonly T[];
  playedItemIds: ReadonlySet<string>;
  targetCount: number | null;
  itemOrder: ItemOrder;
  avoidRepeats: boolean;
  lastPlayedItemId?: string | null;
  randomIndex?: RandomIndexFn;
}

export interface DrawSmartDeckResult<T extends { id: string }> {
  drawnItems: T[];
  nextPlayedItemIds: Set<string>;
  nextLastPlayedItemId: string | null;
  deckResetOccurred: boolean;
  unplayedAfterDraw: number;
}

export function drawSmartDeck<T extends { id: string }>(
  params: DrawSmartDeckParams<T>,
): DrawSmartDeckResult<T> {
  const {
    items,
    playedItemIds,
    targetCount,
    itemOrder,
    avoidRepeats,
    lastPlayedItemId = null,
    randomIndex = defaultRandomIndex,
  } = params;

  if (items.length === 0) {
    return {
      drawnItems: [],
      nextPlayedItemIds: new Set(),
      nextLastPlayedItemId: null,
      deckResetOccurred: false,
      unplayedAfterDraw: 0,
    };
  }

  const count = computeRoundItemCount(items.length, targetCount);
  const prunedPlayed = prunePlayedItemIds(items, playedItemIds);

  if (itemOrder === 'sequential') {
    if (!avoidRepeats) {
      const drawnItems = items.slice(0, count);
      return {
        drawnItems,
        nextPlayedItemIds: new Set(prunedPlayed),
        nextLastPlayedItemId: drawnItems[drawnItems.length - 1]?.id ?? lastPlayedItemId,
        deckResetOccurred: false,
        unplayedAfterDraw: items.length - prunedPlayed.size,
      };
    }

    const unseen = items.filter((item) => !prunedPlayed.has(item.id));
    if (unseen.length >= count) {
      const drawnItems = unseen.slice(0, count);
      const nextPlayedItemIds = new Set(prunedPlayed);
      for (const item of drawnItems) {
        nextPlayedItemIds.add(item.id);
      }
      return {
        drawnItems,
        nextPlayedItemIds,
        nextLastPlayedItemId: drawnItems[drawnItems.length - 1]?.id ?? lastPlayedItemId,
        deckResetOccurred: false,
        unplayedAfterDraw: items.length - nextPlayedItemIds.size,
      };
    }

    if (unseen.length === 0) {
      const drawnItems = items.slice(0, count);
      const nextPlayedItemIds = new Set(drawnItems.map((i) => i.id));
      return {
        drawnItems,
        nextPlayedItemIds,
        nextLastPlayedItemId: drawnItems[drawnItems.length - 1]?.id ?? lastPlayedItemId,
        deckResetOccurred: true,
        unplayedAfterDraw: items.length - nextPlayedItemIds.size,
      };
    }

    const prefix = unseen;
    const prefixIds = new Set(prefix.map((i) => i.id));
    const remainingPool = items.filter((item) => !prefixIds.has(item.id));
    const suffix = remainingPool.slice(0, count - prefix.length);
    const drawnItems = [...prefix, ...suffix];
    const nextPlayedItemIds = new Set(suffix.map((i) => i.id));

    return {
      drawnItems,
      nextPlayedItemIds,
      nextLastPlayedItemId: drawnItems[drawnItems.length - 1]?.id ?? lastPlayedItemId,
      deckResetOccurred: true,
      unplayedAfterDraw: items.length - nextPlayedItemIds.size,
    };
  }

  // Mode aléatoire (Fisher-Yates)
  if (!avoidRepeats) {
    const drawnItems = shuffleAvoidingFirst(items, lastPlayedItemId, randomIndex).slice(0, count);
    return {
      drawnItems,
      nextPlayedItemIds: new Set(prunedPlayed),
      nextLastPlayedItemId: drawnItems[drawnItems.length - 1]?.id ?? lastPlayedItemId,
      deckResetOccurred: false,
      unplayedAfterDraw: items.length - prunedPlayed.size,
    };
  }

  const unseen = items.filter((item) => !prunedPlayed.has(item.id));

  if (unseen.length >= count) {
    const shuffledUnseen = shuffleAvoidingFirst(unseen, lastPlayedItemId, randomIndex);
    const drawnItems = shuffledUnseen.slice(0, count);
    const nextPlayedItemIds = new Set(prunedPlayed);
    for (const item of drawnItems) {
      nextPlayedItemIds.add(item.id);
    }
    return {
      drawnItems,
      nextPlayedItemIds,
      nextLastPlayedItemId: drawnItems[drawnItems.length - 1]?.id ?? lastPlayedItemId,
      deckResetOccurred: false,
      unplayedAfterDraw: items.length - nextPlayedItemIds.size,
    };
  }

  if (unseen.length === 0) {
    const drawnItems = shuffleAvoidingFirst(items, lastPlayedItemId, randomIndex).slice(0, count);
    const nextPlayedItemIds = new Set(drawnItems.map((i) => i.id));
    return {
      drawnItems,
      nextPlayedItemIds,
      nextLastPlayedItemId: drawnItems[drawnItems.length - 1]?.id ?? lastPlayedItemId,
      deckResetOccurred: true,
      unplayedAfterDraw: items.length - nextPlayedItemIds.size,
    };
  }

  // Cas critique : il reste moins d'items inédits que targetCount (ex: 3 restants pour une manche de 5)
  const prefix = shuffleAvoidingFirst(unseen, lastPlayedItemId, randomIndex);
  const prefixIds = new Set(prefix.map((i) => i.id));
  const remainingPool = items.filter((item) => !prefixIds.has(item.id));
  const boundaryLastId = prefix[prefix.length - 1]?.id ?? lastPlayedItemId;
  const suffix = shuffleAvoidingFirst(remainingPool, boundaryLastId, randomIndex).slice(
    0,
    count - prefix.length,
  );
  const drawnItems = [...prefix, ...suffix];
  const nextPlayedItemIds = new Set(suffix.map((i) => i.id));

  return {
    drawnItems,
    nextPlayedItemIds,
    nextLastPlayedItemId: drawnItems[drawnItems.length - 1]?.id ?? lastPlayedItemId,
    deckResetOccurred: true,
    unplayedAfterDraw: items.length - nextPlayedItemIds.size,
  };
}
