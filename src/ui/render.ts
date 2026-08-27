import { fleetIsComplete, isShipSunk, remainingBySize, shipAt } from "../game/board";
import { formatCoord } from "../game/engine";
import { BOARD_SIZE, type BoardState, type Coord, type GameState } from "../game/types";
import type { InputRichBlock, InputRichMessage, RichBlockTableCell, RichMessageButton, RichText } from "../telegram/types";
import { bold, callbackButton, cell, disabledButton, inlineCallback, italic, richMessage, urlButton } from "./rich";

const COLS = ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И", "К"];

function chunkButtons(buttons: RichMessageButton[], size = 5): InputRichBlock[] {
  const blocks: InputRichBlock[] = [];
  for (let i = 0; i < buttons.length; i += size) {
    blocks.push({ type: "buttons", buttons: buttons.slice(i, i + size), align: "center" });
  }
  return blocks;
}

function boardTable(state: GameState, board: BoardState, own: boolean): InputRichBlock {
  const rows: RichBlockTableCell[][] = [];
  rows.push([cell("", true), ...COLS.map((label) => cell(bold(label), true))]);
  const shots = new Set(board.shots);

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    const row: RichBlockTableCell[] = [cell(bold(String(y + 1)), true)];
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const coord = { x, y };
      const key = `${x},${y}`;
      const ship = shipAt(board, coord);
      const wasShot = shots.has(key);

      let content: RichText;
      if (wasShot && ship) {
        content = isShipSunk(board, ship) ? "✹" : "✕";
      } else if (wasShot) {
        content = "•";
      } else if (own && ship) {
        content = "■";
      } else if (
        !own &&
        state.interactionMode === "direct" &&
        state.phase === "playing" &&
        state.turn === "player" &&
        state.view === "enemy"
      ) {
        content = inlineCallback("·", `b:${state.revision}:s:${x}:${y}`);
      } else {
        content = "·";
      }
      row.push(cell(content));
    }
    rows.push(row);
  }

  return {
    type: "table",
    cells: rows,
    is_bordered: true,
    is_compact: true,
  };
}

function placementTable(state: GameState): InputRichBlock {
  const rows: RichBlockTableCell[][] = [];
  rows.push([cell("", true), ...COLS.map((label) => cell(bold(label), true))]);

  for (let y = 0; y < BOARD_SIZE; y += 1) {
    const row: RichBlockTableCell[] = [cell(bold(String(y + 1)), true)];
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const coord = { x, y };
      const ship = shipAt(state.playerBoard, coord);
      const content = ship
        ? "■"
        : state.interactionMode === "direct"
          ? inlineCallback("·", `p:${state.revision}:c:${x}:${y}`)
          : "·";
      row.push(cell(content));
    }
    rows.push(row);
  }

  return {
    type: "table",
    cells: rows,
    is_bordered: true,
    is_compact: true,
  };
}

function statusBlock(text: string): InputRichBlock {
  return { type: "paragraph", text: ["⚓ ", bold(text)] };
}

function modeButton(state: GameState, phase: "p" | "b"): RichMessageButton {
  if (state.interactionMode === "picker") {
    return callbackButton("⚡ Прямые клетки (beta)", `${phase}:${state.revision}:m:d`, "link");
  }
  return callbackButton("📱 Совместимый режим", `${phase}:${state.revision}:m:p`, "primary");
}

