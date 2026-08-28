import assert from "node:assert/strict";
import test from "node:test";
import { fireAt, fleetIsComplete, parseCoordKey } from "../src/game/board";
import {
  autoPlacePlayer,
  createGame,
  manualPlace,
  playerShot,
  selectSector,
  setInteractionMode,
  startBattle,
} from "../src/game/engine";
import { randomFleet } from "../src/game/placement";
import type { BoardState } from "../src/game/types";
import { createMatch, joinMatch, matchShot, setReady } from "../src/pvp/engine";
import { renderMatch } from "../src/pvp/render";
import type { InputRichBlock, RichText } from "../src/telegram/types";
import { renderGame } from "../src/ui/render";

function seeded(seed = 123456789): () => number {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function assertShipsDoNotTouch(board: BoardState): void {
  for (let i = 0; i < board.ships.length; i += 1) {
    for (let j = i + 1; j < board.ships.length; j += 1) {
      for (const aKey of board.ships[i]!.cells) {
        const a = parseCoordKey(aKey);
        for (const bKey of board.ships[j]!.cells) {
          const b = parseCoordKey(bKey);
          assert.ok(
            Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1,
            `Ships ${i} and ${j} touch at ${aKey}/${bKey}`,
          );
        }
      }
    }
  }
}

function assertButtonLimits(blocks: ReturnType<typeof renderGame>["blocks"]): void {
  const visit = (items: InputRichBlock[]): void => {
    for (const block of items) {
      if (block.type === "buttons") assert.ok(block.buttons.length <= 8);
      if (block.type === "details") visit(block.blocks);
    }
  };
  visit(blocks);
}

function callbackDataFromRichText(text: RichText | undefined): string | undefined {
  if (!text || typeof text === "string") return undefined;
  if (Array.isArray(text)) {
    for (const part of text) {
      const value = callbackDataFromRichText(part);
      if (value) return value;
    }
    return undefined;
  }
  if (text.type === "button") return text.button.callback_data;
  if ("text" in text) return callbackDataFromRichText(text.text);
  return undefined;
}

function tableCallbacks(blocks: InputRichBlock[], contains: string): string[] {
  const table = blocks.find((block) => block.type === "table");
  assert.ok(table && table.type === "table");
  return table.cells
    .flatMap((row) => row)
    .map((cell) => callbackDataFromRichText(cell.text))
    .filter((value): value is string => Boolean(value?.includes(contains)));
}

function nestedButtonCallbacks(blocks: InputRichBlock[], contains: string): string[] {
  const values: string[] = [];
  const visit = (items: InputRichBlock[]): void => {
    for (const block of items) {
      if (block.type === "buttons") {
        for (const button of block.buttons) {
          if (button.callback_data?.includes(contains)) values.push(button.callback_data);
        }
      } else if (block.type === "details") {
        visit(block.blocks);
      }
    }
  };
  visit(blocks);
  return values;
}

test("random fleets are complete, non-overlapping and non-touching", () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const board = randomFleet(seeded(seed));
    assert.equal(fleetIsComplete(board), true);
    const cells = board.ships.flatMap((ship) => ship.cells);
    assert.equal(new Set(cells).size, 20);
    assertShipsDoNotTouch(board);
  }
});

test("repeat shot is rejected", () => {
  const board = randomFleet(seeded(42));
  const first = fireAt(board, { x: 0, y: 0 });
  assert.notEqual(first.kind, "repeat");
  const second = fireAt(board, { x: 0, y: 0 });
  assert.equal(second.kind, "repeat");
});

test("battle cannot start before full fleet", () => {
  const state = createGame(1, Date.now(), seeded(7));
  manualPlace(state, { x: 0, y: 0 });
  assert.equal(startBattle(state), false);
  assert.equal(state.phase, "placing");
});

