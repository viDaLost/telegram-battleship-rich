import {
  autoPlacePlayer,
  chooseShipSize,
  clearPlayerFleet,
  createGame,
  manualPlace,
  playerShot,
  rotatePlacement,
  selectRow,
  setInteractionMode,
  setView,
  startBattle,
  surrender,
} from "./game/engine";
import type { GameState } from "./game/types";
import { GameRepository } from "./storage/game-repository";
import { TelegramApi } from "./telegram/api";
import type { CallbackQuery, TelegramMessage, Update } from "./telegram/types";
import { renderGame, renderHome, renderPrivateOnly, renderRules } from "./ui/render";

interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

async function safeAnswer(api: TelegramApi, callbackId: string, text?: string): Promise<void> {
  try {
    await api.answerCallbackQuery(callbackId, text);
  } catch (error) {
    console.error("answerCallbackQuery failed", error);
  }
}

async function persistMutation(
  repo: GameRepository,
  api: TelegramApi,
  query: CallbackQuery,
  current: GameState,
  mutate: (draft: GameState) => void,
): Promise<void> {
  const draft = cloneState(current);
  mutate(draft);
  draft.revision = current.revision + 1;
  draft.updatedAt = Date.now();

  const saved = await repo.compareAndSet(current.userId, draft, current.revision);
  if (!saved) {
    await safeAnswer(api, query.id, "Поле уже обновилось — нажмите ещё раз.");
    return;
  }

  await safeAnswer(api, query.id);
  if (query.message) {
    await api.editRichMessage(query.message.chat.id, query.message.message_id, renderGame(draft));
  }
}

