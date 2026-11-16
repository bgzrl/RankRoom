import type { ThemeDetailDto } from '@rankroom/shared';
import { describe, expect, it } from 'vitest';
import { verifyAdminPassword } from '../config.js';
import {
  advanceFromRevealState,
  advanceFromVotingState,
  buildVoteStatuses,
  castVoteState,
  createRoomState,
  disconnectPlayerState,
  GameStateError,
  joinRoomState,
  kickPlayerState,
  leavePlayerState,
  resetDeckState,
  resetToLobbyState,
  startGameState,
  toPublicRoomState,
  transferHostIfNeeded,
  updateRoomSettingsState,
} from '../game/state-machine.js';
import { isPrivateOrReservedIp } from '../services/image.service.js';

function makeTheme(id = '11111111-1111-4111-8111-111111111111'): ThemeDetailDto {
  const now = 1_700_000_000_000;
  return {
    id,
    title: 'Jeux Indés',
    description: 'Sélection test',
    category: 'Jeux vidéo',
    isSeeded: false,
    createdAt: now,
    updatedAt: now,
    items: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        themeId: id,
        name: 'Hollow Knight',
        description: '',
        imagePath: '/uploads/11111111-1111-4111-8111-111111111111.webp',
        position: 0,
        createdAt: now,
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        themeId: id,
        name: 'Celeste',
        description: '',
        imagePath: '/uploads/22222222-2222-4222-8222-222222222222.webp',
        position: 1,
        createdAt: now,
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
        themeId: id,
        name: 'Hades',
        description: '',
        imagePath: '/uploads/33333333-3333-4333-8333-333333333333.webp',
        position: 2,
        createdAt: now,
      },
    ],
  };
}

