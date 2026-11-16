import { describe, expect, it } from 'vitest';
import {
  computeRoundItemCount,
  drawSmartDeck,
  fisherYatesShuffle,
  getUnplayedItemsCount,
} from '../deck.js';

interface MockItem {
  id: string;
  label: string;
}

function makeItems(count: number): MockItem[] {
  return Array.from({ length: count }, (_, idx) => ({
    id: `item-${idx + 1}`,
    label: `Item ${idx + 1}`,
  }));
}

function createLcgRandomIndex(seed = 42): (maxExclusive: number) => number {
  let state = seed >>> 0;
  return (maxExclusive: number) => {
    state = (1_664_525 * state + 1_013_904_223) >>> 0;
    return Math.floor((state / 0x1_0000_0000) * maxExclusive);
  };
}

describe('Fisher-Yates Shuffle & Pioche Intelligente', () => {
  it('mélange sans muter le tableau source et préserve exactement tous les éléments', () => {
    const source = makeItems(10);
    const snapshot = source.map((item) => item.id);
    const rng = createLcgRandomIndex(12345);

    const shuffled = fisherYatesShuffle(source, rng);

    expect(source.map((item) => item.id)).toEqual(snapshot);
    expect(shuffled).toHaveLength(10);
    expect(new Set(shuffled.map((item) => item.id))).toEqual(new Set(snapshot));
    expect(shuffled.map((item) => item.id)).not.toEqual(snapshot);
  });

  it('produit une distribution uniforme sur les permutations (test statistique du chi-carré)', () => {
    const items = ['A', 'B', 'C'];
    const counts = new Map<string, number>();
    let seed = 98765;
    const rng = (maxExclusive: number) => {
      seed = (1_664_525 * seed + 1_013_904_223) >>> 0;
      return Math.floor((seed / 0x1_0000_0000) * maxExclusive);
    };

    const iterations = 6000;
    for (let i = 0; i < iterations; i += 1) {
      const perm = fisherYatesShuffle(items, rng).join('');
      counts.set(perm, (counts.get(perm) ?? 0) + 1);
    }

    expect(counts.size).toBe(6);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1150);
    }
  });

  it('enchaîne plusieurs manches sans aucun doublon tant que tout le thème n’a pas été vu', () => {
    const items = makeItems(12);
    const rng = createLcgRandomIndex(77);

    let played = new Set<string>();
    let lastId: string | null = null;
    const seenAcrossTwoRounds: string[] = [];

    // Manche 1 : 5 items sur 12
    const round1 = drawSmartDeck({
      items,
      playedItemIds: played,
      targetCount: 5,
      itemOrder: 'random',
      avoidRepeats: true,
      lastPlayedItemId: lastId,
      randomIndex: rng,
    });
    expect(round1.drawnItems).toHaveLength(5);
    expect(round1.deckResetOccurred).toBe(false);
    expect(round1.unplayedAfterDraw).toBe(7);
    seenAcrossTwoRounds.push(...round1.drawnItems.map((i) => i.id));
    played = round1.nextPlayedItemIds;
    lastId = round1.nextLastPlayedItemId;

    // Manche 2 : 5 items sur les 7 restants -> 0 doublon avec manche 1
    const round2 = drawSmartDeck({
      items,
      playedItemIds: played,
      targetCount: 5,
      itemOrder: 'random',
      avoidRepeats: true,
      lastPlayedItemId: lastId,
      randomIndex: rng,
    });
    expect(round2.drawnItems).toHaveLength(5);
    expect(round2.deckResetOccurred).toBe(false);
    expect(round2.unplayedAfterDraw).toBe(2);
    seenAcrossTwoRounds.push(...round2.drawnItems.map((i) => i.id));
    expect(new Set(seenAcrossTwoRounds).size).toBe(10);
    played = round2.nextPlayedItemIds;
    lastId = round2.nextLastPlayedItemId;

    // Manche 3 : il reste 2 items inédits pour une manche de 5 !
    // Les 2 inédits doivent sortir en premier, puis la pioche est réinitialisée sur les 10 autres
    // et complète jusqu'à 5 sans doublon dans cette manche.
    const round3 = drawSmartDeck({
      items,
      playedItemIds: played,
      targetCount: 5,
      itemOrder: 'random',
      avoidRepeats: true,
      lastPlayedItemId: lastId,
      randomIndex: rng,
    });
    expect(round3.drawnItems).toHaveLength(5);
    expect(round3.deckResetOccurred).toBe(true);
    expect(new Set(round3.drawnItems.map((i) => i.id)).size).toBe(5);

    const round3PrefixIds = round3.drawnItems.slice(0, 2).map((i) => i.id);
    const round3SuffixIds = round3.drawnItems.slice(2).map((i) => i.id);

    // Les 2 premiers items de round3 doivent être exactement les 2 derniers inédits du cycle
    for (const id of round3PrefixIds) {
      expect(seenAcrossTwoRounds).not.toContain(id);
    }
    // Tous les 12 items du thème ont maintenant été joués au moins une fois
    expect(new Set([...seenAcrossTwoRounds, ...round3PrefixIds]).size).toBe(12);
    // Après réinitialisation de la pioche, seuls les 3 items du suffixe sont marqués joués dans le nouveau cycle
    expect(round3.nextPlayedItemIds).toEqual(new Set(round3SuffixIds));
    expect(round3.unplayedAfterDraw).toBe(9);
  });

  it('sur un thème joué en entier à chaque manche, évite de remettre le dernier item précédent en premier', () => {
    const items = makeItems(6);
    // RNG biaisé retournant 0 pour forcer la vérification de l'anti-répétition en tête
    const zeroRng = () => 0;

    const round1 = drawSmartDeck({
      items,
      playedItemIds: new Set(),
      targetCount: null,
      itemOrder: 'random',
      avoidRepeats: true,
      lastPlayedItemId: null,
      randomIndex: zeroRng,
    });
    expect(round1.drawnItems).toHaveLength(6);
    expect(round1.unplayedAfterDraw).toBe(0);

    const prevLastId = round1.nextLastPlayedItemId!;
    const round2 = drawSmartDeck({
      items,
      playedItemIds: round1.nextPlayedItemIds,
      targetCount: null,
      itemOrder: 'random',
      avoidRepeats: true,
      lastPlayedItemId: prevLastId,
      randomIndex: zeroRng,
    });
    expect(round2.deckResetOccurred).toBe(true);
    expect(round2.drawnItems).toHaveLength(6);
    expect(round2.drawnItems[0]!.id).not.toBe(prevLastId);
  });

  it("gère proprement l'ajout ou la suppression d'items en BDD entre deux manches", () => {
    const initialItems = makeItems(6);
    const round1 = drawSmartDeck({
      items: initialItems,
      playedItemIds: new Set(),
      targetCount: 4,
      itemOrder: 'random',
      avoidRepeats: true,
      randomIndex: createLcgRandomIndex(11),
    });
    expect(round1.nextPlayedItemIds.size).toBe(4);

    // L'admin supprime 2 items qui avaient été joués et en ajoute 2 nouveaux (items 7 et 8)
    const deletedIds = new Set(round1.drawnItems.slice(0, 2).map((i) => i.id));
    const updatedItems = [
      ...initialItems.filter((i) => !deletedIds.has(i.id)),
      { id: 'item-7', label: 'Item 7' },
      { id: 'item-8', label: 'Item 8' },
    ];

    // Seuls les 2 items toujours présents dans updatedItems restent comptés comme joués -> 4 inédits
    expect(getUnplayedItemsCount(updatedItems, round1.nextPlayedItemIds)).toBe(4);

    const round2 = drawSmartDeck({
      items: updatedItems,
      playedItemIds: round1.nextPlayedItemIds,
      targetCount: 4,
      itemOrder: 'random',
      avoidRepeats: true,
      lastPlayedItemId: round1.nextLastPlayedItemId,
      randomIndex: createLcgRandomIndex(22),
    });

    expect(round2.deckResetOccurred).toBe(false);
    expect(round2.drawnItems).toHaveLength(4);
    for (const item of round2.drawnItems) {
      expect(round1.nextPlayedItemIds.has(item.id)).toBe(false);
    }
  });

  it("respecte avoidRepeats=false et l'ordre séquentiel", () => {
    const items = makeItems(6);
    expect(computeRoundItemCount(6, 20)).toBe(6);
    expect(computeRoundItemCount(6, null)).toBe(6);

    const seq = drawSmartDeck({
      items,
      playedItemIds: new Set(),
      targetCount: 4,
      itemOrder: 'sequential',
      avoidRepeats: false,
    });
    expect(seq.drawnItems.map((i) => i.id)).toEqual(['item-1', 'item-2', 'item-3', 'item-4']);

    const randomNoTrack = drawSmartDeck({
      items,
      playedItemIds: new Set(['item-1', 'item-2']),
      targetCount: 3,
      itemOrder: 'random',
      avoidRepeats: false,
      randomIndex: createLcgRandomIndex(5),
    });
    expect(randomNoTrack.drawnItems).toHaveLength(3);
    expect(randomNoTrack.nextPlayedItemIds).toEqual(new Set(['item-1', 'item-2']));
  });
});