function revisionFrom(parts: string[]): number | null {
  const value = Number(parts[1]);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

async function handleMessage(api: TelegramApi, repo: GameRepository, message: TelegramMessage): Promise<void> {
  const text = message.text?.trim() ?? "";
  const userId = message.from?.id;
  if (!userId) return;

  const token = text.split(/\s+/, 1)[0] ?? "";
  const command = token.split("@", 1)[0] ?? "";
  if (!["/start", "/new", "/help"].includes(command)) return;

  if (message.chat.type && message.chat.type !== "private") {
    await api.sendRichMessage(message.chat.id, renderPrivateOnly());
    return;
  }

  if (command === "/new") {
    const state = createGame(userId);
    await repo.replace(userId, state);
    await api.sendRichMessage(message.chat.id, renderGame(state));
    return;
  }

  if (command === "/help") {
    await api.sendRichMessage(message.chat.id, renderRules());
    return;
  }

  const active = await repo.get(userId);
  await api.sendRichMessage(message.chat.id, renderHome(Boolean(active && active.phase !== "finished")));
}

async function handleMenuCallback(api: TelegramApi, repo: GameRepository, query: CallbackQuery, action: string): Promise<void> {
  const message = query.message;
  if (!message) return safeAnswer(api, query.id, "Это сообщение больше нельзя изменить.");
  const userId = query.from.id;

  switch (action) {
    case "new": {
      const state = createGame(userId);
      await repo.replace(userId, state);
      await api.editRichMessage(message.chat.id, message.message_id, renderGame(state));
      await safeAnswer(api, query.id);
      return;
    }
    case "resume": {
      const state = await repo.get(userId);
      if (!state) return safeAnswer(api, query.id, "Активной игры нет.");
      await api.editRichMessage(message.chat.id, message.message_id, renderGame(state));
      await safeAnswer(api, query.id);
      return;
    }
    case "rules":
      await api.editRichMessage(message.chat.id, message.message_id, renderRules());
      await safeAnswer(api, query.id);
      return;
    case "home": {
      const active = await repo.get(userId);
      await api.editRichMessage(message.chat.id, message.message_id, renderHome(Boolean(active && active.phase !== "finished")));
      await safeAnswer(api, query.id);
      return;
    }
    default:
      await safeAnswer(api, query.id, "Неизвестная команда.");
  }
}

async function handleStateCallback(api: TelegramApi, repo: GameRepository, query: CallbackQuery, data: string): Promise<void> {
  const parts = data.split(":");
  const kind = parts[0];
  const incomingRevision = revisionFrom(parts);
  const state = await repo.get(query.from.id);

  if (!state) return safeAnswer(api, query.id, "Игра не найдена. Нажмите /start.");
  if (incomingRevision === null || incomingRevision !== state.revision) {
    await safeAnswer(api, query.id, "Поле уже обновилось.");
    if (query.message) {
      try {
        await api.editRichMessage(query.message.chat.id, query.message.message_id, renderGame(state));
      } catch (error) {
        console.error("Failed to repair stale game message", error);
      }
    }
    return;
  }

  if (kind === "p" && state.phase === "placing") {
    const action = parts[2];
    if (action === "a") return persistMutation(repo, api, query, state, (draft) => autoPlacePlayer(draft));
    if (action === "r") return persistMutation(repo, api, query, state, (draft) => rotatePlacement(draft));
    if (action === "x") return persistMutation(repo, api, query, state, (draft) => clearPlayerFleet(draft));
    if (action === "go") return persistMutation(repo, api, query, state, (draft) => void startBattle(draft));
    if (action === "m") {
      const mode = parts[3] === "d" ? "direct" : "picker";
      return persistMutation(repo, api, query, state, (draft) => setInteractionMode(draft, mode));
    }
    if (action === "y") {
      if (parts[3] === "x") {
        return persistMutation(repo, api, query, state, (draft) => {
          draft.selectedRow = undefined;
          draft.status = "Выберите строку.";
        });
      }
      const row = Number(parts[3]);
      if (!Number.isInteger(row) || row < 0 || row >= 10) return safeAnswer(api, query.id, "Некорректная строка.");
      return persistMutation(repo, api, query, state, (draft) => void selectRow(draft, row));
    }
    if (action === "z") {
      const size = Number(parts[3]);
      if (![1, 2, 3, 4].includes(size)) return safeAnswer(api, query.id, "Некорректный размер корабля.");
      return persistMutation(repo, api, query, state, (draft) => void chooseShipSize(draft, size));
    }
    if (action === "c") {
      const x = Number(parts[3]);
      const y = Number(parts[4]);
      if (![x, y].every((n) => Number.isInteger(n) && n >= 0 && n < 10)) {
        return safeAnswer(api, query.id, "Некорректная клетка.");
      }
      return persistMutation(repo, api, query, state, (draft) => {
        void manualPlace(draft, { x, y });
        draft.selectedRow = undefined;
      });
    }
  }

  if (kind === "b" && state.phase === "playing") {
    const action = parts[2];
    if (action === "m") {
      const mode = parts[3] === "d" ? "direct" : "picker";
      return persistMutation(repo, api, query, state, (draft) => setInteractionMode(draft, mode));
    }
    if (action === "y") {
      if (parts[3] === "x") {
        return persistMutation(repo, api, query, state, (draft) => {
          draft.selectedRow = undefined;
          draft.status = "Выберите строку.";
        });
      }
      const row = Number(parts[3]);
      if (!Number.isInteger(row) || row < 0 || row >= 10) return safeAnswer(api, query.id, "Некорректная строка.");
      return persistMutation(repo, api, query, state, (draft) => void selectRow(draft, row));
    }
    if (action === "c" || action === "s") {
      const x = Number(parts[3]);
      const y = Number(parts[4]);
      if (![x, y].every((n) => Number.isInteger(n) && n >= 0 && n < 10)) {
        return safeAnswer(api, query.id, "Некорректная клетка.");
      }
      return persistMutation(repo, api, query, state, (draft) => playerShot(draft, { x, y }));
    }
    if (action === "v") {
      const view = parts[3] === "o" ? "own" : "enemy";
      return persistMutation(repo, api, query, state, (draft) => setView(draft, view));
    }
    if (action === "q") return persistMutation(repo, api, query, state, (draft) => surrender(draft));
  }

  await safeAnswer(api, query.id, "Эта кнопка уже неактуальна.");
}

async function handleCallback(api: TelegramApi, repo: GameRepository, query: CallbackQuery): Promise<void> {
  if (query.message?.chat.type && query.message.chat.type !== "private") {
    await safeAnswer(api, query.id, "Откройте игру в личном чате с @battles_hip_bot.");
    return;
  }
  const data = query.data ?? "";
  if (data.startsWith("m:")) return handleMenuCallback(api, repo, query, data.slice(2));
  return handleStateCallback(api, repo, query, data);
}

async function handleUpdate(env: Env, update: Update): Promise<void> {
  const api = new TelegramApi(env.BOT_TOKEN);
  const repo = new GameRepository(env.DB);

  if (update.message) await handleMessage(api, repo, update.message);
  if (update.callback_query) await handleCallback(api, repo, update.callback_query);
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "telegram-battleship-rich" });
    }

    if (request.method !== "POST" || url.pathname !== "/telegram/webhook") {
      return new Response("Not found", { status: 404 });
    }

    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!env.WEBHOOK_SECRET || secret !== env.WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let update: Update;
    try {
      update = (await request.json()) as Update;
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    try {
      await handleUpdate(env, update);
      return json({ ok: true });
    } catch (error) {
      console.error("Update processing failed", error);
      return json({ ok: false, error: "update_processing_failed" }, 500);
    }
  },
};