describe('Game State Machine', () => {
  it('enchaîne LOBBY -> VOTING -> ITEM_REVEAL -> FINAL_RESULTS en masquant les notes en cours', () => {
    const theme = makeTheme();
    const { room, hostPlayer } = createRoomState({
      roomCode: 'K7M2P',
      theme,
      hostToken: 'token-host',
      hostDisplayName: 'Alice',
      hostSocketId: 'sock-1',
      settings: { revealBetweenItems: true, timeLimitSeconds: 30, itemOrder: 'sequential' },
    });

    const { player: bob } = joinRoomState(room, {
      playerToken: 'token-bob',
      displayName: 'Bob',
      socketId: 'sock-2',
    });

    expect(room.phase).toBe('LOBBY');
    startGameState(room, hostPlayer.id);
    expect(room.phase).toBe('VOTING');
    expect(room.currentItemIndex).toBe(0);

    // Alice vote 5, Bob n'a pas encore voté
    const firstVote = castVoteState(room, hostPlayer.id, {
      itemId: theme.items[0]!.id,
      score: 5,
    });
    expect(firstVote.allConnectedVoted).toBe(false);

    // Anti-triche : Bob ne voit jamais le score d'Alice pendant VOTING
    const bobView = toPublicRoomState(room, bob.id);
    expect(bobView.voteStatuses).toEqual({
      [hostPlayer.id]: true,
      [bob.id]: false,
    });
    expect(bobView.myVotes).toEqual({});
    expect(bobView.currentReveal).toBeNull();

    // Bob vote 3 -> tous les joueurs connectés ont voté
    const secondVote = castVoteState(room, bob.id, {
      itemId: theme.items[0]!.id,
      score: 3,
    });
    expect(secondVote.allConnectedVoted).toBe(true);

    // Bob modifie sa note à 4 avant expiration du timer de grâce
    const updatedVote = castVoteState(room, bob.id, {
      itemId: theme.items[0]!.id,
      score: 4,
    });
    expect(updatedVote.acceptedScore).toBe(4);

    // Passage en ITEM_REVEAL
    const outcome1 = advanceFromVotingState(room, {
      generateResultId: () => 'res-1234',
      revealDurationMs: 10_000,
    });
    expect(outcome1.kind).toBe('ITEM_REVEAL');
    if (outcome1.kind === 'ITEM_REVEAL') {
      expect(outcome1.reveal.averageScore).toBe(4.5);
      expect(outcome1.reveal.votes).toHaveLength(2);
    }

    // Item 2 (index 1)
    const next2 = advanceFromRevealState(room, { generateResultId: () => 'res-1234' });
    expect(next2.kind).toBe('NEXT_VOTING');
    expect(room.currentItemIndex).toBe(1);

    // Skip item 2 avec 0 vote
    advanceFromVotingState(room, {
      generateResultId: () => 'res-1234',
      revealDurationMs: 10_000,
    });
    advanceFromRevealState(room, { generateResultId: () => 'res-1234' });
    expect(room.currentItemIndex).toBe(2);

    // Item 3 (index 2)
    castVoteState(room, hostPlayer.id, { itemId: theme.items[2]!.id, score: 2 });
    castVoteState(room, bob.id, { itemId: theme.items[2]!.id, score: 2 });
    advanceFromVotingState(room, {
      generateResultId: () => 'res-1234',
      revealDurationMs: 10_000,
    });

    const finish = advanceFromRevealState(room, { generateResultId: () => 'res-1234' });
    expect(finish.kind).toBe('FINAL_RESULTS');
    expect(room.phase).toBe('FINAL_RESULTS');
    if (finish.kind === 'FINAL_RESULTS') {
      expect(finish.result.rankings.map((r) => r.name)).toEqual([
        'Hollow Knight',
        'Hades',
        'Celeste',
      ]);
      expect(finish.result.rankings[2]?.averageScore).toBeNull();
      expect(finish.result.rankings[2]?.tier).toBeNull();
    }
  });

  it('restaure le joueur et ses votes après reconnexion via playerToken', () => {
    const theme = makeTheme();
    const { room, hostPlayer } = createRoomState({
      roomCode: 'K7M2P',
      theme,
      hostToken: 'token-host',
      hostDisplayName: 'Alice',
      hostSocketId: 'sock-1',
      settings: { itemOrder: 'sequential' },
    });

    startGameState(room, hostPlayer.id);
    castVoteState(room, hostPlayer.id, { itemId: theme.items[0]!.id, score: 4 });

    disconnectPlayerState(room, hostPlayer.id);
    expect(room.players.get(hostPlayer.id)?.connected).toBe(false);

    const { player: restored, reconnected } = joinRoomState(room, {
      playerToken: 'token-host',
      displayName: 'Alice',
      socketId: 'sock-new',
    });
    expect(reconnected).toBe(true);
    expect(restored.id).toBe(hostPlayer.id);
    expect(restored.connected).toBe(true);
    expect(toPublicRoomState(room, restored.id).myVotes).toEqual({
      [theme.items[0]!.id]: 4,
    });
  });

  it('autorise le changement de thème en lobby et le reset_to_lobby après partie', () => {
    const theme1 = makeTheme('11111111-1111-4111-8111-111111111111');
    const theme2 = makeTheme('22222222-2222-4222-8222-222222222222');
    theme2.title = 'Autre Thème';

    const { room, hostPlayer } = createRoomState({
      roomCode: 'M9P4Q',
      theme: theme1,
      hostToken: 'token-host',
      hostDisplayName: 'Alice',
      hostSocketId: 'sock-1',
      settings: { revealBetweenItems: false },
    });

    updateRoomSettingsState(room, hostPlayer.id, {
      theme: theme2,
      settings: { ratingScale: 'half_stars' },
    });

    expect(room.theme.id).toBe(theme2.id);
    expect(room.settings.ratingScale).toBe('half_stars');

    startGameState(room, hostPlayer.id);
    expect(() =>
      updateRoomSettingsState(room, hostPlayer.id, { theme: theme1 }),
    ).toThrow(GameStateError);

    // Termine rapidement les 3 items
    advanceFromVotingState(room, { generateResultId: () => 'r1', revealDurationMs: 0 });
    advanceFromVotingState(room, { generateResultId: () => 'r1', revealDurationMs: 0 });
    advanceFromVotingState(room, { generateResultId: () => 'r1', revealDurationMs: 0 });
    expect(room.phase).toBe('FINAL_RESULTS');

    resetToLobbyState(room, hostPlayer.id);
    expect(room.phase).toBe('LOBBY');
    expect(room.votesByItemId.size).toBe(0);
    expect(buildVoteStatuses(room)).toEqual({ [hostPlayer.id]: false });
  });

  it("gère le kick, le transfert d'hôte et le rejet de notes hors barème", () => {
    const theme = makeTheme();
    const { room, hostPlayer } = createRoomState({
      roomCode: 'Z3X8C',
      theme,
      hostToken: 'token-host',
      hostDisplayName: 'Alice',
      hostSocketId: 'sock-1',
      settings: { ratingScale: 'integers', itemOrder: 'sequential' },
    });
    const { player: bob } = joinRoomState(room, {
      playerToken: 'token-bob',
      displayName: 'Bob',
      socketId: 'sock-2',
    });

    startGameState(room, hostPlayer.id);

    expect(() =>
      castVoteState(room, bob.id, { itemId: theme.items[0]!.id, score: 3.5 }),
    ).toThrow(GameStateError);

    castVoteState(room, hostPlayer.id, { itemId: theme.items[0]!.id, score: 5 });
    const kickResult = kickPlayerState(room, hostPlayer.id, bob.id);
    expect(kickResult.allConnectedVoted).toBe(true);
    expect(room.players.has(bob.id)).toBe(false);

    // Rejoins puis test transfert hôte lors du départ
    const { player: carol } = joinRoomState(room, {
      playerToken: 'token-carol',
      displayName: 'Carol',
      socketId: 'sock-3',
    });
    const leaveRes = leavePlayerState(room, hostPlayer.id);
    expect(leaveRes.newHostId).toBe(carol.id);
    expect(room.players.get(carol.id)?.isHost).toBe(true);

    disconnectPlayerState(room, carol.id);
    expect(transferHostIfNeeded(room)).toBeNull();
  });

  it('active la pioche intelligente par défaut (random, avoidRepeats=true) et permet resetDeckState', () => {
    const theme = makeTheme();
    theme.items.push(
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
        themeId: theme.id,
        name: 'Portal 2',
        description: '',
        imagePath: '',
        position: 3,
        createdAt: 1_700_000_000_000,
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
        themeId: theme.id,
        name: 'Dead Cells',
        description: '',
        imagePath: '',
        position: 4,
        createdAt: 1_700_000_000_000,
      },
    );

    const { room, hostPlayer } = createRoomState({
      roomCode: 'D3C4K',
      theme,
      hostToken: 'token-host',
      hostDisplayName: 'Alice',
      hostSocketId: 'sock-1',
      settings: { itemCount: 3, revealBetweenItems: false },
    });

    expect(room.settings.itemOrder).toBe('random');
    expect(room.settings.avoidRepeats).toBe(true);
    expect(room.settings.itemCount).toBe(3);

    const initialPublic = toPublicRoomState(room, hostPlayer.id);
    expect(initialPublic.totalThemeItems).toBe(5);
    expect(initialPublic.unplayedCount).toBe(5);
    expect(initialPublic.totalItems).toBe(3);

    // Manche 1 : 3 items tirés
    const start1 = startGameState(room, hostPlayer.id);
    expect(start1.unplayedCount).toBe(2);
    expect(room.orderedItems).toHaveLength(3);
    const round1Ids = room.orderedItems.map((i) => i.id);

    advanceFromVotingState(room, { generateResultId: () => 'r1', revealDurationMs: 0 });
    advanceFromVotingState(room, { generateResultId: () => 'r1', revealDurationMs: 0 });
    advanceFromVotingState(room, { generateResultId: () => 'r1', revealDurationMs: 0 });
    resetToLobbyState(room, hostPlayer.id);

    const afterRound1Public = toPublicRoomState(room, hostPlayer.id);
    expect(afterRound1Public.unplayedCount).toBe(2);

    // Manche 2 : les 2 inédits doivent sortir en premier avant le reset de pioche
    const start2 = startGameState(room, hostPlayer.id);
    expect(start2.deckResetOccurred).toBe(true);
    expect(start2.unplayedCount).toBe(4);
    const round2FirstTwoIds = room.orderedItems.slice(0, 2).map((i) => i.id);
    for (const id of round2FirstTwoIds) {
      expect(round1Ids).not.toContain(id);
    }

    advanceFromVotingState(room, { generateResultId: () => 'r2', revealDurationMs: 0 });
    advanceFromVotingState(room, { generateResultId: () => 'r2', revealDurationMs: 0 });
    advanceFromVotingState(room, { generateResultId: () => 'r2', revealDurationMs: 0 });
    resetToLobbyState(room, hostPlayer.id);

    const resetStats = resetDeckState(room, hostPlayer.id);
    expect(resetStats).toEqual({ totalThemeItems: 5, unplayedCount: 5 });
  });
});

describe('Sécurité HTTP (SSRF & Admin Password)', () => {
  it('bloque toutes les plages IP privées/locales IPv4 et IPv6', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('10.20.30.40')).toBe(true);
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('172.31.255.254')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.10')).toBe(true);
    expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true);
    expect(isPrivateOrReservedIp('fd12:3456::1')).toBe(true);
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);

    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('172.32.0.1')).toBe(false);
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false);
  });

  it('vérifie ADMIN_PASSWORD en temps constant', () => {
    expect(verifyAdminPassword(undefined, undefined)).toBe(true);
    expect(verifyAdminPassword('secret-123', 'secret-123')).toBe(true);
    expect(verifyAdminPassword('secret-124', 'secret-123')).toBe(false);
    expect(verifyAdminPassword('short', 'secret-123')).toBe(false);
    expect(verifyAdminPassword(undefined, 'secret-123')).toBe(false);
  });
});
