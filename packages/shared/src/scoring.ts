import { getAllowedScoresForScale } from './schemas.js';
import type {
  PlayerVoteDetail,
  RankedItemResult,
  RatingScale,
  ScoreDistributionBucket,
  TieBreakReason,
  Tier,
} from './types.js';

export const ALL_TIERS: readonly Tier[] = ['S', 'A', 'B', 'C', 'D'] as const;

export const TIER_DEFINITIONS: ReadonlyArray<{
  tier: Tier;
  label: string;
  rangeLabel: string;
  minScore: number;
}> = [
  { tier: 'S', label: 'Tier S', rangeLabel: '≥ 4.50', minScore: 4.5 },
  { tier: 'A', label: 'Tier A', rangeLabel: '3.75 – 4.49', minScore: 3.75 },
  { tier: 'B', label: 'Tier B', rangeLabel: '2.75 – 3.74', minScore: 2.75 },
  { tier: 'C', label: 'Tier C', rangeLabel: '1.75 – 2.74', minScore: 1.75 },
  { tier: 'D', label: 'Tier D', rangeLabel: '< 1.75', minScore: 0 },
];

const FLOAT_EPSILON = 1e-9;

export interface ScoringItemInput {
  itemId: string;
  name: string;
  description: string;
  imagePath: string;
  originalPosition: number;
  votes: PlayerVoteDetail[];
}

interface ComputedItemInternal {
  input: ScoringItemInput;
  rawAverage: number | null;
  averageScore: number | null;
  stdDev: number | null;
  maxScoreCount: number;
  voteCount: number;
  tier: Tier | null;
  scoreDistribution: ScoreDistributionBucket[];
}

export function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeTier(averageScore: number | null): Tier | null {
  if (averageScore === null || !Number.isFinite(averageScore)) {
    return null;
  }
  const rounded = roundToTwoDecimals(averageScore);
  if (rounded >= 4.5) return 'S';
  if (rounded >= 3.75) return 'A';
  if (rounded >= 2.75) return 'B';
  if (rounded >= 1.75) return 'C';
  return 'D';
}

export function computePopulationStdDev(scores: readonly number[], mean: number): number {
  if (scores.length === 0) return 0;
  let squaredDiffSum = 0;
  for (const score of scores) {
    const diff = score - mean;
    squaredDiffSum += diff * diff;
  }
  return Math.sqrt(squaredDiffSum / scores.length);
}

