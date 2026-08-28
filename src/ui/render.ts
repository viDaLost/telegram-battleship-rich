import { fleetIsComplete, remainingBySize } from "../game/board";
import { formatCoord } from "../game/engine";
import { type Coord, type GameState } from "../game/types";
import type { InputRichBlock, InputRichMessage, RichMessageButton } from "../telegram/types";
import { boardTable, fleetDock, fleetSummary, legendBlock, radarPicker } from "./board";
import type { BattleIconTheme } from "./icons";
import { shipIcon } from "./icons";
import { bold, callbackButton, disabledButton, italic, richMessage, urlButton } from "./rich";

function statusBlock(text: string): InputRichBlock {
  return { type: "pullquote", text: ["⚓ ", bold(text)] };
}

function isRadar(state: GameState): boolean {
  return state.interactionMode !== "direct";
}

function modeButton(state: GameState, phase: "p" | "b"): RichMessageButton {
  if (isRadar(state)) {
    return callbackButton("⚡ Прямые клетки · beta", `${phase}:${state.revision}:m:d`, "link");
  }
  return callbackButton("📱 Радар для iPhone", `${phase}:${state.revision}:m:r`, "primary");
}

function gameRadar(state: GameState, phase: "p" | "b"): InputRichBlock[] {
  if (!isRadar(state)) return [];
  const disabled = phase === "b" ? (x: number, y: number) => state.enemyBoard.shots.includes(`${x},${y}`) : undefined;
  return radarPicker({
    selectedSector: state.selectedSector,
    ...(disabled ? { isDisabled: disabled } : {}),
    title: phase === "b" ? "🎯 Быстрый прицел" : "📍 Точка установки",
    sectorCallback: (sector) => `${phase}:${state.revision}:g:${sector}`,
    cellCallback: (x, y) => `${phase}:${state.revision}:c:${x}:${y}`,
    backCallback: `${phase}:${state.revision}:g:x`,
  });
}

export function renderPrivateOnly(): InputRichMessage {
  return richMessage([
    { type: "heading", size: 3, text: "⚓ Морской бой" },
    {
      type: "paragraph",
      text: "Игровое поле и приватный флот открываются в личном чате с ботом. Ссылку на сетевой бой можно отправить другу из меню.",
    },
    {
      type: "buttons",
      buttons: [urlButton("🎮 Открыть @battles_hip_bot", "https://t.me/battles_hip_bot", "primary")],
      align: "center",
    },
  ]);
}

export interface HomeOptions {
  hasActiveGame: boolean;
  hasActiveMatch: boolean;
}

export function renderHome(options: HomeOptions): InputRichMessage {
  const resumeButtons: RichMessageButton[] = [];
  if (options.hasActiveGame) resumeButtons.push(callbackButton("▶️ Бой с ботом", "m:resume", "success"));
  if (options.hasActiveMatch) resumeButtons.push(callbackButton("▶️ Сетевой бой", "m:pvp-resume", "success"));

  return richMessage([
    { type: "heading", size: 2, text: "⚓ Морской бой" },
    {
      type: "paragraph",
      text: "Классический бой 10×10 полностью внутри Telegram. Можно играть против компьютера или отправить другу персональную ссылку на комнату.",
    },
    { type: "divider" },
    {
      type: "buttons",
      buttons: [
        callbackButton("🤖 Против бота", "m:new", "primary"),
        callbackButton("👥 Играть с другом", "m:pvp-new", "primary"),
      ],
      align: "center",
    },
    ...(resumeButtons.length ? [{ type: "buttons" as const, buttons: resumeButtons, align: "center" as const }] : []),
    {
      type: "buttons",
      buttons: [callbackButton("📖 Правила", "m:rules", "link")],
      align: "center",
    },
    { type: "footer", text: "Rich Messages · Bot API 10.3 · iPhone-safe radar controls" },
  ]);
}

export function renderRules(): InputRichMessage {
  return richMessage([
    { type: "heading", size: 2, text: "📖 Правила" },
    { type: "paragraph", text: "Поле — 10×10. У каждого игрока 10 кораблей: 1×4, 2×3, 3×2 и 4×1." },
    { type: "paragraph", text: "Корабли не касаются друг друга даже по диагонали. Попадание даёт дополнительный выстрел, промах передаёт ход." },
    {
      type: "paragraph",
      text: [bold("На iPhone: "), "выберите четверть радара, затем нужную клетку 5×5. Это использует RichBlockButtons вне таблицы и не зависит от текущего бага Telegram iOS с кнопками внутри table-cell."],
    },
    {
      type: "paragraph",
      text: [bold("Android/Desktop: "), "можно включить режим «Прямые клетки · beta» и стрелять непосредственно по таблице."],
    },
    { type: "buttons", buttons: [callbackButton("← Назад", "m:home", "primary")], align: "center" },
  ]);
}

