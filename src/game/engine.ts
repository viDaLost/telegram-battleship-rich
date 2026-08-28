import { chooseAiShot } from "./ai";
import { emptyBoard, fireAt, fleetIsComplete, placeShip, remainingBySize } from "./board";
import { randomFleet, type Rng } from "./placement";
import type { Coord, GameState, InteractionMode, Orientation, ShotResult } from "./types";

const COLS = ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И", "К"];

export function formatCoord(coord: Coord): string {
  return `${COLS[coord.x] ?? "?"}${coord.y + 1}`;
}

function clearSelection(state: GameState): void {
  state.selectedRow = undefined;
  state.selectedSector = undefined;
  state.selectedCell = undefined;
}

export function createGame(userId: number, now = Date.now(), rng: Rng = Math.random): GameState {
  return {
    version: 2,
    userId,
    revision: 0,
    phase: "placing",
    playerBoard: emptyBoard(),
    enemyBoard: randomFleet(rng),
    selectedSize: 4,
    orientation: "H",
    view: "own",
    interactionMode: "direct",
    selectedRow: undefined,
    selectedSector: undefined,
    selectedCell: undefined,
    turn: "player",
    winner: undefined,
    status: "Выберите корабль и нажмите клетку поля или используйте «Авто».",
    createdAt: now,
    updatedAt: now,
  };
}

function selectNextAvailableSize(state: GameState): void {
  const remaining = remainingBySize(state.playerBoard);
  const next = [4, 3, 2, 1].find((size) => (remaining[size] ?? 0) > 0);
  if (next) state.selectedSize = next;
}

export function autoPlacePlayer(state: GameState, rng: Rng = Math.random): void {
  state.playerBoard = randomFleet(rng);
  state.view = "own";
  clearSelection(state);
  state.status = "Флот расставлен. Можно начинать бой.";
}

export function clearPlayerFleet(state: GameState): void {
  state.playerBoard = emptyBoard();
  state.selectedSize = 4;
  clearSelection(state);
  state.status = "Поле очищено. Расставьте корабли заново.";
}

export function rotatePlacement(state: GameState): void {
  state.orientation = state.orientation === "H" ? "V" : "H";
  state.selectedCell = undefined;
  state.status = `Ориентация: ${state.orientation === "H" ? "горизонтально" : "вертикально"}.`;
}

export function chooseShipSize(state: GameState, size: number): boolean {
  const remaining = remainingBySize(state.playerBoard);
  if ((remaining[size] ?? 0) <= 0) return false;
  state.selectedSize = size;
  state.selectedCell = undefined;
  state.status = `Выбран корабль: ${size} палуб${size === 1 ? "а" : "ы"}. Нажмите клетку поля.`;
  return true;
}

export function manualPlace(state: GameState, coord: Coord): boolean {
  state.selectedCell = undefined;
  const remaining = remainingBySize(state.playerBoard);
  if ((remaining[state.selectedSize] ?? 0) <= 0) selectNextAvailableSize(state);

  const next = placeShip(state.playerBoard, coord, state.selectedSize, state.orientation);
  if (!next) {
    state.status = "Сюда корабль не помещается или касается другого корабля.";
    return false;
  }

  state.playerBoard = next;
  if (fleetIsComplete(state.playerBoard)) {
    state.status = "Флот готов. Нажмите «Начать бой».";
  } else {
    selectNextAvailableSize(state);
    state.status = "Корабль установлен. Выберите следующую позицию.";
  }
  return true;
}

export function startBattle(state: GameState): boolean {
  if (!fleetIsComplete(state.playerBoard)) {
    state.status = "Сначала разместите все 10 кораблей.";
    return false;
  }
  state.phase = "playing";
  state.view = "enemy";
  clearSelection(state);
  state.turn = "player";
  state.status =
    state.interactionMode === "direct"
      ? "Ваш ход. Нажмите клетку прямо на поле противника."
      : "Ваш ход. Выберите сектор резервного радара, затем клетку.";
  return true;
}

