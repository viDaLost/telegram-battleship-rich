import {
  autoPlacePlayer,
  chooseShipSize,
  clearPlayerFleet,
  manualPlace,
  playerShot,
  rotatePlacement,
  selectRow,
  selectSector,
  setInteractionMode,
  setView,
  startBattle,
  surrender,
} from "../game/engine";
import type { GameState } from "../game/types";
import { GameRepository } from "../storage/game-repository";
import { TelegramApi } from "../telegram/api";
import type { CallbackQuery } from "../telegram/types";
import type { BattleIconTheme } from "../ui/icons";
import { renderGame } from "../ui/render";
import { cloneGame, revisionAt, safeAnswer, safeEdit } from "./shared";

async function persist(
  repo: GameRepository,
  api: TelegramApi,
  query: CallbackQuery,
  current: GameState,
  icons: BattleIconTheme,
  mutate: (draft: GameState) => void,
): Promise<void> {
  const draft = cloneGame(current);
  mutate(draft);
  draft.revision = current.revision + 1;
  draft.updatedAt = Date.now();
  if (!(await repo.compareAndSet(current.userId, draft, current.revision))) {
    await safeAnswer(api, query.id, "Поле уже обновилось — нажмите ещё раз.");
    return;
  }
  await safeAnswer(api, query.id);
  if (query.message) await safeEdit(api, query.message.chat.id, query.message.message_id, renderGame(draft, icons));
}

function cell(parts: string[]): { x: number; y: number } | null {
  const x = Number(parts[3]);
  const y = Number(parts[4]);
  return [x, y].every((n) => Number.isInteger(n) && n >= 0 && n < 10) ? { x, y } : null;
}

export async function handlePveCallback(
  api: TelegramApi,
  repo: GameRepository,
  query: CallbackQuery,
  data: string,
  icons: BattleIconTheme,
): Promise<void> {
  const parts = data.split(":");
  const state = await repo.get(query.from.id);
  const incomingRevision = revisionAt(parts, 1);
  if (!state) return safeAnswer(api, query.id, "Игра не найдена. Нажмите /start.");
  if (incomingRevision === null || incomingRevision !== state.revision) {
    await safeAnswer(api, query.id, "Поле уже обновилось.");
    if (query.message) await safeEdit(api, query.message.chat.id, query.message.message_id, renderGame(state, icons));
    return;
  }

  const kind = parts[0];
  const action = parts[2];
  if (kind === "p" && state.phase === "placing") {
    if (action === "a") return persist(repo, api, query, state, icons, autoPlacePlayer);
    if (action === "r") return persist(repo, api, query, state, icons, rotatePlacement);
    if (action === "x") return persist(repo, api, query, state, icons, clearPlayerFleet);
    if (action === "go") return persist(repo, api, query, state, icons, (draft) => void startBattle(draft));
    if (action === "m") {
      const mode = parts[3] === "d" ? "direct" : "radar";
      return persist(repo, api, query, state, icons, (draft) => setInteractionMode(draft, mode));
    }
    if (action === "g") {
      const sector = parts[3] === "x" ? undefined : Number(parts[3]);
      if (sector !== undefined && (!Number.isInteger(sector) || sector < 0 || sector > 3)) return safeAnswer(api, query.id, "Некорректный сектор.");
      return persist(repo, api, query, state, icons, (draft) => void selectSector(draft, sector));
    }
    if (action === "z") {
      const size = Number(parts[3]);
      if (![1, 2, 3, 4].includes(size)) return safeAnswer(api, query.id, "Некорректный размер корабля.");
      return persist(repo, api, query, state, icons, (draft) => void chooseShipSize(draft, size));
    }
    if (action === "c") {
      const coord = cell(parts);
      if (!coord) return safeAnswer(api, query.id, "Некорректная клетка.");
      return persist(repo, api, query, state, icons, (draft) => {
        void manualPlace(draft, coord);
        draft.selectedRow = undefined;
        draft.selectedSector = undefined;
      });
    }
    // Old v0.2 messages can still emit row-picker callbacks.
    if (action === "y") {
      if (parts[3] === "x") return persist(repo, api, query, state, icons, (draft) => { draft.selectedRow = undefined; });
      const row = Number(parts[3]);
      if (!Number.isInteger(row) || row < 0 || row >= 10) return safeAnswer(api, query.id, "Некорректная строка.");
      return persist(repo, api, query, state, icons, (draft) => void selectRow(draft, row));
    }
  }

  if (kind === "b" && state.phase === "playing") {
    if (action === "m") {
      const mode = parts[3] === "d" ? "direct" : "radar";
      return persist(repo, api, query, state, icons, (draft) => setInteractionMode(draft, mode));
    }
    if (action === "g") {
      const sector = parts[3] === "x" ? undefined : Number(parts[3]);
      if (sector !== undefined && (!Number.isInteger(sector) || sector < 0 || sector > 3)) return safeAnswer(api, query.id, "Некорректный сектор.");
      return persist(repo, api, query, state, icons, (draft) => void selectSector(draft, sector));
    }
    if (action === "c" || action === "s") {
      const coord = cell(parts);
      if (!coord) return safeAnswer(api, query.id, "Некорректная клетка.");
      return persist(repo, api, query, state, icons, (draft) => playerShot(draft, coord));
    }
    if (action === "v") {
      const view = parts[3] === "o" ? "own" : "enemy";
      return persist(repo, api, query, state, icons, (draft) => setView(draft, view));
    }
    if (action === "q") return persist(repo, api, query, state, icons, surrender);
    if (action === "y") {
      if (parts[3] === "x") return persist(repo, api, query, state, icons, (draft) => { draft.selectedRow = undefined; });
      const row = Number(parts[3]);
      if (!Number.isInteger(row) || row < 0 || row >= 10) return safeAnswer(api, query.id, "Некорректная строка.");
      return persist(repo, api, query, state, icons, (draft) => void selectRow(draft, row));
    }
  }

  await safeAnswer(api, query.id, "Эта кнопка уже неактуальна.");
}
