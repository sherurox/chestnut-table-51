export type ID = string;

export interface Settings {
  presetBuyIns: number[];
}

export interface Player {
  id: ID;
  name: string;
  type: "regular" | "guest";
  status: "active" | "archived";
  createdAt: string;
}

export interface Season {
  id: ID;
  name: string;
  status: "active" | "closed";
  startedOn: string;
  endedOn?: string;
}

export interface BuyIn {
  player: ID;
  amount: number;
  at: string;
}

export interface CashOut {
  player: ID;
  amount: number;
}

export interface Game {
  id: ID;
  seasonId: ID;
  date: string;
  mode: "season" | "incognito";
  status: "finished" | "deleted";
  players: ID[];
  buyIns: BuyIn[];
  cashOuts: CashOut[];
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
}

export interface LiveMarker {
  gameId: ID;
  startedAt: string;
}

export interface Data {
  version: 1;
  settings: Settings;
  players: Player[];
  seasons: Season[];
  games: Game[];
  liveGame: LiveMarker | null;
}
