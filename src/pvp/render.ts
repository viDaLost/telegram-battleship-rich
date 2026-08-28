import { isShipSunk } from "../game/board";
import type { InputRichBlock, InputRichMessage, RichMessageButton } from "../telegram/types";
import { boardTable, fleetDock, legendBlock, radarPicker } from "../ui/board";
import type { BattleIconTheme } from "../ui/icons";
import { bold, callbackButton, disabledButton, richMessage, urlButton } from "../ui/rich";
import { opponentFor, playerFor } from "./engine";
import type { MatchPlayer, MatchState } from "./types";

function inviteLink(code: string): string {
  return `https://t.me/battles_hip_bot?start=join_${code}`;
}

function shareLink(code: string): string {
  const invite = inviteLink(code);
  const text = "⚓ Вызываю тебя на классический Морской бой 10×10 прямо в Telegram.";
  return `https://t.me/share/url?url=${encodeURIComponent(invite)}&text=${encodeURIComponent(text)}`;
}

function statusBlock(text: string): InputRichBlock {
  return { type: "pullquote", text: ["⚓ ", bold(text)] };
}

function readyLabel(player: MatchPlayer | undefined): string {
  if (!player) return "ожидание";
  return player.ready ? "готов" : "расстановка";
}

function aliveCount(player: MatchPlayer): number {
  return player.board.ships.filter((ship) => !isShipSunk(player.board, ship)).length;
}

function waitingButtons(state: MatchState, player: MatchPlayer): InputRichBlock[] {
  const actions: RichMessageButton[] = [
    player.ready
      ? callbackButton("✏️ Изменить флот", `v:${state.code}:${state.revision}:ready:0`, "link")
      : callbackButton("🎲 Перемешать", `v:${state.code}:${state.revision}:shuffle`, "primary"),
    player.ready
      ? disabledButton("✅ Вы готовы")
      : callbackButton("✅ Готов к бою", `v:${state.code}:${state.revision}:ready:1`, "success"),
  ];

  const blocks: InputRichBlock[] = [{ type: "buttons", buttons: actions, align: "center" }];
  if (state.host.userId === player.userId && !state.guest) {
    blocks.unshift({
      type: "buttons",
      buttons: [urlButton("📨 Отправить вызов другу", shareLink(state.code), "primary")],
      align: "center",
    });
  }
  return blocks;
}

function renderLobby(state: MatchState, userId: number, icons: BattleIconTheme): InputRichMessage {
  const player = playerFor(state, userId)!;
  const opponent = opponentFor(state, userId);
  const title = state.guest ? "⚔️ Подготовка к сетевому бою" : "🌊 Комната создана";
  const lead = state.guest
    ? `${state.host.name}: ${readyLabel(state.host)} · ${state.guest.name}: ${readyLabel(state.guest)}`
    : "Отправьте ссылку другу. Пока он подключается, можно выбрать расстановку флота.";

  return richMessage([
    { type: "heading", size: 3, text: title },
    { type: "paragraph", text: [bold(`Комната ${state.code}`), " · ", lead] },
    ...(state.lastEvent ? [statusBlock(state.lastEvent)] : []),
    boardTable({ board: player.board, own: true, icons }),
    { type: "paragraph", text: [bold("Ваш флот: "), fleetDock(player.board, icons)] },
    ...waitingButtons(state, player),
    ...(opponent
      ? [{ type: "footer" as const, text: player.ready ? "Ждём готовности второго игрока." : "Нажмите «Готов к бою», когда расстановка вас устраивает." }]
      : [{ type: "footer" as const, text: `Ссылка: ${inviteLink(state.code)}` }]),
  ]);
}

function matchRadar(state: MatchState, player: MatchPlayer, enemy: MatchPlayer): InputRichBlock[] {
  return radarPicker({
    selectedSector: player.selectedSector,
    isDisabled: (x, y) => enemy.board.shots.includes(`${x},${y}`),
    sectorCallback: (sector) => `v:${state.code}:${state.revision}:sector:${sector}`,
    cellCallback: (x, y) => `v:${state.code}:${state.revision}:shot:${x}:${y}`,
    backCallback: `v:${state.code}:${state.revision}:sector:x`,
    title: "🎯 Резервный прицел",
  });
}

