
import { ref, set, get, update, remove, query, orderByChild, limitToLast } from "firebase/database";
import { db } from "../firebaseConfig.ts";
import { Room, Player, WikiData, RankingEntry } from "../types.ts";

const DATA_URL = "https://raw.githubusercontent.com/andersonaleixo531-hub/wiki---game---urls/refs/heads/main/Uurls.json";

// Torna a chave do nickname segura para o Firebase (remove caracteres proibidos como / . # $ [ ])
const makeSafeKey = (key: string) => {
  if (!key) return "anonimo";
  return key.replace(/[.#$[\]/]/g, "_").trim();
};

export const generateRoomCode = (): string => Math.floor(10000 + Math.random() * 90000).toString();

export const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const fetchGameData = async (): Promise<WikiData | null> => {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error("GitHub fail");
    const data = await response.json();
    return (data && Array.isArray(data.startUrls)) ? data : null;
  } catch (error) {
    console.error("Erro ao carregar dados do jogo:", error);
    return null;
  }
};

export const fetchGlobalRankings = async (): Promise<RankingEntry[]> => {
  try {
    const rankingRef = ref(db, 'rankings');
    const q = query(rankingRef, orderByChild('totalWins'), limitToLast(30));
    const snapshot = await get(q);
    const rankings: RankingEntry[] = [];
    snapshot.forEach((child) => {
      rankings.push(child.val() as RankingEntry);
    });
    // Ordena por vitórias (desc), depois por melhor tempo (asc)
    return rankings.sort((a, b) => {
      if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins;
      return (a.bestTimeMs || 9e12) - (b.bestTimeMs || 9e12);
    });
  } catch (e) {
    return [];
  }
};

const updateGlobalRanking = async (nick: string, timeMs: number, clicks: number, isWinner: boolean, themeTitle: string) => {
  const safeNick = makeSafeKey(nick);
  try {
    const rankRef = ref(db, `rankings/${safeNick}`);
    const snapshot = await get(rankRef);
    const now = Date.now();
    
    if (snapshot.exists()) {
      const current = snapshot.val() as RankingEntry;
      const currentBest = current.bestTimeMs || 9e12;
      const isNewBestTime = timeMs < currentBest;
      
      const updates: any = {
        nick: current.nick || nick, // Preserva o nick original com casing
        lastUpdate: now,
        totalGames: (current.totalGames || 0) + 1,
        totalWins: isWinner ? ((current.totalWins || 0) + 1) : (current.totalWins || 0),
        bestTimeMs: Math.min(currentBest, timeMs),
        fewestClicks: Math.min(current.fewestClicks || 999, clicks)
      };

      if (isNewBestTime) {
        updates.bestTimeStr = formatTime(timeMs);
        updates.bestGameTheme = themeTitle;
      } else {
        updates.bestTimeStr = current.bestTimeStr || formatTime(currentBest);
        updates.bestGameTheme = current.bestGameTheme || "Desconhecido";
      }
      
      await update(rankRef, updates);
    } else {
      // Primeiro registro do jogador
      await set(rankRef, {
        nick, 
        bestTimeMs: timeMs, 
        bestTimeStr: formatTime(timeMs), 
        fewestClicks: clicks,
        bestGameTheme: themeTitle, 
        totalWins: isWinner ? 1 : 0, 
        totalGames: 1,
        lastUpdate: now
      });
    }
  } catch (e) {
    console.error("Falha ao atualizar ranking:", e);
  }
};

export const createRoom = async (
  nick: string, roomName: string, type: 'public' | 'private',
  stopOnWin: boolean, differentThemes: boolean, winningCriterion: 'time' | 'clicks',
  maxPlayers: number, wikiData: WikiData
): Promise<{ roomCode: string, playerId: string }> => {
  const roomCode = generateRoomCode();
  const playerId = "p_" + Date.now();
  const startUrl = wikiData.startUrls[Math.floor(Math.random() * wikiData.startUrls.length)];
  const randomTheme = wikiData.themes[Math.floor(Math.random() * wikiData.themes.length)];
  const now = Date.now();
  
  const room: Room = {
    code: roomCode, 
    name: roomName, 
    type, 
    maxPlayers: Math.min(maxPlayers, 10), 
    stopOnWin, 
    differentThemes, 
    winningCriterion,
    ownerId: playerId, 
    status: 'waiting', 
    startUrl,
    targetThemeTitle: randomTheme[0], 
    targetThemeSuffix: randomTheme[1],
    createdAt: now, 
    lastActiveAt: now,
    lastActivity: now,
    players: { 
      [playerId]: { 
        id: playerId, nick, isOwner: true, joinedAt: now, clicks: 0,
        targetThemeTitle: randomTheme[0], targetThemeSuffix: randomTheme[1]
      } 
    }
  };
  await set(ref(db, `rooms/${roomCode}`), room);
  return { roomCode, playerId };
};

export const joinRoom = async (roomCode: string, nick: string, wikiData: WikiData): Promise<{ success: boolean, message?: string, playerId?: string }> => {
  try {
    const roomRef = ref(db, `rooms/${roomCode}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) return { success: false, message: "A sala não existe mais." };
    
    const room = snapshot.val() as Room;
    if (room.status !== 'waiting') return { success: false, message: "O jogo já começou nesta sala." };

    const players = room.players || {};
    const playersCount = Object.keys(players).length;
    if (playersCount >= room.maxPlayers) return { success: false, message: "A sala está cheia." };
    
    const playerId = "p_" + Date.now();
    let pTargetTitle = room.targetThemeTitle;
    let pTargetSuffix = room.targetThemeSuffix;
    
    if (room.differentThemes) {
      const randomTheme = wikiData.themes[Math.floor(Math.random() * wikiData.themes.length)];
      pTargetTitle = randomTheme[0];
      pTargetSuffix = randomTheme[1];
    }

    const now = Date.now();
    const updates: any = {};
    updates[`players/${playerId}`] = { 
      id: playerId, nick, isOwner: false, joinedAt: now, clicks: 0,
      targetThemeTitle: pTargetTitle, targetThemeSuffix: pTargetSuffix
    };
    updates['lastActiveAt'] = now;
    updates['lastActivity'] = now; 

    await update(roomRef, updates);
    return { success: true, playerId };
  } catch (e) {
    return { success: false, message: "Erro ao conectar." };
  }
};

export const leaveRoom = async (roomCode: string, playerId: string) => {
  try {
    const roomRef = ref(db, `rooms/${roomCode}`);
    const snapshot = await get(roomRef);
    if (snapshot.exists()) {
      const room = snapshot.val() as Room;
      const players = room.players || {};
      const remainingIds = Object.keys(players).filter(id => id !== playerId);
      
      if (remainingIds.length === 0) {
        await remove(roomRef);
        return;
      }

      const now = Date.now();
      const updates: any = {};
      updates[`players/${playerId}`] = null;
      updates['lastActiveAt'] = now;
      updates['lastActivity'] = now; 

      if (room.ownerId === playerId && remainingIds.length > 0) {
        const nextOwnerId = remainingIds[0];
        updates['ownerId'] = nextOwnerId;
        updates[`players/${nextOwnerId}/isOwner`] = true;
      }
      await update(roomRef, updates);
    }
  } catch (e) {}
};

export const touchRoom = async (roomCode: string) => {
  try {
    const now = Date.now();
    await update(ref(db, `rooms/${roomCode}`), { 
      lastActiveAt: now,
      lastActivity: now 
    });
  } catch (e) {}
};

export const syncPlayerClicks = async (roomCode: string, playerId: string, clicks: number) => {
  try {
    const now = Date.now();
    const updates: any = {};
    updates[`players/${playerId}/clicks`] = clicks;
    updates['lastActivity'] = now;
    await update(ref(db, `rooms/${roomCode}`), updates);
  } catch (e) {}
};

export const startGame = async (roomCode: string) => {
  try {
    const now = Date.now();
    await update(ref(db, `rooms/${roomCode}`), { 
      status: 'playing', 
      startTime: now, 
      lastActiveAt: now,
      lastActivity: now 
    });
  } catch (e) {}
};

export const registerWin = async (roomCode: string, playerId: string, nick: string, timeMs: number, clicks: number, stopOnWin: boolean) => {
  try {
    const roomRef = ref(db, `rooms/${roomCode}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) return;
    const room = snapshot.val() as Room;
    const player = room.players[playerId];
    const isFirstWinner = !room.winner;
    const now = Date.now();
    
    if (timeMs < 1000) return; // Anti-spam básico

    const updates: any = {
      [`players/${playerId}/finishedAt`]: now,
      [`players/${playerId}/timeMs`]: timeMs,
      [`players/${playerId}/timeStr`]: formatTime(timeMs),
      [`players/${playerId}/clicks`]: clicks,
      lastActiveAt: now,
      lastActivity: now 
    };
    
    if (isFirstWinner) {
      updates['winner'] = { nick, time: formatTime(timeMs), timeMs, clicks, timestamp: now };
      if (stopOnWin) updates['status'] = 'finished';
    }
    
    await update(roomRef, updates);
    
    // Atualiza o ranking global (apenas se for o primeiro vencedor do jogo ou se o jogo permitir continuar)
    await updateGlobalRanking(nick, timeMs, clicks, isFirstWinner, player.targetThemeTitle || room.targetThemeTitle);
  } catch (e) {
    console.error("Erro ao registrar vitória:", e);
  }
};

export const cleanupEmptyRooms = async () => {
  const now = Date.now();
  const roomsRef = ref(db, 'rooms');
  try {
    const snapshot = await get(roomsRef);
    if (!snapshot.exists()) return;
    snapshot.forEach((child) => {
      const room = child.val() as Room;
      const roomId = child.key;
      const players = room.players || {};
      const isEmpty = Object.keys(players).length === 0;
      
      if (isEmpty) {
        remove(ref(db, `rooms/${roomId}`));
        return;
      }
      
      const lastActivity = room.lastActivity || room.createdAt || 0;
      const isGhostRoom = (now - lastActivity) > 300000; // Aumentado para 5 minutos

      if (isGhostRoom) {
        remove(ref(db, `rooms/${roomId}`));
      }
    });
  } catch (e) {}
};
