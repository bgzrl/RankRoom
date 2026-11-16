export type RatingScale = 'integers' | 'half_stars';
export type ItemOrder = 'sequential' | 'random';
export type TimeLimitSeconds = 15 | 30 | 60 | null;
export type GamePhase = 'LOBBY' | 'VOTING' | 'ITEM_REVEAL' | 'FINAL_RESULTS';
export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';
export type TieBreakReason = 'std_dev' | 'max_votes' | 'alphabetical' | null;
export type ImageSearchSource = 'wikipedia-fr' | 'wikipedia-en' | 'wikimedia-commons';

export interface ImageSearchResultDto {
  title: string;
  previewUrl: string;
  fullUrl: string;
  source: ImageSearchSource;
}

export interface RoomSettings {
  timeLimitSeconds: TimeLimitSeconds;
  revealBetweenItems: boolean;
  itemOrder: ItemOrder;
  ratingScale: RatingScale;
  itemCount: number | null;
  avoidRepeats: boolean;
}

export interface ThemeItemInput {
  id?: string;
  name: string;
  description: string;
  imagePath: string;
}

export interface ThemeItemDto {
  id: string;
  themeId: string;
  name: string;
  description: string;
  imagePath: string;
  position: number;
  createdAt: number;
}

export interface ThemeSummaryDto {
  id: string;
  title: string;
  description: string;
  category: string;
  isSeeded: boolean;
  itemCount: number;
  previewImages: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ThemeDetailDto {
  id: string;
  title: string;
  description: string;
  category: string;
  isSeeded: boolean;
  createdAt: number;
  updatedAt: number;
  items: ThemeItemDto[];
}

export interface ThemeExportDto {
  version: 1;
  exportedAt: string;
  theme: {
    title: string;
    description: string;
    category: string;
    items: Array<{
      name: string;
      description: string;
      imagePath: string;
    }>;
  };
}

export interface PublicPlayer {
  id: string;
  displayName: string;
  isHost: boolean;
  connected: boolean;
  joinedAt: number;
}

export interface PublicThemeItem {
  id: string;
  name: string;
  description: string;
  imagePath: string;
  position: number;
}

export interface PlayerVoteDetail {
  playerId: string;
  displayName: string;
  score: number;
}

export interface ItemRevealResult {
  item: PublicThemeItem;
  itemIndex: number;
  totalItems: number;
  averageScore: number | null;
  stdDev: number | null;
  voteCount: number;
  votes: PlayerVoteDetail[];
}

export interface ScoreDistributionBucket {
  score: number;
  count: number;
}

export interface RankedItemResult {
  itemId: string;
  name: string;
  description: string;
  imagePath: string;
  originalPosition: number;
  rank: number;
  tier: Tier | null;
  averageScore: number | null;
  stdDev: number | null;
  maxScoreCount: number;
  voteCount: number;
  tieBreakReason: TieBreakReason;
  votesByPlayer: PlayerVoteDetail[];
  scoreDistribution: ScoreDistributionBucket[];
}

export interface PlayerSummary {
  id: string;
  displayName: string;
  isHost: boolean;
}

export interface PersistedGameResult {
  id: string;
  roomCode: string;
  themeId: string | null;
  themeTitle: string;
  themeCategory: string;
  settings: RoomSettings;
  players: PlayerSummary[];
  rankings: RankedItemResult[];
  createdAt: number;
}

export interface PublicThemeSummary {
  id: string;
  title: string;
  description: string;
  category: string;
  itemCount: number;
}

export interface PublicRoomState {
  roomCode: string;
  phase: GamePhase;
  theme: PublicThemeSummary;
  settings: RoomSettings;
  players: PublicPlayer[];
  selfPlayerId: string;
  currentItemIndex: number;
  totalItems: number;
  totalThemeItems: number;
  unplayedCount: number;
  currentItem: PublicThemeItem | null;
  phaseEndsAt: number | null;
  allVotedGraceEndsAt: number | null;
  voteStatuses: Record<string, boolean>;
  myVotes: Record<string, number>;
  currentReveal: ItemRevealResult | null;
  finalResult: PersistedGameResult | null;
}

export interface SocketError {
  code: string;
  message: string;
}

export type SocketAck<T> =
  | { ok: true; data: T }
  | { ok: false; error: SocketError };

export interface RoomCreatePayload {
  displayName: string;
  themeId: string;
  settings?: Partial<RoomSettings>;
}

export interface RoomJoinPayload {
  roomCode: string;
  displayName: string;
}

export interface RoomUpdateSettingsPayload {
  themeId?: string;
  settings?: Partial<RoomSettings>;
}

export interface GameVotePayload {
  itemId: string;
  score: number;
}

export interface GameKickPlayerPayload {
  targetPlayerId: string;
}

export interface ClientToServerEvents {
  'room:create': (
    payload: RoomCreatePayload,
    ack: (res: SocketAck<{ roomCode: string; playerId: string; state: PublicRoomState }>) => void,
  ) => void;
  'room:join': (
    payload: RoomJoinPayload,
    ack: (res: SocketAck<{ playerId: string; state: PublicRoomState }>) => void,
  ) => void;
  'room:leave': (
    payload: Record<string, never>,
    ack: (res: SocketAck<{ left: true }>) => void,
  ) => void;
  'room:update_settings': (
    payload: RoomUpdateSettingsPayload,
    ack: (
      res: SocketAck<{
        theme: PublicThemeSummary;
        settings: RoomSettings;
        totalThemeItems: number;
        unplayedCount: number;
      }>,
    ) => void,
  ) => void;
  'room:reset_deck': (
    payload: Record<string, never>,
    ack: (res: SocketAck<{ totalThemeItems: number; unplayedCount: number }>) => void,
  ) => void;
  'game:start': (
    payload: Record<string, never>,
    ack: (res: SocketAck<{ started: true }>) => void,
  ) => void;
  'game:vote': (
    payload: GameVotePayload,
    ack: (res: SocketAck<{ acceptedScore: number }>) => void,
  ) => void;
  'game:next_item': (
    payload: Record<string, never>,
    ack: (res: SocketAck<{ advanced: true }>) => void,
  ) => void;
  'game:kick_player': (
    payload: GameKickPlayerPayload,
    ack: (res: SocketAck<{ kicked: true }>) => void,
  ) => void;
  'game:reset_to_lobby': (
    payload: Record<string, never>,
    ack: (res: SocketAck<{ reset: true }>) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: PublicRoomState) => void;
  'room:settings_updated': (payload: {
    theme: PublicThemeSummary;
    settings: RoomSettings;
    totalThemeItems: number;
    unplayedCount: number;
  }) => void;
  'room:deck_updated': (payload: {
    themeId: string;
    totalThemeItems: number;
    unplayedCount: number;
  }) => void;
  'room:player_joined': (payload: { player: PublicPlayer }) => void;
  'room:player_left': (payload: {
    playerId: string;
    newHostId: string | null;
    connected: boolean;
    removed: boolean;
  }) => void;
  'room:player_kicked': (payload: { playerId: string; reason: string }) => void;
  'game:phase_changed': (payload: {
    phase: GamePhase;
    currentItemIndex: number;
    totalItems: number;
    totalThemeItems: number;
    unplayedCount: number;
    currentItem: PublicThemeItem | null;
    phaseEndsAt: number | null;
    allVotedGraceEndsAt: number | null;
    voteStatuses: Record<string, boolean>;
  }) => void;
  'game:vote_status': (payload: {
    itemId: string;
    voteStatuses: Record<string, boolean>;
    allVotedGraceEndsAt: number | null;
  }) => void;
  'game:item_revealed': (payload: {
    itemReveal: ItemRevealResult;
    phaseEndsAt: number | null;
  }) => void;
  'game:finished': (payload: { result: PersistedGameResult }) => void;
  'room:error': (error: SocketError) => void;
}
