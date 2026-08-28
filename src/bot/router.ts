import { createGame } from "../game/engine";
import { GameRepository } from "../storage/game-repository";
import { MatchRepository } from "../pvp/repository";
import { TelegramApi } from "../telegram/api";
import type { CallbackQuery, TelegramMessage, Update } from "../telegram/types";
import type { BattleIconTheme } from "../ui/icons";
import { renderGame, renderHome, renderPrivateOnly, renderRules } from "../ui/render";
import { createNetworkMatch, handlePvpCallback, joinFromDeepLink, resumeNetworkMatch } from "./pvp";
import { handlePveCallback } from "./pve";
import { safeAnswer } from "./shared";

async function home(api: TelegramApi, games: GameRepository, matches: MatchRepository, chatId: number, userId: number, editMessageId?: number): Promise<void> {
  const [game, match] = await Promise.all([games.get(userId), matches.getByUser(userId)]);
  const content = renderHome({
    hasActiveGame: Boolean(game && game.phase !== "finished"),
    hasActiveMatch: Boolean(match && match.phase !== "finished"),
  });
  if (editMessageId !== undefined) await api.editRichMessage(chatId, editMessageId, content);
  else await api.sendRichMessage(chatId, content);
}

async function message(api: TelegramApi, games: GameRepository, matches: MatchRepository, msg: TelegramMessage, icons: BattleIconTheme): Promise<void> {
  const userId = msg.from?.id;
  if (!userId) return;
  const tokens = (msg.text?.trim() ?? "").split(/\s+/);
  const command = (tokens[0] ?? "").split("@", 1)[0] ?? "";
  if (!["/start", "/new", "/help"].includes(command)) return;
  if (msg.chat.type && msg.chat.type !== "private") return void await api.sendRichMessage(msg.chat.id, renderPrivateOnly());
  if (command === "/start" && tokens[1]?.startsWith("join_")) return joinFromDeepLink(api, matches, msg, tokens[1].slice(5), icons);
  if (command === "/new") {
    const state = createGame(userId);
    await games.replace(userId, state);
    return void await api.sendRichMessage(msg.chat.id, renderGame(state, icons));
  }
  if (command === "/help") return void await api.sendRichMessage(msg.chat.id, renderRules());
  await home(api, games, matches, msg.chat.id, userId);
}

async function menu(api: TelegramApi, games: GameRepository, matches: MatchRepository, query: CallbackQuery, action: string, icons: BattleIconTheme): Promise<void> {
  const msg = query.message;
  if (!msg) return safeAnswer(api, query.id, "Это сообщение больше нельзя изменить.");
  if (action === "new") {
    const state = createGame(query.from.id);
    await games.replace(query.from.id, state);
    await api.editRichMessage(msg.chat.id, msg.message_id, renderGame(state, icons));
  } else if (action === "resume") {
    const state = await games.get(query.from.id);
    if (!state) return safeAnswer(api, query.id, "Активной игры нет.");
    await api.editRichMessage(msg.chat.id, msg.message_id, renderGame(state, icons));
  } else if (action === "pvp-new") {
    return createNetworkMatch(api, matches, query, icons);
  } else if (action === "pvp-resume") {
    return resumeNetworkMatch(api, matches, query, icons);
  } else if (action === "rules") {
    await api.editRichMessage(msg.chat.id, msg.message_id, renderRules());
  } else if (action === "home") {
    await home(api, games, matches, msg.chat.id, query.from.id, msg.message_id);
  } else {
    return safeAnswer(api, query.id, "Неизвестная команда.");
  }
  await safeAnswer(api, query.id);
}

async function callback(api: TelegramApi, games: GameRepository, matches: MatchRepository, query: CallbackQuery, icons: BattleIconTheme): Promise<void> {
  if (query.message?.chat.type && query.message.chat.type !== "private") return safeAnswer(api, query.id, "Откройте игру в личном чате с @battles_hip_bot.");
  const data = query.data ?? "";
  if (data.startsWith("m:")) return menu(api, games, matches, query, data.slice(2), icons);
  if (data.startsWith("v:")) return handlePvpCallback(api, matches, query, data, icons);
  return handlePveCallback(api, games, query, data, icons);
}

export async function handleUpdate(api: TelegramApi, games: GameRepository, matches: MatchRepository, update: Update, icons: BattleIconTheme): Promise<void> {
  if (update.message) await message(api, games, matches, update.message, icons);
  if (update.callback_query) await callback(api, games, matches, update.callback_query, icons);
}
