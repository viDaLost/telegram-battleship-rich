import { parseCoordKey } from "../game/board";
import type { Coord, Ship } from "../game/types";
import type { RichText } from "../telegram/types";
import { customEmoji } from "./rich";

export type BattleIconKey =
  | "ship4"
  | "ship3"
  | "ship2"
  | "ship1"
  | "ship_h_bow"
  | "ship_h_mid"
  | "ship_h_stern"
  | "ship_v_bow"
  | "ship_v_mid"
  | "ship_v_stern"
  | "ship_single"
  | "water"
  | "miss"
  | "hit"
  | "sunk";

export type BattleIconTheme = Partial<Record<BattleIconKey, string>>;

const FALLBACKS: Record<BattleIconKey, string> = {
  ship4: "▰",
  ship3: "▰",
  ship2: "▰",
  ship1: "◆",
  ship_h_bow: "▰",
  ship_h_mid: "▰",
  ship_h_stern: "▰",
  ship_v_bow: "▰",
  ship_v_mid: "▰",
  ship_v_stern: "▰",
  ship_single: "◆",
  water: "·",
  miss: "•",
  hit: "✕",
  sunk: "✹",
};

export function parseBattleIconTheme(raw?: string): BattleIconTheme {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: BattleIconTheme = {};
    for (const key of Object.keys(FALLBACKS) as BattleIconKey[]) {
      const value = parsed[key];
      if (typeof value === "string" && /^\d+$/.test(value)) result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export function battleIcon(theme: BattleIconTheme, key: BattleIconKey): RichText {
  const fallback = FALLBACKS[key];
  const id = theme[key];
  return id ? customEmoji(id, fallback) : fallback;
}

export function shipIcon(theme: BattleIconTheme, size: number): RichText {
  const key = (`ship${Math.max(1, Math.min(4, size))}`) as BattleIconKey;
  return battleIcon(theme, key);
}

/**
 * A Battleship vessel occupies several cells, unlike a chess piece. To make a
 * custom-emoji ship look continuous, the theme can provide separate bow/middle/
 * stern glyphs for horizontal and vertical orientation.
 */
export function shipCellIcon(theme: BattleIconTheme, ship: Ship, coord: Coord): RichText {
  if (ship.size === 1) return battleIcon(theme, "ship_single");

  const cells = ship.cells.map(parseCoordKey);
  const horizontal = cells.every((cell) => cell.y === cells[0]?.y);
  const sorted = [...cells].sort(horizontal ? (a, b) => a.x - b.x : (a, b) => a.y - b.y);
  const index = sorted.findIndex((cell) => cell.x === coord.x && cell.y === coord.y);
  const part = index <= 0 ? "bow" : index >= sorted.length - 1 ? "stern" : "mid";
  return battleIcon(theme, `${horizontal ? "ship_h" : "ship_v"}_${part}` as BattleIconKey);
}
