export const BOARD_SIZE = 10;
export const FLEET_SIZES = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1] as const;

export type Orientation = "H" | "V";
export type Phase = "placing" | "playing" | "finished";
export type ViewMode = "enemy" | "own";
export type Winner = "player" | "ai";
export type InteractionMode = "picker" | "direct";

export interface Coord {
  x: number;
  y: number;
}

export interface Ship {
  id: string;
  size: number;
  cells: string[];
}

export interface BoardState {
  ships: Ship[];
  shots: string[];
}

export interface GameState {
  version: 2;
  userId: number;
  revision: number;
  phase: Phase;
  playerBoard: BoardState;
  enemyBoard: BoardState;
  selectedSize: number;
  orientation: Orientation;
  view: ViewMode;
  interactionMode: InteractionMode;
  selectedRow: number | undefined;
  turn: "player" | "ai";
  winner?: Winner;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export type ShotKind = "miss" | "hit" | "sunk" | "win" | "repeat";

export interface ShotResult {
  kind: ShotKind;
  coord: Coord;
  ship?: Ship;
}
