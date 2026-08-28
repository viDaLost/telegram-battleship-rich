import {
  createMatch,
  joinMatch,
  matchShot,
  playerFor,
  setMatchSector,
  setMatchView,
  setReady,
  shuffleFleet,
  surrenderMatch,
} from "../pvp/engine";
import { MatchRepository } from "../pvp/repository";
import { renderInviteError, renderMatch } from "../pvp/render";
import type { MatchState } from "../pvp/types";
import { TelegramApi } from "../telegram/api";
import type { CallbackQuery, TelegramMessage } from "../telegram/types";
import type { BattleIconTheme } from "../ui/icons";
import { cloneMatch, createRoomCode, displayName, revisionAt, safeAnswer, safeEdit } from "./shared";

const PRESS_PULSE_MS = 110;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface PersistOptions {
  pulseCell?: { x: number; y: number };
}

async function editParticipants(api: TelegramApi, state: MatchState, icons: BattleIconTheme): Promise<void> {
  const players = [state.host, state.guest].filter((p): p is NonNullable<typeof p> => Boolean(p));
  await Promise.all(players.map(async (player) => {
    if (player.message) await safeEdit(api, player.message.chatId, player.message.messageId, renderMatch(state, player.userId, icons));
  }));
}

async function persist(
  repo: MatchRepository,
  api: TelegramApi,
  query: CallbackQuery,
  current: MatchState,
  icons: BattleIconTheme,
  mutate: (draft: MatchState) => void,
  scope: "actor" | "all" = "all",
  options: PersistOptions = {},
): Promise<void> {
  const draft = cloneMatch(current);
  const actor = playerFor(draft, query.from.id);
  if (!actor) return safeAnswer(api, query.id, "Вы не участник этого боя.");
  if (query.message) actor.message = { chatId: query.message.chat.id, messageId: query.message.message_id };
  mutate(draft);
  draft.revision = current.revision + 1;
  draft.updatedAt = Date.now();
  if (!(await repo.compareAndSet(draft, current.revision))) return safeAnswer(api, query.id, "Бой уже обновился — нажмите ещё раз.");

  await safeAnswer(api, query.id);

  if (options.pulseCell && query.message) {
    const preview = cloneMatch(current);
    const previewActor = playerFor(preview, query.from.id);
    if (previewActor) {
      previewActor.selectedCell = `${options.pulseCell.x},${options.pulseCell.y}`;
      preview.lastEvent = "🎯 Цель выбрана…";
      await safeEdit(api, query.message.chat.id, query.message.message_id, renderMatch(preview, query.from.id, icons));
      await delay(PRESS_PULSE_MS);
    }
  }

  if (scope === "actor") {
    if (actor.message) await safeEdit(api, actor.message.chatId, actor.message.messageId, renderMatch(draft, actor.userId, icons));
  } else {
    await editParticipants(api, draft, icons);
  }
}

export async function createNetworkMatch(api: TelegramApi, repo: MatchRepository, query: CallbackQuery, icons: BattleIconTheme): Promise<void> {
  const message = query.message;
  if (!message) return safeAnswer(api, query.id, "Это сообщение больше нельзя изменить.");
  let code = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = createRoomCode();
    if (!(await repo.get(candidate))) { code = candidate; break; }
  }
  if (!code) return safeAnswer(api, query.id, "Не удалось создать комнату. Попробуйте ещё раз.");
  const state = createMatch(code, query.from.id, displayName(query.from));
  state.host.message = { chatId: message.chat.id, messageId: message.message_id };
  await repo.create(state);
  await api.editRichMessage(message.chat.id, message.message_id, renderMatch(state, query.from.id, icons));
  await safeAnswer(api, query.id, "Комната создана");
}

export async function resumeNetworkMatch(api: TelegramApi, repo: MatchRepository, query: CallbackQuery, icons: BattleIconTheme): Promise<void> {
  if (!query.message) return safeAnswer(api, query.id, "Сообщение недоступно.");
  const current = await repo.getByUser(query.from.id);
  if (!current) return safeAnswer(api, query.id, "Активного сетевого боя нет.");
  const draft = cloneMatch(current);
  const player = playerFor(draft, query.from.id);
  if (!player) return safeAnswer(api, query.id, "Вы не участник этой комнаты.");
  player.message = { chatId: query.message.chat.id, messageId: query.message.message_id };
  draft.revision = current.revision + 1;
  draft.updatedAt = Date.now();
  if (!(await repo.compareAndSet(draft, current.revision))) return safeAnswer(api, query.id, "Комната обновилась — нажмите ещё раз.");
  await api.editRichMessage(query.message.chat.id, query.message.message_id, renderMatch(draft, query.from.id, icons));
  await safeAnswer(api, query.id);
}