test("direct Rich Text table controls are the default and radar remains a 5x5 fallback", () => {
  const state = createGame(2, Date.now(), seeded(8));
  autoPlacePlayer(state, seeded(9));
  assert.equal(startBattle(state), true);
  assert.equal(state.interactionMode, "direct");

  let rich = renderGame(state);
  const table = rich.blocks.find((block) => block.type === "table");
  assert.ok(table && table.type === "table");
  assert.equal(table.cells.length, 11);
  assert.ok(table.cells.every((row) => row.length === 11));
  assert.equal(tableCallbacks(rich.blocks, ":s:").length, 100);
  assertButtonLimits(rich.blocks);

  setInteractionMode(state, "radar");
  rich = renderGame(state);
  assert.equal(nestedButtonCallbacks(rich.blocks, ":g:").length, 4);

  selectSector(state, 0);
  rich = renderGame(state);
  assert.equal(nestedButtonCallbacks(rich.blocks, ":c:").length, 25);
  assertButtonLimits(rich.blocks);
});

test("direct mode embeds callback buttons in enemy table cells", () => {
  const state = createGame(3, Date.now(), seeded(10));
  autoPlacePlayer(state, seeded(11));
  assert.equal(startBattle(state), true);
  setInteractionMode(state, "direct");

  const rich = renderGame(state);
  assert.equal(tableCallbacks(rich.blocks, ":s:").length, 100);
});

test("network room starts when both players are ready and alternates turn after a miss", () => {
  const match = createMatch("ABCDEFGH", 10, "Host", Date.now(), seeded(20));
  assert.equal(joinMatch(match, 20, "Guest", seeded(21)), true);
  assert.equal(setReady(match, 10, true), true);
  assert.equal(setReady(match, 20, true), true);
  assert.equal(match.phase, "playing");
  assert.equal(match.turnUserId, 10);

  let miss: { x: number; y: number } | undefined;
  for (let y = 0; y < 10 && !miss; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      if (!match.guest!.board.ships.some((ship) => ship.cells.includes(`${x},${y}`))) {
        miss = { x, y };
        break;
      }
    }
  }
  assert.ok(miss);
  const result = matchShot(match, 10, miss);
  assert.equal(result?.kind, "miss");
  assert.equal(match.turnUserId, 20);
});

test("network match uses direct table shots and keeps fallback controls within button limits", () => {
  const match = createMatch("ABCDEFGH", 10, "Host", Date.now(), seeded(30));
  joinMatch(match, 20, "Guest", seeded(31));
  setReady(match, 10, true);
  setReady(match, 20, true);

  let rich = renderMatch(match, 10);
  assert.equal(tableCallbacks(rich.blocks, ":shot:").length, 100);
  assertButtonLimits(rich.blocks);

  match.host.selectedSector = 0;
  rich = renderMatch(match, 10);
  assert.equal(nestedButtonCallbacks(rich.blocks, ":shot:").length, 25);
  assertButtonLimits(rich.blocks);
});

test("seeded full games always terminate", () => {
  for (let game = 0; game < 25; game += 1) {
    const rng = seeded(1000 + game);
    const state = createGame(100 + game, Date.now(), rng);
    autoPlacePlayer(state, rng);
    assert.equal(startBattle(state), true);

    let guard = 0;
    while (state.phase === "playing" && guard < 500) {
      guard += 1;
      assert.equal(state.turn, "player");

      const unknown: Array<{ x: number; y: number }> = [];
      for (let y = 0; y < 10; y += 1) {
        for (let x = 0; x < 10; x += 1) {
          if (!state.enemyBoard.shots.includes(`${x},${y}`)) unknown.push({ x, y });
        }
      }

      assert.ok(unknown.length > 0);
      const shot = unknown[Math.floor(rng() * unknown.length)]!;
      playerShot(state, shot, rng);
    }

    assert.ok(guard < 500, "game exceeded safety guard");
    assert.equal(state.phase, "finished");
    assert.ok(state.winner === "player" || state.winner === "ai");
  }
});