export function buildScoreDistribution(
  scores: readonly number[],
  scale: RatingScale,
): ScoreDistributionBucket[] {
  const allowedScores = getAllowedScoresForScale(scale);
  const counts = new Map<number, number>();
  for (const s of allowedScores) {
    counts.set(s, 0);
  }
  for (const score of scores) {
    const normalized = Math.round(score * 2) / 2;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return allowedScores.map((s) => ({
    score: s,
    count: counts.get(s) ?? 0,
  }));
}

export function computeItemMetrics(
  input: ScoringItemInput,
  scale: RatingScale,
): ComputedItemInternal {
  const scores = input.votes.map((v) => v.score);
  const voteCount = scores.length;

  if (voteCount === 0) {
    return {
      input,
      rawAverage: null,
      averageScore: null,
      stdDev: null,
      maxScoreCount: 0,
      voteCount: 0,
      tier: null,
      scoreDistribution: buildScoreDistribution([], scale),
    };
  }

  let sum = 0;
  let maxScoreCount = 0;
  for (const score of scores) {
    sum += score;
    if (Math.abs(score - 5) < FLOAT_EPSILON) {
      maxScoreCount += 1;
    }
  }

  const rawAverage = sum / voteCount;
  const averageScore = roundToTwoDecimals(rawAverage);
  const rawStdDev = computePopulationStdDev(scores, rawAverage);
  const stdDev = roundToTwoDecimals(rawStdDev);

  return {
    input,
    rawAverage,
    averageScore,
    stdDev,
    maxScoreCount,
    voteCount,
    tier: computeTier(averageScore),
    scoreDistribution: buildScoreDistribution(scores, scale),
  };
}

function compareComputedItems(a: ComputedItemInternal, b: ComputedItemInternal): number {
  const aHasVotes = a.voteCount > 0 && a.rawAverage !== null;
  const bHasVotes = b.voteCount > 0 && b.rawAverage !== null;

  if (aHasVotes && !bHasVotes) return -1;
  if (!aHasVotes && bHasVotes) return 1;

  if (!aHasVotes && !bHasVotes) {
    const nameCmp = a.input.name.localeCompare(b.input.name, 'fr', { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    return a.input.originalPosition - b.input.originalPosition;
  }

  const avgDiff = (b.rawAverage ?? 0) - (a.rawAverage ?? 0);
  if (Math.abs(avgDiff) > FLOAT_EPSILON) {
    return avgDiff;
  }

  const stdDevA = computePopulationStdDev(
    a.input.votes.map((v) => v.score),
    a.rawAverage ?? 0,
  );
  const stdDevB = computePopulationStdDev(
    b.input.votes.map((v) => v.score),
    b.rawAverage ?? 0,
  );
  const stdDiff = stdDevA - stdDevB;
  if (Math.abs(stdDiff) > FLOAT_EPSILON) {
    return stdDiff;
  }

  if (b.maxScoreCount !== a.maxScoreCount) {
    return b.maxScoreCount - a.maxScoreCount;
  }

  const nameCmp = a.input.name.localeCompare(b.input.name, 'fr', { sensitivity: 'base' });
  if (nameCmp !== 0) return nameCmp;

  return a.input.originalPosition - b.input.originalPosition;
}

function detectTieBreakReason(
  target: ComputedItemInternal,
  peers: readonly ComputedItemInternal[],
): TieBreakReason {
  if (target.voteCount === 0 || target.rawAverage === null) {
    return null;
  }

  const sameAveragePeers = peers.filter(
    (other) =>
      other !== target &&
      other.voteCount > 0 &&
      other.rawAverage !== null &&
      Math.abs(other.rawAverage - target.rawAverage!) <= FLOAT_EPSILON,
  );

  if (sameAveragePeers.length === 0) {
    return null;
  }

  const targetRawStdDev = computePopulationStdDev(
    target.input.votes.map((v) => v.score),
    target.rawAverage,
  );

  const hasDifferentStdDev = sameAveragePeers.some((other) => {
    const otherStd = computePopulationStdDev(
      other.input.votes.map((v) => v.score),
      other.rawAverage!,
    );
    return Math.abs(otherStd - targetRawStdDev) > FLOAT_EPSILON;
  });

  if (hasDifferentStdDev) {
    return 'std_dev';
  }

  const hasDifferentMaxVotes = sameAveragePeers.some(
    (other) => other.maxScoreCount !== target.maxScoreCount,
  );

  if (hasDifferentMaxVotes) {
    return 'max_votes';
  }

  return 'alphabetical';
}

export function rankGameItems(
  items: readonly ScoringItemInput[],
  scale: RatingScale,
): RankedItemResult[] {
  const computed = items.map((item) => computeItemMetrics(item, scale));
  const sorted = [...computed].sort(compareComputedItems);

  return sorted.map((entry, index) => ({
    itemId: entry.input.itemId,
    name: entry.input.name,
    description: entry.input.description,
    imagePath: entry.input.imagePath,
    originalPosition: entry.input.originalPosition,
    rank: index + 1,
    tier: entry.tier,
    averageScore: entry.averageScore,
    stdDev: entry.stdDev,
    maxScoreCount: entry.maxScoreCount,
    voteCount: entry.voteCount,
    tieBreakReason: detectTieBreakReason(entry, sorted),
    votesByPlayer: [...entry.input.votes].sort((a, b) =>
      a.displayName.localeCompare(b.displayName, 'fr', { sensitivity: 'base' }),
    ),
    scoreDistribution: entry.scoreDistribution,
  }));
}

export function groupResultsByTier(rankings: readonly RankedItemResult[]): {
  tiers: Record<Tier, RankedItemResult[]>;
  unranked: RankedItemResult[];
} {
  const tiers: Record<Tier, RankedItemResult[]> = {
    S: [],
    A: [],
    B: [],
    C: [],
    D: [],
  };
  const unranked: RankedItemResult[] = [];

  for (const item of rankings) {
    if (item.tier === null) {
      unranked.push(item);
    } else {
      tiers[item.tier].push(item);
    }
  }

  return { tiers, unranked };
}