export function renderPlacement(state: GameState, icons: BattleIconTheme = {}): InputRichMessage {
  const remaining = remainingBySize(state.playerBoard);
  const sizeButtons = [4, 3, 2, 1].map((size) => {
    const left = remaining[size] ?? 0;
    if (left <= 0) return disabledButton([shipIcon(icons, size), ` ${size}× ✓`]);
    const selected = state.selectedSize === size;
    return callbackButton(
      [shipIcon(icons, size), ` ${selected ? "●" : "○"} ${size}× · ${left}`],
      `p:${state.revision}:z:${size}`,
      selected ? "success" : "primary",
    );
  });

  const orientation = state.orientation === "H" ? "↔️ Горизонтально" : "↕️ Вертикально";
  const startButton = fleetIsComplete(state.playerBoard)
    ? callbackButton("⚔️ Начать бой", `p:${state.revision}:go`, "success")
    : disabledButton("⚔️ Расставьте весь флот");

  const directCellCallback = !isRadar(state) ? (x: number, y: number) => `p:${state.revision}:c:${x}:${y}` : undefined;

  return richMessage([
    { type: "heading", size: 3, text: "🚢 Расстановка флота" },
    statusBlock(state.status),
    {
      type: "paragraph",
      text: ["Сейчас: ", bold(`${state.selectedSize}-палубный`), " · ", italic(state.orientation === "H" ? "горизонтально" : "вертикально")],
    },
    boardTable({ board: state.playerBoard, own: true, icons, ...(directCellCallback ? { directCellCallback } : {}) }),
    { type: "paragraph", text: [bold("Флот: "), fleetDock(state.playerBoard, icons)] },
    { type: "buttons", buttons: sizeButtons, align: "center" },
    ...gameRadar(state, "p"),
    {
      type: "buttons",
      buttons: [
        callbackButton("🎲 Авто", `p:${state.revision}:a`, "primary"),
        callbackButton(orientation, `p:${state.revision}:r`, "link"),
        callbackButton("🧹 Сброс", `p:${state.revision}:x`, "danger"),
      ],
      align: "center",
    },
    { type: "buttons", buttons: [modeButton(state, "p"), startButton], align: "center" },
    { type: "buttons", buttons: [callbackButton("← Меню", "m:home", "link")], align: "center" },
  ]);
}

export function renderBattle(state: GameState, icons: BattleIconTheme = {}): InputRichMessage {
  const own = state.view === "own";
  const title = own ? "🚢 Мой флот" : "🎯 Радар противника";
  const turnText = state.turn === "player" ? "Ваш ход" : "Ход противника";
  const directCellCallback =
    !own && !isRadar(state) && state.turn === "player"
      ? (x: number, y: number) => `b:${state.revision}:s:${x}:${y}`
      : undefined;

  const viewButtons = [
    state.view === "enemy"
      ? disabledButton("🎯 Противник")
      : callbackButton("🎯 Противник", `b:${state.revision}:v:e`, "primary"),
    state.view === "own"
      ? disabledButton("🚢 Мой флот")
      : callbackButton("🚢 Мой флот", `b:${state.revision}:v:o`, "primary"),
  ];

  return richMessage([
    { type: "heading", size: 3, text: title },
    {
      type: "paragraph",
      text: [bold(turnText), ` · Ваши ${fleetSummary(state.playerBoard)} · Враг ${fleetSummary(state.enemyBoard)}`],
    },
    statusBlock(state.status),
    boardTable({
      board: own ? state.playerBoard : state.enemyBoard,
      own,
      icons,
      ...(directCellCallback ? { directCellCallback } : {}),
    }),
    { type: "paragraph", text: [bold("Ваш флот: "), fleetDock(state.playerBoard, icons)] },
    ...(!own && state.turn === "player" ? gameRadar(state, "b") : []),
    { type: "divider" },
    { type: "buttons", buttons: viewButtons, align: "center" },
    {
      type: "buttons",
      buttons: [modeButton(state, "b"), callbackButton("🏳 Сдаться", `b:${state.revision}:q`, "danger")],
      align: "center",
    },
    legendBlock(icons),
    {
      type: "footer",
      text: own
        ? "Ваши корабли скрыты от соперника."
        : isRadar(state)
          ? "Радар 5×5 использует обычные Rich Message buttons — они надёжно нажимаются на iPhone."
          : "Прямые клетки работают на Android/Desktop; поддержка Apple зависит от Telegram.",
    },
  ]);
}

export function renderFinished(state: GameState, icons: BattleIconTheme = {}): InputRichMessage {
  const won = state.winner === "player";
  const board = won ? state.enemyBoard : state.playerBoard;
  return richMessage([
    { type: "heading", size: 2, text: won ? "🏆 Победа!" : "⚓ Игра окончена" },
    statusBlock(state.status),
    boardTable({ board, own: true, icons }),
    {
      type: "buttons",
      buttons: [callbackButton("🔄 Новая игра", "m:new", "success"), callbackButton("🏠 Меню", "m:home", "primary")],
      align: "center",
    },
  ]);
}

export function renderGame(state: GameState, icons: BattleIconTheme = {}): InputRichMessage {
  if (state.phase === "placing") return renderPlacement(state, icons);
  if (state.phase === "playing") return renderBattle(state, icons);
  return renderFinished(state, icons);
}

export function describeCell(coord: Coord): string {
  return formatCoord(coord);
}