function coordinatePicker(state: GameState, phase: "p" | "b"): InputRichBlock[] {
  if (state.interactionMode !== "picker") return [];

  if (state.selectedRow === undefined) {
    const rows = Array.from({ length: 10 }, (_, y) =>
      callbackButton(String(y + 1), `${phase}:${state.revision}:y:${y}`, "primary"),
    );
    return [
      { type: "paragraph", text: [bold("1. Выберите строку")] },
      ...chunkButtons(rows),
    ];
  }

  const y = state.selectedRow;
  const columns = COLS.map((label, x) => {
    if (phase === "b") {
      const alreadyShot = state.enemyBoard.shots.includes(`${x},${y}`);
      if (alreadyShot) return disabledButton(`${label} ✓`);
    }
    return callbackButton(label, `${phase}:${state.revision}:c:${x}:${y}`, "primary");
  });

  return [
    { type: "paragraph", text: [bold(`2. Строка ${y + 1} — выберите столбец`)] },
    ...chunkButtons(columns),
    {
      type: "buttons",
      buttons: [callbackButton("← Другая строка", `${phase}:${state.revision}:y:x`, "link")],
      align: "center",
    },
  ];
}


export function renderPrivateOnly(): InputRichMessage {
  return richMessage([
    { type: "heading", size: 3, text: "⚓ Морской бой" },
    {
      type: "paragraph",
      text: "Игровое поле и ваш флот доступны только в личном чате с ботом, чтобы состояние партии не смешивалось между участниками группы.",
    },
    {
      type: "buttons",
      buttons: [urlButton("🎮 Открыть @battles_hip_bot", "https://t.me/battles_hip_bot", "primary")],
      align: "center",
    },
  ]);
}

export function renderHome(hasActiveGame: boolean): InputRichMessage {
  const buttons = [callbackButton("🤖 Играть с ботом", "m:new", "primary")];
  if (hasActiveGame) buttons.push(callbackButton("▶️ Продолжить", "m:resume", "success"));
  buttons.push(callbackButton("📖 Правила", "m:rules", "link"));

  return richMessage([
    { type: "heading", size: 2, text: "⚓ Морской бой" },
    {
      type: "paragraph",
      text: "Классическая игра 10×10 прямо внутри сообщения Telegram — без Mini App.",
    },
    { type: "divider" },
    { type: "paragraph", text: [bold("Флот: "), "1×4, 2×3, 3×2 и 4×1. Корабли не касаются друг друга."] },
    { type: "buttons", buttons, align: "center" },
    { type: "footer", text: "Rich Messages · Bot API 10.3" },
  ]);
}

export function renderRules(): InputRichMessage {
  return richMessage([
    { type: "heading", size: 2, text: "📖 Правила" },
    { type: "paragraph", text: "Поле — 10×10. Каждый игрок имеет 10 кораблей." },
    {
      type: "paragraph",
      text: [
        bold("Состав флота: "),
        "1 четырёхпалубный, 2 трёхпалубных, 3 двухпалубных, 4 однопалубных.",
      ],
    },
    { type: "paragraph", text: "Корабли нельзя ставить вплотную — даже по диагонали." },
    { type: "paragraph", text: "Попадание даёт дополнительный выстрел. После промаха ход переходит сопернику." },
    { type: "paragraph", text: [bold("Обозначения: "), "■ корабль · неизвестно • мимо ✕ попадание ✹ потоплен"] },
    {
      type: "paragraph",
      text: "Совместимый режим использует двухшаговый выбор строки и столбца. Прямой режим позволяет нажимать клетки на поле, но зависит от поддержки клиента Telegram.",
    },
    { type: "buttons", buttons: [callbackButton("← Назад", "m:home", "primary")], align: "center" },
  ]);
}

