import { isShipSunk, shipAt } from "../game/board";
import { BOARD_SIZE, type BoardState } from "../game/types";
import type { InputRichBlock, RichBlockTableCell, RichMessageButton, RichText } from "../telegram/types";
import type { BattleIconTheme } from "./icons";
import { battleIcon, shipCellIcon, shipIcon } from "./icons";
import { bold, callbackButton, cell, disabledButton, inlineCallback } from "./rich";

export const COLS = ["А", "Б", "В", "Г", "Д", "Е", "Ж", "З", "И", "К"] as const;

export interface BoardTableOptions {
  board: BoardState;
  own: boolean;
  icons?: BattleIconTheme;
  directCellCallback?: (x: number, y: number) => string;
}

export function boardTable({ board, own, icons = {}, directCellCallback }: BoardTableOptions): InputRichBlock {
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
        content = battleIcon(icons, isShipSunk(board, ship) ? "sunk" : "hit");
      } else if (wasShot) {
        content = battleIcon(icons, "miss");
      } else if (own && ship) {
        content = shipCellIcon(icons, ship, coord);
      } else if (directCellCallback) {
        content = inlineCallback(battleIcon(icons, "water"), directCellCallback(x, y));
      } else {
        content = battleIcon(icons, "water");
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
    caption: own ? "Ваши корабли" : "Радар противника",
  };
}

export function fleetSummary(board: BoardState): string {
  const alive = board.ships.filter((ship) => !isShipSunk(board, ship)).length;
  return `${alive}/${board.ships.length}`;
}

export function fleetDock(board: BoardState, icons: BattleIconTheme = {}): RichText {
  const expected: Record<number, number> = { 4: 1, 3: 2, 2: 3, 1: 4 };
  const result: RichText[] = [];
  for (const size of [4, 3, 2, 1]) {
    const ships = board.ships.filter((ship) => ship.size === size);
    const alive = ships.filter((ship) => !isShipSunk(board, ship)).length;
    if (result.length) result.push("   ");
    result.push(shipIcon(icons, size), ` ${alive}/${ships.length || expected[size]}`);
  }
  return result;
}


const SECTORS = [
  { x0: 0, y0: 0, label: "↖ А–Д · 1–5", short: "А–Д / 1–5" },
  { x0: 5, y0: 0, label: "↗ Е–К · 1–5", short: "Е–К / 1–5" },
  { x0: 0, y0: 5, label: "↙ А–Д · 6–10", short: "А–Д / 6–10" },
  { x0: 5, y0: 5, label: "↘ Е–К · 6–10", short: "Е–К / 6–10" },
] as const;

export interface RadarPickerOptions {
  selectedSector?: number | undefined;
  isDisabled?: (x: number, y: number) => boolean;
  sectorCallback: (sector: number) => string;
  cellCallback: (x: number, y: number) => string;
  backCallback: string;
  title?: string;
}

export function radarPicker(options: RadarPickerOptions): InputRichBlock[] {
  const { selectedSector, isDisabled, sectorCallback, cellCallback, backCallback } = options;
  if (selectedSector === undefined || !SECTORS[selectedSector]) {
    return [
      { type: "paragraph", text: [bold(options.title ?? "🎯 Быстрый прицел"), " · выберите четверть поля"] },
      {
        type: "buttons",
        buttons: [0, 1].map((sector) => callbackButton(SECTORS[sector]!.label, sectorCallback(sector), "primary")),
        align: "center",
      },
      {
        type: "buttons",
        buttons: [2, 3].map((sector) => callbackButton(SECTORS[sector]!.label, sectorCallback(sector), "primary")),
        align: "center",
      },
    ];
  }

  const sector = SECTORS[selectedSector];
  const blocks: InputRichBlock[] = [
    { type: "paragraph", text: [bold(`🎯 Сектор ${sector.short}`), " · нажмите координату"] },
  ];

  for (let y = sector.y0; y < sector.y0 + 5; y += 1) {
    const buttons: RichMessageButton[] = [];
    for (let x = sector.x0; x < sector.x0 + 5; x += 1) {
      const label = `${COLS[x]}${y + 1}`;
      buttons.push(isDisabled?.(x, y) ? disabledButton(`${label} ✓`) : callbackButton(label, cellCallback(x, y), "primary"));
    }
    blocks.push({ type: "buttons", buttons, align: "center" });
  }

  blocks.push({
    type: "buttons",
    buttons: [callbackButton("← Все сектора", backCallback, "link")],
    align: "center",
  });
  return blocks;
}

export function legendBlock(icons: BattleIconTheme = {}): InputRichBlock {
  return {
    type: "details",
    summary: "ℹ️ Обозначения поля",
    blocks: [
      {
        type: "paragraph",
        text: [
          battleIcon(icons, "water"),
          " неизвестно   ",
          battleIcon(icons, "miss"),
          " мимо   ",
          battleIcon(icons, "hit"),
          " попадание   ",
          battleIcon(icons, "sunk"),
          " потоплен   ",
          shipIcon(icons, 2),
          " корабль",
        ],
      },
    ],
  };
}
