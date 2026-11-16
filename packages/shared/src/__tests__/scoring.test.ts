import { describe, expect, it } from 'vitest';
import {
  computeTier,
  generateRoomCode,
  groupResultsByTier,
  isValidRoomCode,
  isValidScoreForScale,
  normalizeRoomCode,
  rankGameItems,
  roundToTwoDecimals,
  RoomUpdateSettingsPayloadSchema,
  type ScoringItemInput,
} from '../index.js';

function makeItem(
  id: string,
  name: string,
  scores: number[],
  originalPosition = 0,
): ScoringItemInput {
  return {
    itemId: id,
    name,
    description: '',
    imagePath: `/uploads/${id}.webp`,
    originalPosition,
    votes: scores.map((score, idx) => ({
      playerId: `p-${idx}`,
      displayName: `Joueur ${idx + 1}`,
      score,
    })),
  };
}

describe('computeTier', () => {
  it('classe correctement tous les seuils S / A / B / C / D et null', () => {
    expect(computeTier(null)).toBeNull();
    expect(computeTier(5)).toBe('S');
    expect(computeTier(4.5)).toBe('S');
    expect(computeTier(4.49)).toBe('A');
    expect(computeTier(3.75)).toBe('A');
    expect(computeTier(3.74)).toBe('B');
    expect(computeTier(2.75)).toBe('B');
    expect(computeTier(2.74)).toBe('C');
    expect(computeTier(1.75)).toBe('C');
    expect(computeTier(1.74)).toBe('D');
    expect(computeTier(0.5)).toBe('D');
  });

  it('arrondit de façon cohérente aux bornes', () => {
    expect(roundToTwoDecimals(4.375)).toBe(4.38);
    expect(computeTier(4.499)).toBe('S');
  });
});

