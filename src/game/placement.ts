import { emptyBoard, placeShip } from "./board";
import { FLEET_SIZES, type BoardState, type Orientation } from "./types";

export type Rng = () => number;

function randomInt(maxExclusive: number, rng: Rng): number {
  return Math.floor(rng() * maxExclusive);
}

export function randomFleet(rng: Rng = Math.random): BoardState {
  for (let restart = 0; restart < 50; restart += 1) {
    let board = emptyBoard();
    let failed = false;

    for (const size of FLEET_SIZES) {
      let placed = false;
      for (let attempt = 0; attempt < 500; attempt += 1) {
        const orientation: Orientation = rng() < 0.5 ? "H" : "V";
        const x = randomInt(10, rng);
        const y = randomInt(10, rng);
        const next = placeShip(board, { x, y }, size, orientation);
        if (next) {
          board = next;
          placed = true;
          break;
        }
      }
      if (!placed) {
        failed = true;
        break;
      }
    }

    if (!failed) return board;
  }

  throw new Error("Unable to generate a valid fleet after multiple restarts");
}
