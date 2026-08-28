export const BOARD_SIZE = 10;
export const FLEET_SIZES = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1] as const;

export type Orientation = "H" | "V";
export type Phase = "placing" | "playing" | "finished";
export type ViewMode = "enemy" | "own";
export type Winner = "player" | "ai";
/**
 * `picker` is kept only for backwards compatibility with games persisted by v0.2.
 * New games use `radar`, which never relies on buttons inside table cells on Apple clients.
 */
export type InteractionMode = "radar" | "direct" | "picker";

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
  /** Legacy two-step picker state. Kept so old D1 rows remain readable. */
  selectedRow: number | undefined;
  /** 0..3 quadrant used by the iOS-safe 5×5 radar control. */
  selectedSector?: number | undefined;
  turn: "player" | "ai";
  winner?: Winner | undefined;
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