export function renderPlacement(state: GameState): InputRichMessage {
  const remaining = remainingBySize(state.playerBoard);
  const sizeButtons = [4, 3, 2, 1].map((size) => {
    const left = remaining[size] ?? 0;
    if (left <= 0) return disabledButton(`${size} ✓`);
    const selected = state.selectedSize === size;
    return callbackButton(`${selected ? "●" : "○"} ${size}× (${left})`, `p:${state.revision}:z:${size}`, selected ? "success" : "primary");
  });

  const orientation = state.orientation === "H" ? "↔️ Горизонтально" : "↕️ Вертикально";
  const actionButtons = [
    callbackButton("🎲 Авто", `p:${state.revision}:a`, "primary"),
    callbackButton(orientation, `p:${state.revision}:r`, "link"),
    callbackButton("🧹 Очистить", `p:${state.revision}:x`, "danger"),
  ];

  const startButton = fleetIsComplete(state.playerBoard)
    ? callbackButton("⚔️ Начать бой", `p:${state.revision}:go`, "success")
    : disabledButton("⚔️ Сначала расставьте весь флот");

  return richMessage([
    { type: "heading", size: 3, text: "🚢 Расстановка флота" },
    statusBlock(state.status),
    {
      type: "paragraph",
      text: [
        "Выбран: ",
        bold(`${state.selectedSize}-палубный`),
        " · ",
        italic(state.orientation === "H" ? "горизонтально" : "вертикально"),
      ],
    },
    placementTable(state),
    { type: "buttons", buttons: sizeButtons, align: "center" },
    ...coordinatePicker(state, "p"),
    { type: "buttons", buttons: actionButtons, align: "center" },
    { type: "buttons", buttons: [modeButton(state, "p")], align: "center" },
    { type: "buttons", buttons: [startButton], align: "center" },
    { type: "buttons", buttons: [callbackButton("← Меню", "m:home", "link")], align: "center" },
  ]);
}

function fleetSummary(board: BoardState): string {
  const alive = board.ships.filter((ship) => !isShipSunk(board, ship)).length;
  return `${alive}/${board.ships.length}`;
}

export function renderBattle(state: GameState): InputRichMessage {
  const own = state.view === "own";
  const title = own ? "🚢 Ваш флот" : "🎯 Поле противника";
  const turnText = state.turn === "player" ? "Ваш ход" : "Ход противника";

  const buttons = [
    state.view === "enemy"
      ? disabledButton("🎯 Поле противника")
      : callbackButton("🎯 Поле противника", `b:${state.revision}:v:e`, "primary"),
    state.view === "own"
      ? disabledButton("🚢 Мой флот")
      : callbackButton("🚢 Мой флот", `b:${state.revision}:v:o`, "primary"),
    callbackButton("🏳 Сдаться", `b:${state.revision}:q`, "danger"),
  ];

  const picker = !own && state.turn === "player" ? coordinatePicker(state, "b") : [];

  return richMessage([
    { type: "heading", size: 3, text: title },
    {
      type: "paragraph",
      text: [
        bold(turnText),
        ` · Ваши корабли ${fleetSummary(state.playerBoard)} · Враг ${fleetSummary(state.enemyBoard)}`,
      ],
    },
    statusBlock(state.status),
    boardTable(state, own ? state.playerBoard : state.enemyBoard, own),
    ...picker,
    { type: "buttons", buttons, align: "center" },
    { type: "buttons", buttons: [modeButton(state, "b")], align: "center" },
    {
      type: "footer",
      text: own
        ? "Ваши корабли скрыты от противника."
        : state.interactionMode === "direct"
          ? "Нажмите на ·, чтобы выстрелить."
          : "Выберите строку, затем столбец.",
    },
  ]);
}

export function renderFinished(state: GameState): InputRichMessage {
  const won = state.winner === "player";
  const board = won ? state.enemyBoard : state.playerBoard;
  return richMessage([
    { type: "heading", size: 2, text: won ? "🏆 Победа!" : "⚓ Игра окончена" },
    statusBlock(state.status),
    boardTable(state, board, true),
    {
      type: "paragraph",
      text: won ? "Вы уничтожили весь флот противника." : "Можно сразу начать новую партию и взять реванш.",
    },
    {
      type: "buttons",
      buttons: [
        callbackButton("🔄 Новая игра", "m:new", "success"),
        callbackButton("🏠 Меню", "m:home", "primary"),
      ],
      align: "center",
    },
  ]);
}

export function renderGame(state: GameState): InputRichMessage {
  if (state.phase === "placing") return renderPlacement(state);
  if (state.phase === "playing") return renderBattle(state);
  return renderFinished(state);
}

export function describeCell(coord: Coord): string {
  return formatCoord(coord);
}
