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

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function code(value: string): string {
  return `<code>${escapeHtml(value)}</code>`;
}

function imageIdReply(msg: TelegramMessage): string | null {
  const lines: string[] = [];
  let hasCustomEmojiId = false;

  if (msg.photo?.length) {
    const largest = msg.photo.reduce((best, photo) =>
      photo.width * photo.height > best.width * best.height ? photo : best,
    );
    lines.push(
      "🖼 <b>Фото</b>",
      `file_id: ${code(largest.file_id)}`,
      `file_unique_id: ${code(largest.file_unique_id)}`,
      `размер: ${largest.width}×${largest.height}`,
    );
  }

  if (msg.document) {
    const document = msg.document;
    const looksLikeImage =
      document.mime_type?.startsWith("image/") ||
      /\.(png|webp|jpe?g|gif)$/i.test(document.file_name ?? "");
    if (looksLikeImage) {
      if (lines.length) lines.push("");
      lines.push(
        "📄 <b>Изображение как файл</b>",
        `file_id: ${code(document.file_id)}`,
        `file_unique_id: ${code(document.file_unique_id)}`,
      );
      if (document.file_name) lines.push(`имя: ${code(document.file_name)}`);
      if (document.mime_type) lines.push(`тип: ${code(document.mime_type)}`);
    }
  }

  if (msg.sticker) {
    if (lines.length) lines.push("");
    lines.push(
      `🧩 <b>${msg.sticker.type === "custom_emoji" ? "Custom Emoji" : "Стикер"}</b>`,
      `file_id: ${code(msg.sticker.file_id)}`,
      `file_unique_id: ${code(msg.sticker.file_unique_id)}`,
    );
    if (msg.sticker.set_name) lines.push(`набор: ${code(msg.sticker.set_name)}`);
    if (msg.sticker.custom_emoji_id) {
      hasCustomEmojiId = true;
      lines.push(`custom_emoji_id: ${code(msg.sticker.custom_emoji_id)}`);
    }
  }

  const customEmojiIds = new Set<string>();
  for (const entity of [...(msg.entities ?? []), ...(msg.caption_entities ?? [])]) {
    if (entity.type === "custom_emoji" && entity.custom_emoji_id) customEmojiIds.add(entity.custom_emoji_id);
  }
  if (customEmojiIds.size) {
    hasCustomEmojiId = true;
    if (lines.length) lines.push("");
    lines.push("✨ <b>Custom Emoji ID</b>");
    for (const id of customEmojiIds) lines.push(code(id));
  }

  if (!lines.length) return null;

  lines.push("");
  if (hasCustomEmojiId) {
    lines.push("✅ Это <b>custom_emoji_id</b>, который можно добавить в <code>SHIP_EMOJI_IDS</code>.");
  } else {
    lines.push(
      "ℹ️ Это Telegram file ID. Для оформления поля кораблями нужен <b>custom_emoji_id</b>: сначала добавьте картинку в набор Custom Emoji, затем отправьте сам эмодзи этому боту.",
    );
  }
  return lines.join("\n");
}

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

  const idReply = imageIdReply(msg);
  if (idReply) {
    await api.sendTextMessage(msg.chat.id, idReply, msg.message_id);
    return;
  }

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
