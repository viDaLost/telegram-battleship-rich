import type { MatchState } from "../pvp/types";
import type { InputRichMessage, TelegramUser } from "../telegram/types";
import { TelegramApi } from "../telegram/api";
import type { GameState } from "../game/types";

export function cloneGame(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export function cloneMatch(state: MatchState): MatchState {
  return JSON.parse(JSON.stringify(state)) as MatchState;
}

export function displayName(user: TelegramUser): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return (full || user.username || `Игрок ${user.id}`).slice(0, 48);
}

export function createRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

export async function safeAnswer(
  api: TelegramApi,
  callbackId: string,
  text?: string,
  showAlert = false,
): Promise<void> {
  try {
    await api.answerCallbackQuery(callbackId, text, showAlert);
  } catch (error) {
    console.error("answerCallbackQuery failed", error);
  }
}

export async function safeEdit(api: TelegramApi, chatId: number, messageId: number, content: InputRichMessage): Promise<void> {
  try {
    await api.editRichMessage(chatId, messageId, content);
  } catch (error) {
    console.error("editRichMessage failed", error);
  }
}

export function revisionAt(parts: string[], index: number): number | null {
  const value = Number(parts[index]);
  return Number.isInteger(value) && value >= 0 ? value : null;
}
