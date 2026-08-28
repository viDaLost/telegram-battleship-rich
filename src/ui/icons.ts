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

/**
 * Public Telegram custom_emoji_id values for the Battleship art pack.
 * They are safe to keep in source control (unlike the bot token) and make the
 * production bot use the artwork immediately without requiring a Worker secret.
 * SHIP_EMOJI_IDS, when present, can still override any of these IDs.
 */
const BUILTIN_THEME: BattleIconTheme = {
  ship_h_bow: "5226762289113244828",
  ship_h_mid: "5226766372587457513",
  ship_h_stern: "5226853187801099736",
  ship_v_bow: "5226699629835362107",
  ship_v_mid: "5226509281179773653",
  ship_v_stern: "5228896415412954427",
  ship_single: "5226452978453488322",
  water: "5226844438952715525",
  hit: "5226502271793145673",
  sunk: "5228726205859015322",
};

export function parseBattleIconTheme(raw?: string): BattleIconTheme {
  const result: BattleIconTheme = { ...BUILTIN_THEME };
  if (!raw) return result;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of Object.keys(FALLBACKS) as BattleIconKey[]) {
      const value = parsed[key];
      if (typeof value === "string" && /^\d+$/.test(value)) result[key] = value;
    }
  } catch {
    // Keep the known-good built-in pack when an optional override is malformed.
  }
  return result;
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
 * A Battleship vessel occupies several cells, unlike a chess piece. The custom
 * emoji pack contains separate bow/middle/stern tiles that form one vessel.
 *
 * Art-pack orientation:
 * - horizontal ships face RIGHT: stern = min X, bow = max X;
 * - vertical ships face UP: bow = min Y, stern = max Y.
 */
export function shipCellIcon(theme: BattleIconTheme, ship: Ship, coord: Coord): RichText {
  if (ship.size === 1) return battleIcon(theme, "ship_single");

  const cells = ship.cells.map(parseCoordKey);
  const horizontal = cells.every((cell) => cell.y === cells[0]?.y);
  const sorted = [...cells].sort(horizontal ? (a, b) => a.x - b.x : (a, b) => a.y - b.y);
  const index = sorted.findIndex((cell) => cell.x === coord.x && cell.y === coord.y);

  let part: "bow" | "mid" | "stern";
  if (horizontal) {
    // The horizontal artwork points right: leftmost is stern, rightmost is bow.
    part = index <= 0 ? "stern" : index >= sorted.length - 1 ? "bow" : "mid";
  } else {
    // The vertical artwork points up: topmost is bow, bottommost is stern.
    part = index <= 0 ? "bow" : index >= sorted.length - 1 ? "stern" : "mid";
  }

  return battleIcon(theme, `${horizontal ? "ship_h" : "ship_v"}_${part}` as BattleIconKey);
}