describe('rankGameItems', () => {
  it('classe par moyenne décroissante et génère la distribution des notes', () => {
    const items = [
      makeItem('1', 'Item Moyen', [3, 3, 4], 0),
      makeItem('2', 'Item Top', [5, 5, 4], 1),
      makeItem('3', 'Item Faible', [1, 2, 1], 2),
    ];

    const ranked = rankGameItems(items, 'integers');

    expect(ranked.map((r) => r.name)).toEqual(['Item Top', 'Item Moyen', 'Item Faible']);
    expect(ranked[0]).toMatchObject({
      rank: 1,
      tier: 'S',
      averageScore: 4.67,
      voteCount: 3,
      maxScoreCount: 2,
      tieBreakReason: null,
    });
    expect(ranked[1]).toMatchObject({
      rank: 2,
      tier: 'B',
      averageScore: 3.33,
    });
    expect(ranked[2]).toMatchObject({
      rank: 3,
      tier: 'D',
      averageScore: 1.33,
    });
    expect(ranked[0]?.scoreDistribution).toEqual([
      { score: 1, count: 0 },
      { score: 2, count: 0 },
      { score: 3, count: 0 },
      { score: 4, count: 1 },
      { score: 5, count: 2 },
    ]);
  });

  it('départage une égalité par écart-type le plus faible (item plus consensuel)', () => {
    // Moyenne identique = 4.00
    // Consensuel : [4, 4, 4] -> stdDev = 0
    // Polarisant : [5, 5, 2] -> stdDev = 1.41
    const items = [
      makeItem('a', 'Polarisant', [5, 5, 2], 0),
      makeItem('b', 'Consensuel', [4, 4, 4], 1),
    ];

    const ranked = rankGameItems(items, 'integers');

    expect(ranked.map((r) => r.name)).toEqual(['Consensuel', 'Polarisant']);
    expect(ranked[0]?.tieBreakReason).toBe('std_dev');
    expect(ranked[1]?.tieBreakReason).toBe('std_dev');
    expect(ranked[0]?.stdDev).toBe(0);
    expect(ranked[1]?.stdDev).toBe(1.41);
  });

  it('départage une égalité moyenne + écart-type par le plus grand nombre de notes 5 (si possible) ou alphabétique', () => {
    // Avec 2 votes et la même moyenne et même écart-type, maxScoreCount est égal,
    // mais avec des distributions différentes (ex: [5, 3, 3, 3] avg=3.5 vs [4, 4, 3, 3] avg=3.5 -> stdDev différents).
    // Pour égaler moyenne ET écart-type avec maxScoreCount différent, utilisons demi-étoiles:
    // A: [5, 2.5, 2.5] -> sum=10, avg=10/3=3.333, var = ((5-3.333)^2 + 2*(2.5-3.333)^2)/3 = (2.7778 + 1.3889)/3 = 1.3889 -> stdDev = 1.1785, max5=1
    // B: [4.5, 4, 1.5] -> sum=10, avg=10/3=3.333, var = ((4.5-3.333)^2 + (4-3.333)^2 + (1.5-3.333)^2)/3 = (1.3611 + 0.4444 + 3.3611)/3 = 1.7222 (différent)
    // Testons plutôt le cas exact d'égalité complète -> alphabétique, et un cas de max_votes avec distributions symétriques :
    // A: [5, 3, 3, 1] -> sum=12, avg=3, var=(4+0+0+4)/4 = 2, maxScoreCount = 1
    // B: [4, 4, 2, 2] -> sum=12, avg=3, var=(1+1+1+1)/4 = 1 (stdDev différent)
    // A: [5, 4, 3, 2, 1] vs ... En fait avec demi-étoiles :
    // A: [5, 3, 2.5, 1.5] -> avg=3, diffs=[+2, 0, -0.5, -1.5] -> sq=[4, 0, 0.25, 2.25] -> sumSq=6.5, max5=1
    // B: [4.5, 4.5, 1.5, 1.5] -> avg=3, diffs=[+1.5, +1.5, -1.5, -1.5] -> sq=9 (diff)
    // A: [5, 3, 2, 2] -> avg=3, diffs=[2, 0, -1, -1], sumSq=6, max5=1
    // B: [4, 4, 3, 1] -> avg=3, diffs=[1, 1, 0, -2], sumSq=6, max5=0 !
    const items = [
      makeItem('b', 'Sans Cinq', [4, 4, 3, 1], 0),
      makeItem('a', 'Avec Cinq', [5, 3, 2, 2], 1),
    ];

    const ranked = rankGameItems(items, 'integers');
    expect(ranked.map((r) => r.name)).toEqual(['Avec Cinq', 'Sans Cinq']);
    expect(ranked[0]?.tieBreakReason).toBe('max_votes');
    expect(ranked[1]?.tieBreakReason).toBe('max_votes');
  });

  it('gère proprement les items avec 0 vote sans NaN et les place en bas du classement', () => {
    const items = [
      makeItem('empty-b', 'Zèbre sans vote', [], 0),
      makeItem('voted', 'Noté bas', [1, 1], 1),
      makeItem('empty-a', 'Alpha sans vote', [], 2),
    ];

    const ranked = rankGameItems(items, 'integers');

    expect(ranked.map((r) => r.name)).toEqual(['Noté bas', 'Alpha sans vote', 'Zèbre sans vote']);
    expect(ranked[1]).toMatchObject({
      rank: 2,
      tier: null,
      averageScore: null,
      stdDev: null,
      voteCount: 0,
      maxScoreCount: 0,
      tieBreakReason: null,
    });
    expect(ranked[2]?.rank).toBe(3);
    expect(ranked[2]?.averageScore).toBeNull();

    const grouped = groupResultsByTier(ranked);
    expect(grouped.tiers.D).toHaveLength(1);
    expect(grouped.unranked).toHaveLength(2);
  });
});

describe('schemas et room-code', () => {
  it('valide les codes de salle sans caractères ambigus', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(5);
    expect(isValidRoomCode(code)).toBe(true);
    expect(normalizeRoomCode(' k7m2p ')).toBe('K7M2P');
    expect(isValidRoomCode('O01IL')).toBe(false);
  });

  it('valide les barèmes entiers et demi-étoiles', () => {
    expect(isValidScoreForScale(3, 'integers')).toBe(true);
    expect(isValidScoreForScale(3.5, 'integers')).toBe(false);
    expect(isValidScoreForScale(0.5, 'integers')).toBe(false);

    expect(isValidScoreForScale(3.5, 'half_stars')).toBe(true);
    expect(isValidScoreForScale(0.5, 'half_stars')).toBe(true);
    expect(isValidScoreForScale(3.3, 'half_stars')).toBe(false);
  });

  it('autorise le changement de thème via room:update_settings', () => {
    const parsed = RoomUpdateSettingsPayloadSchema.safeParse({
      themeId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(parsed.success).toBe(true);

    const empty = RoomUpdateSettingsPayloadSchema.safeParse({});
    expect(empty.success).toBe(false);
  });
});
