import { BOARD_SIZE, type BoardState, type Coord, type Ship, type ShotResult } from "./types";

export const coordKey = ({ x, y }: Coord): string => `${x},${y}`;

export function parseCoordKey(key: string): Coord {
  const [xText, yText] = key.split(",");
  return { x: Number(xText), y: Number(yText) };
}

export function inBounds({ x, y }: Coord): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

export function emptyBoard(): BoardState {
  return { ships: [], shots: [] };
}

export function shipAt(board: BoardState, coord: Coord): Ship | undefined {
  const key = coordKey(coord);
  return board.ships.find((ship) => ship.cells.includes(key));
}

export function isShipSunk(board: BoardState, ship: Ship): boolean {
  const shots = new Set(board.shots);
  return ship.cells.every((cell) => shots.has(cell));
}

export function allShipsSunk(board: BoardState): boolean {
  return board.ships.length > 0 && board.ships.every((ship) => isShipSunk(board, ship));
}

export function canPlaceShip(
  board: BoardState,
  start: Coord,
  size: number,
  orientation: "H" | "V",
): boolean {
  const cells: Coord[] = Array.from({ length: size }, (_, index) => ({
    x: start.x + (orientation === "H" ? index : 0),
    y: start.y + (orientation === "V" ? index : 0),
  }));

  if (cells.some((cell) => !inBounds(cell))) return false;

  const occupied = new Set(board.ships.flatMap((ship) => ship.cells));
  for (const cell of cells) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (occupied.has(coordKey({ x: cell.x + dx, y: cell.y + dy }))) return false;
      }
    }
  }
  return true;
}

export function placeShip(
  board: BoardState,
  start: Coord,
  size: number,
  orientation: "H" | "V",
): BoardState | null {
  if (!canPlaceShip(board, start, size, orientation)) return null;

  const cells = Array.from({ length: size }, (_, index) =>
    coordKey({
      x: start.x + (orientation === "H" ? index : 0),
      y: start.y + (orientation === "V" ? index : 0),
    }),
  );

  const ship: Ship = {
    id: `s${board.ships.length + 1}`,
    size,
    cells,
  };

  return { ...board, ships: [...board.ships, ship] };
}

function markPerimeter(board: BoardState, ship: Ship): void {
  const shots = new Set(board.shots);
  for (const key of ship.cells) {
    const { x, y } = parseCoordKey(key);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const candidate = { x: x + dx, y: y + dy };
        if (inBounds(candidate)) shots.add(coordKey(candidate));
      }
    }
  }
  board.shots = [...shots];
}

export function fireAt(board: BoardState, coord: Coord): ShotResult {
  const key = coordKey(coord);
  if (board.shots.includes(key)) return { kind: "repeat", coord };

  board.shots = [...board.shots, key];
  const ship = shipAt(board, coord);
  if (!ship) return { kind: "miss", coord };

  if (!isShipSunk(board, ship)) return { kind: "hit", coord, ship };

  markPerimeter(board, ship);
  if (allShipsSunk(board)) return { kind: "win", coord, ship };
  return { kind: "sunk", coord, ship };
}

export function fleetIsComplete(board: BoardState): boolean {
  const expected = new Map<number, number>([
    [4, 1],
    [3, 2],
    [2, 3],
    [1, 4],
  ]);
  const actual = new Map<number, number>();
  for (const ship of board.ships) actual.set(ship.size, (actual.get(ship.size) ?? 0) + 1);
  return [...expected.entries()].every(([size, count]) => actual.get(size) === count);
}

export function remainingBySize(board: BoardState): Record<number, number> {
  const target: Record<number, number> = { 4: 1, 3: 2, 2: 3, 1: 4 };
  for (const ship of board.ships) target[ship.size] = Math.max(0, (target[ship.size] ?? 0) - 1);
  return target;
}
