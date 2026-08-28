import { handleUpdate } from "./bot/router";
import { MatchRepository } from "./pvp/repository";
import { GameRepository } from "./storage/game-repository";
import { TelegramApi } from "./telegram/api";
import type { Update } from "./telegram/types";
import { parseBattleIconTheme } from "./ui/icons";

interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  SHIP_EMOJI_IDS?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "telegram-battleship-rich" });
    if (request.method !== "POST" || url.pathname !== "/telegram/webhook") return new Response("Not found", { status: 404 });
    if (!env.WEBHOOK_SECRET || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });

    let update: Update;
    try { update = (await request.json()) as Update; }
    catch { return new Response("Bad request", { status: 400 }); }

    try {
      await handleUpdate(
        new TelegramApi(env.BOT_TOKEN),
        new GameRepository(env.DB),
        new MatchRepository(env.DB),
        update,
        parseBattleIconTheme(env.SHIP_EMOJI_IDS),
      );
      return json({ ok: true });
    } catch (error) {
      console.error("Update processing failed", error);
      return json({ ok: false, error: "update_processing_failed" }, 500);
    }
  },
};
