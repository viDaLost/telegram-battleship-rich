import type { GameState } from "../game/types";

interface GameRow {
  state_json: string;
  revision: number;
}

export class GameRepository {
  constructor(private readonly db: D1Database) {}

  async get(userId: number): Promise<GameState | null> {
    const row = await this.db
      .prepare("SELECT state_json, revision FROM games WHERE user_id = ?")
      .bind(userId)
      .first<GameRow>();

    if (!row) return null;
    const state = JSON.parse(row.state_json) as GameState;
    state.revision = row.revision;
    return state;
  }

  async replace(userId: number, state: GameState): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO games (user_id, state_json, revision, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           state_json = excluded.state_json,
           revision = excluded.revision,
           updated_at = excluded.updated_at`,
      )
      .bind(userId, JSON.stringify(state), state.revision, state.updatedAt)
      .run();
  }

  async compareAndSet(userId: number, state: GameState, expectedRevision: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE games
         SET state_json = ?, revision = ?, updated_at = ?
         WHERE user_id = ? AND revision = ?`,
      )
      .bind(JSON.stringify(state), state.revision, state.updatedAt, userId, expectedRevision)
      .run();

    return (result.meta.changes ?? 0) === 1;
  }
}