function describeShot(prefix: string, result: ShotResult): string {
  const at = formatCoord(result.coord);
  switch (result.kind) {
    case "miss":
      return `${prefix} ${at}: мимо.`;
    case "hit":
      return `${prefix} ${at}: попадание! Стреляйте ещё.`;
    case "sunk":
      return `${prefix} ${at}: корабль уничтожен! Стреляйте ещё.`;
    case "win":
      return `${prefix} ${at}: уничтожен последний корабль.`;
    case "repeat":
      return `${prefix} ${at}: эта клетка уже проверена.`;
  }
}

function runAiTurn(state: GameState, rng: Rng): string {
  const events: string[] = [];
  for (let guard = 0; guard < 100 && state.phase === "playing"; guard += 1) {
    const coord = chooseAiShot(state.playerBoard, rng);
    const result = fireAt(state.playerBoard, coord);
    events.push(describeShot("Противник", result));

    if (result.kind === "win") {
      state.phase = "finished";
      state.winner = "ai";
      state.turn = "ai";
      state.view = "own";
      clearSelection(state);
      return `${events.join(" ")} Поражение.`;
    }

    if (result.kind === "miss") {
      state.turn = "player";
      state.view = "enemy";
      clearSelection(state);
      return `${events.join(" ")} Теперь ваш ход.`;
    }
  }

  throw new Error("AI turn exceeded safety guard");
}

export function playerShot(state: GameState, coord: Coord, rng: Rng = Math.random): void {
  if (state.phase !== "playing" || state.turn !== "player") return;

  const result = fireAt(state.enemyBoard, coord);
  clearSelection(state);
  state.status = describeShot("Вы", result);

  if (result.kind === "repeat") return;
  if (result.kind === "win") {
    state.phase = "finished";
    state.winner = "player";
    state.view = "enemy";
    state.status = `${state.status} Победа! Весь вражеский флот уничтожен.`;
    return;
  }

  if (result.kind === "miss") {
    state.turn = "ai";
    state.status = `${state.status} ${runAiTurn(state, rng)}`;
  } else {
    state.turn = "player";
  }
}

export function setView(state: GameState, view: "enemy" | "own"): void {
  state.view = view;
  clearSelection(state);
}

export function setInteractionMode(state: GameState, mode: InteractionMode): void {
  state.interactionMode = mode === "picker" ? "radar" : mode;
  clearSelection(state);
  state.status =
    state.interactionMode === "direct"
      ? "Прямое управление включено: нажимайте клетки внутри поля, как в Rich Text Chess."
      : "Резервный радар включён: выберите четверть поля, затем координату.";
}

export function selectSector(state: GameState, sector: number | undefined): boolean {
  if (sector !== undefined && (!Number.isInteger(sector) || sector < 0 || sector > 3)) return false;
  state.selectedSector = sector;
  state.selectedRow = undefined;
  state.selectedCell = undefined;
  state.status = sector === undefined ? "Выберите сектор радара." : "Сектор выбран. Нажмите клетку для выстрела.";
  return true;
}

export function selectRow(state: GameState, row: number): boolean {
  if (!Number.isInteger(row) || row < 0 || row >= 10) return false;
  state.selectedRow = row;
  state.selectedSector = undefined;
  state.selectedCell = undefined;
  state.status = `Выбрана строка ${row + 1}. Теперь выберите столбец.`;
  return true;
}

export function surrender(state: GameState): void {
  if (state.phase === "finished") return;
  state.phase = "finished";
  state.winner = "ai";
  state.view = "own";
  clearSelection(state);
  state.status = "Вы сдались. Игра окончена.";
}

export function setOrientation(state: GameState, orientation: Orientation): void {
  state.orientation = orientation;
  state.selectedCell = undefined;
}