function renderBattle(state: MatchState, userId: number, icons: BattleIconTheme): InputRichMessage {
  const player = playerFor(state, userId)!;
  const enemy = opponentFor(state, userId)!;
  const own = player.view === "own";
  const isTurn = state.turnUserId === userId;
  const title = own ? "🚢 Мой флот" : `🎯 ${enemy.name}`;
  const directCellCallback = !own && isTurn
    ? (x: number, y: number) => `v:${state.code}:${state.revision}:shot:${x}:${y}`
    : undefined;

  const viewButtons: RichMessageButton[] = [
    player.view === "enemy"
      ? disabledButton("🎯 Противник")
      : callbackButton("🎯 Противник", `v:${state.code}:${state.revision}:view:e`, "primary"),
    player.view === "own"
      ? disabledButton("🚢 Мой флот")
      : callbackButton("🚢 Мой флот", `v:${state.code}:${state.revision}:view:o`, "primary"),
  ];

  const fallback: InputRichBlock[] = !own && isTurn
    ? [{
        type: "details",
        summary: "📱 Резервный прицел",
        blocks: matchRadar(state, player, enemy),
        ...(player.selectedSector !== undefined ? { is_open: true as const } : {}),
      }]
    : [];

  return richMessage([
    { type: "heading", size: 3, text: title },
    {
      type: "paragraph",
      text: [
        bold(isTurn ? "Ваш ход" : `Ход: ${enemy.name}`),
        ` · Ваши ${aliveCount(player)}/10 · ${enemy.name} ${aliveCount(enemy)}/10`,
      ],
    },
    ...(state.lastEvent ? [statusBlock(state.lastEvent)] : []),
    boardTable({
      board: own ? player.board : enemy.board,
      own,
      icons,
      selectedCell: player.selectedCell,
      ...(directCellCallback ? { directCellCallback } : {}),
    }),
    { type: "paragraph", text: [bold("Ваш флот: "), fleetDock(player.board, icons)] },
    ...fallback,
    { type: "divider" },
    { type: "buttons", buttons: viewButtons, align: "center" },
    {
      type: "buttons",
      buttons: [callbackButton("🏳 Сдаться", `v:${state.code}:${state.revision}:quit`, "danger")],
      align: "center",
    },
    legendBlock(icons),
    { type: "footer", text: `Комната ${state.code} · нажимайте клетки прямо на поле; резервный прицел остаётся доступен.` },
  ]);
}

function renderFinished(state: MatchState, userId: number, icons: BattleIconTheme): InputRichMessage {
  const player = playerFor(state, userId)!;
  const enemy = opponentFor(state, userId);
  const won = state.winnerUserId === userId;
  const reveal = enemy?.board ?? player.board;

  return richMessage([
    { type: "heading", size: 2, text: won ? "🏆 Победа в сетевом бою" : "⚓ Бой завершён" },
    ...(state.lastEvent ? [statusBlock(state.lastEvent)] : []),
    boardTable({ board: reveal, own: true, icons }),
    {
      type: "buttons",
      buttons: [
        callbackButton("👥 Новый бой с другом", "m:pvp-new", "success"),
        callbackButton("🏠 Меню", "m:home", "primary"),
      ],
      align: "center",
    },
  ]);
}

export function renderMatch(state: MatchState, userId: number, icons: BattleIconTheme = {}): InputRichMessage {
  if (!playerFor(state, userId)) {
    return richMessage([{ type: "paragraph", text: "Вы не участник этой комнаты." }]);
  }
  if (state.phase === "waiting" || state.phase === "placing") return renderLobby(state, userId, icons);
  if (state.phase === "playing") return renderBattle(state, userId, icons);
  return renderFinished(state, userId, icons);
}

export function renderInviteError(message: string): InputRichMessage {
  return richMessage([
    { type: "heading", size: 3, text: "⚓ Сетевой бой" },
    { type: "paragraph", text: message },
    { type: "buttons", buttons: [callbackButton("🏠 В меню", "m:home", "primary")], align: "center" },
  ]);
}
