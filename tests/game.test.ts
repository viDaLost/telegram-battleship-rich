import assert from "node:assert/strict";
import test from "node:test";
import { fireAt, fleetIsComplete, parseCoordKey } from "../src/game/board";
import {
  autoPlacePlayer,
  createGame,
  manualPlace,
  playerShot,
  setInteractionMode,
  startBattle,
} from "../src/game/engine";
import { randomFleet } from "../src/game/placement";
import type { BoardState } from "../src/game/types";
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

test("compatible mode renders a 10x10 board and button rows within Telegram limits", () => {
  const state = createGame(2, Date.now(), seeded(8));
  autoPlacePlayer(state, seeded(9));
  assert.equal(startBattle(state), true);
  assert.equal(state.interactionMode, "picker");

  const rich = renderGame(state);
  const table = rich.blocks.find((block) => block.type === "table");
  assert.ok(table && table.type === "table");
  assert.equal(table.cells.length, 11); // header + 10 rows
  assert.ok(table.cells.every((row) => row.length === 11)); // row header + 10 columns

  const buttonRows = rich.blocks.filter((block) => block.type === "buttons");
  assert.ok(buttonRows.length > 0);
  assert.ok(buttonRows.every((block) => block.type === "buttons" && block.buttons.length <= 8));
});

test("direct mode embeds callback buttons in enemy table cells", () => {
  const state = createGame(3, Date.now(), seeded(10));
  autoPlacePlayer(state, seeded(11));
  assert.equal(startBattle(state), true);
  setInteractionMode(state, "direct");

  const rich = renderGame(state);
  const table = rich.blocks.find((block) => block.type === "table");
  assert.ok(table && table.type === "table");

  const hasInlineButton = table.cells.some((row) =>
    row.some((cell) => {
      const text = cell.text;
      return typeof text === "object" && !Array.isArray(text) && text?.type === "button";
    }),
  );
  assert.equal(hasInlineButton, true);
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
