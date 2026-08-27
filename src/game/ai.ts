import { BOARD_SIZE, type BoardState, type Coord } from "./types";
import { coordKey, inBounds, isShipSunk, parseCoordKey, shipAt } from "./board";
import type { Rng } from "./placement";

function shuffled<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function unknown(board: BoardState, coord: Coord): boolean {
  return inBounds(coord) && !board.shots.includes(coordKey(coord));
}

function activeHitCells(board: BoardState): Coord[] {
  const hits: Coord[] = [];
  for (const shotKey of board.shots) {
    const coord = parseCoordKey(shotKey);
    const ship = shipAt(board, coord);
    if (ship && !isShipSunk(board, ship)) hits.push(coord);
  }
  return hits;
}

function connectedClusters(coords: Coord[]): Coord[][] {
  const remaining = new Map(coords.map((coord) => [coordKey(coord), coord]));
  const clusters: Coord[][] = [];

  while (remaining.size > 0) {
    const first = remaining.values().next().value as Coord;
    const queue = [first];
    remaining.delete(coordKey(first));
    const cluster: Coord[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      cluster.push(current);
      const neighbors = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ];
      for (const neighbor of neighbors) {
        const key = coordKey(neighbor);
        const found = remaining.get(key);
        if (found) {
          remaining.delete(key);
          queue.push(found);
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters.sort((a, b) => b.length - a.length);
}

function targetCandidates(board: BoardState, cluster: Coord[]): Coord[] {
  if (cluster.length >= 2) {
    const sameX = cluster.every((cell) => cell.x === cluster[0]!.x);
    if (sameX) {
      const x = cluster[0]!.x;
      const ys = cluster.map((cell) => cell.y).sort((a, b) => a - b);
      return [
        { x, y: ys[0]! - 1 },
        { x, y: ys[ys.length - 1]! + 1 },
      ].filter((coord) => unknown(board, coord));
    }

    const sameY = cluster.every((cell) => cell.y === cluster[0]!.y);
    if (sameY) {
      const y = cluster[0]!.y;
      const xs = cluster.map((cell) => cell.x).sort((a, b) => a - b);
      return [
        { x: xs[0]! - 1, y },
        { x: xs[xs.length - 1]! + 1, y },
      ].filter((coord) => unknown(board, coord));
    }
  }

  const c = cluster[0]!;
  return [
    { x: c.x + 1, y: c.y },
    { x: c.x - 1, y: c.y },
    { x: c.x, y: c.y + 1 },
    { x: c.x, y: c.y - 1 },
  ].filter((coord) => unknown(board, coord));
}

export function chooseAiShot(board: BoardState, rng: Rng = Math.random): Coord {
  const clusters = connectedClusters(activeHitCells(board));
  for (const cluster of clusters) {
    const candidates = targetCandidates(board, cluster);
    if (candidates.length > 0) return shuffled(candidates, rng)[0]!;
  }

  const parity: Coord[] = [];
  const fallback: Coord[] = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const coord = { x, y };
      if (!unknown(board, coord)) continue;
      fallback.push(coord);
      if ((x + y) % 2 === 0) parity.push(coord);
    }
  }

  const pool = parity.length > 0 ? parity : fallback;
  if (pool.length === 0) throw new Error("AI has no available shots");
  return shuffled(pool, rng)[0]!;
}
