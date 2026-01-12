
export interface WikiData {
  startUrls: string[];
  themes: string[][]; // [displayName, urlSuffix]
}

export interface Player {
  id: string;
  nick: string;
  isOwner: boolean;
  joinedAt: number;
  finishedAt?: number;
  timeMs?: number; 
  timeStr?: string; 
  clicks: number;
  targetThemeTitle?: string;
  targetThemeSuffix?: string;
}

export interface RankingEntry {
  nick: string;
  bestTimeMs: number;
  bestTimeStr: string;
  fewestClicks: number;
  bestGameTheme: string; 
  totalWins: number;
  totalGames: number; // Adicionado para cumprir regra de segurança
  lastUpdate: number;
}

export interface Room {
  code: string;
  name: string;
  type: 'public' | 'private';
  maxPlayers: number;
  stopOnWin: boolean;
  differentThemes: boolean;
  winningCriterion: 'time' | 'clicks';
  ownerId: string;
  status: 'waiting' | 'playing' | 'finished';
  startUrl: string;
  targetThemeTitle: string;
  targetThemeSuffix: string;
  createdAt: number;
  lastActiveAt: number;
  lastActivity: number;
  startTime?: number;
  winner?: {
    nick: string;
    time: string;
    timeMs: number; // Adicionado para validação
    clicks: number;
    timestamp: number; // Adicionado para validação
  };
  players: Record<string, Player>;
}

export enum ScreenState {
  HOME,
  CREATE_ROOM,
  PUBLIC_ROOMS,
  JOIN_CODE,
  LOBBY,
  GAME,
  RESULT,
  RANKING
}