export async function joinFromDeepLink(api: TelegramApi, repo: MatchRepository, message: TelegramMessage, codeRaw: string, icons: BattleIconTheme): Promise<void> {
  const user = message.from;
  if (!user) return;
  const code = codeRaw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  let current = await repo.get(code);
  if (!current) return void await api.sendRichMessage(message.chat.id, renderInviteError("Эта ссылка больше не активна или комната не найдена."));

  if (!playerFor(current, user.id)) {
    const draft = cloneMatch(current);
    if (!joinMatch(draft, user.id, displayName(user))) {
      return void await api.sendRichMessage(message.chat.id, renderInviteError("В этой комнате уже играют два человека."));
    }
    draft.revision = current.revision + 1;
    draft.updatedAt = Date.now();
    if (await repo.compareAndSet(draft, current.revision)) {
      await repo.linkMember(user.id, code, draft.updatedAt);
      current = draft;
    } else {
      current = await repo.get(code);
      if (!current || !playerFor(current, user.id)) {
        return void await api.sendRichMessage(message.chat.id, renderInviteError("Комната только что изменилась. Откройте ссылку ещё раз."));
      }
    }
  }

  const sent = await api.sendRichMessage(message.chat.id, renderMatch(current, user.id, icons));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const latest = await repo.get(code);
    if (!latest) return;
    const draft = cloneMatch(latest);
    const player = playerFor(draft, user.id);
    if (!player) return;
    player.message = { chatId: sent.chat.id, messageId: sent.message_id };
    draft.revision = latest.revision + 1;
    draft.updatedAt = Date.now();
    if (await repo.compareAndSet(draft, latest.revision)) {
      await editParticipants(api, draft, icons);
      return;
    }
  }
}

export async function handlePvpCallback(api: TelegramApi, repo: MatchRepository, query: CallbackQuery, data: string, icons: BattleIconTheme): Promise<void> {
  const parts = data.split(":");
  const code = parts[1] ?? "";
  const incomingRevision = revisionAt(parts, 2);
  const action = parts[3];
  const state = await repo.get(code);
  if (!state) return safeAnswer(api, query.id, "Комната больше не существует.");
  if (!playerFor(state, query.from.id)) return safeAnswer(api, query.id, "Вы не участник этого боя.");
  if (incomingRevision === null || incomingRevision !== state.revision) {
    await safeAnswer(api, query.id, "Бой уже обновился.");
    if (query.message) await safeEdit(api, query.message.chat.id, query.message.message_id, renderMatch(state, query.from.id, icons));
    return;
  }
  if (action === "shuffle") return persist(repo, api, query, state, icons, (draft) => void shuffleFleet(draft, query.from.id), "actor");
  if (action === "ready") return persist(repo, api, query, state, icons, (draft) => void setReady(draft, query.from.id, parts[4] === "1"));
  if (action === "view" && state.phase === "playing") {
    const view = parts[4] === "o" ? "own" : "enemy";
    return persist(repo, api, query, state, icons, (draft) => void setMatchView(draft, query.from.id, view), "actor");
  }
  if (action === "sector" && state.phase === "playing") {
    const sector = parts[4] === "x" ? undefined : Number(parts[4]);
    if (sector !== undefined && (!Number.isInteger(sector) || sector < 0 || sector > 3)) return safeAnswer(api, query.id, "Некорректный сектор.");
    return persist(repo, api, query, state, icons, (draft) => void setMatchSector(draft, query.from.id, sector), "actor");
  }
  if (action === "shot" && state.phase === "playing") {
    const x = Number(parts[4]);
    const y = Number(parts[5]);
    if (![x, y].every((n) => Number.isInteger(n) && n >= 0 && n < 10)) return safeAnswer(api, query.id, "Некорректная клетка.");
    if (state.turnUserId !== query.from.id) return safeAnswer(api, query.id, "Сейчас ход соперника.");
    return persist(
      repo,
      api,
      query,
      state,
      icons,
      (draft) => void matchShot(draft, query.from.id, { x, y }),
      "all",
      { pulseCell: { x, y } },
    );
  }
  if (action === "quit") return persist(repo, api, query, state, icons, (draft) => void surrenderMatch(draft, query.from.id));
  await safeAnswer(api, query.id, "Эта кнопка уже неактуальна.");
}
