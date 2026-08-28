import { fireAt } from "../game/board";
import { formatCoord } from "../game/engine";
import { randomFleet, type Rng } from "../game/placement";
import type { Coord, ShotResult, ViewMode } from "../game/types";
import type { MatchPlayer, MatchState } from "./types";

function makePlayer(userId: number, name: string, rng: Rng): MatchPlayer {
  return {
    userId,
    name: name.trim().slice(0, 48) || "Игрок",
    board: randomFleet(rng),
    ready: false,
    view: "own",
  };
}

export function createMatch(code: string, userId: number, name: string, now = Date.now(), rng: Rng = Math.random): MatchState {
  return {
    version: 1,
    code,
    revision: 0,
    phase: "waiting",
    host: makePlayer(userId, name, rng),
    createdAt: now,
    updatedAt: now,
  };
}

export function playerFor(state: MatchState, userId: number): MatchPlayer | undefined {
  if (state.host.userId === userId) return state.host;
  if (state.guest?.userId === userId) return state.guest;
  return undefined;
}

export function opponentFor(state: MatchState, userId: number): MatchPlayer | undefined {
  if (!state.guest) return undefined;
  return state.host.userId === userId ? state.guest : state.guest.userId === userId ? state.host : undefined;
}

export function joinMatch(state: MatchState, userId: number, name: string, rng: Rng = Math.random): boolean {
  if (state.host.userId === userId) return true;
  if (state.guest) return state.guest.userId === userId;
  if (state.phase !== "waiting") return false;

  state.guest = makePlayer(userId, name, rng);
  state.phase = "placing";
  state.lastEvent = `${state.guest.name} присоединился к бою.`;
  return true;
}

export function shuffleFleet(state: MatchState, userId: number, rng: Rng = Math.random): boolean {
  const player = playerFor(state, userId);
  if (!player || player.ready || state.phase === "playing" || state.phase === "finished") return false;
  player.board = randomFleet(rng);
  player.selectedSector = undefined;
  state.lastEvent = `${player.name} изменил расстановку флота.`;
  return true;
}

export function setReady(state: MatchState, userId: number, ready: boolean): boolean {
  const player = playerFor(state, userId);
  if (!player || state.phase === "playing" || state.phase === "finished") return false;
  player.ready = ready;
  player.selectedSector = undefined;
  state.lastEvent = ready ? `${player.name} готов к бою.` : `${player.name} меняет расстановку.`;

  if (state.guest && state.host.ready && state.guest.ready) {
    state.phase = "playing";
    state.turnUserId = state.host.userId;
    state.host.view = "enemy";
    state.guest.view = "enemy";
    state.lastEvent = `Бой начался. Первый ход — ${state.host.name}.`;
  } else if (state.guest) {
    state.phase = "placing";
  } else {
    state.phase = "waiting";
  }
  return true;
}

export function setMatchView(state: MatchState, userId: number, view: ViewMode): boolean {
  const player = playerFor(state, userId);
  if (!player) return false;
  player.view = view;
  player.selectedSector = undefined;
  return true;
}

export function setMatchSector(state: MatchState, userId: number, sector: number | undefined): boolean {
  const player = playerFor(state, userId);
  if (!player) return false;
  if (sector !== undefined && (!Number.isInteger(sector) || sector < 0 || sector > 3)) return false;
  player.selectedSector = sector;
  return true;
}

function describeShot(shooter: MatchPlayer, result: ShotResult): string {
  const coord = formatCoord(result.coord);
  switch (result.kind) {
    case "miss":
      return `${shooter.name}: ${coord} — мимо.`;
    case "hit":
      return `${shooter.name}: ${coord} — попадание!`;
    case "sunk":
      return `${shooter.name}: ${coord} — корабль потоплен!`;
    case "win":
      return `${shooter.name}: ${coord} — уничтожен последний корабль.`;
    case "repeat":
      return `${coord} уже проверена.`;
  }
}

export function matchShot(state: MatchState, userId: number, coord: Coord): ShotResult | null {
  if (state.phase !== "playing" || state.turnUserId !== userId) return null;
  const shooter = playerFor(state, userId);
  const target = opponentFor(state, userId);
  if (!shooter || !target) return null;

  const result = fireAt(target.board, coord);
  shooter.selectedSector = undefined;
  state.lastEvent = describeShot(shooter, result);

  if (result.kind === "repeat") return result;
  if (result.kind === "win") {
    state.phase = "finished";
    state.winnerUserId = userId;
    state.turnUserId = undefined;
    shooter.view = "enemy";
    target.view = "own";
    return result;
  }

  if (result.kind === "miss") {
    state.turnUserId = target.userId;
    target.view = "enemy";
  }
  return result;
}

export function surrenderMatch(state: MatchState, userId: number): boolean {
  if (state.phase === "finished") return false;
  const player = playerFor(state, userId);
  const opponent = opponentFor(state, userId);
  if (!player) return false;
  state.phase = "finished";
  state.turnUserId = undefined;
  state.winnerUserId = opponent?.userId;
  state.lastEvent = opponent ? `${player.name} сдался. Победа — ${opponent.name}.` : `${player.name} закрыл комнату.`;
  return true;
}
