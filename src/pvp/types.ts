import type { BoardState, ViewMode } from "../game/types";

export type MatchPhase = "waiting" | "placing" | "playing" | "finished";

export interface MatchMessageRef {
  chatId: number;
  messageId: number;
}

export interface MatchPlayer {
  userId: number;
  name: string;
  board: BoardState;
  ready: boolean;
  view: ViewMode;
  selectedSector?: number | undefined;
  /** Transient visual press state, formatted as `x,y`. */
  selectedCell?: string | undefined;
  message?: MatchMessageRef | undefined;
}

export interface MatchState {
  version: 1;
  code: string;
  revision: number;
  phase: MatchPhase;
  host: MatchPlayer;
  guest?: MatchPlayer | undefined;
  turnUserId?: number | undefined;
  winnerUserId?: number | undefined;
  lastEvent?: string | undefined;
  createdAt: number;
  updatedAt: number;
}
