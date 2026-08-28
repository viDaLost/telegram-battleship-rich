import type { MatchState } from "./types";

interface MatchRow {
  state_json: string;
  revision: number;
}

interface MemberRow {
  match_code: string;
}

export class MatchRepository {
  constructor(private readonly db: D1Database) {}

  async get(code: string): Promise<MatchState | null> {
    const row = await this.db
      .prepare("SELECT state_json, revision FROM pvp_matches WHERE code = ?")
      .bind(code)
      .first<MatchRow>();
    if (!row) return null;
    const state = JSON.parse(row.state_json) as MatchState;
    state.revision = row.revision;
    return state;
  }

  async getByUser(userId: number): Promise<MatchState | null> {
    const member = await this.db
      .prepare("SELECT match_code FROM pvp_members WHERE user_id = ?")
      .bind(userId)
      .first<MemberRow>();
    if (!member) return null;
    const match = await this.get(member.match_code);
    if (!match || match.phase === "finished") return match;
    return match;
  }

  async create(state: MatchState): Promise<void> {
    await this.db
      .prepare("INSERT INTO pvp_matches (code, state_json, revision, updated_at) VALUES (?, ?, ?, ?)")
      .bind(state.code, JSON.stringify(state), state.revision, state.updatedAt)
      .run();
    await this.linkMember(state.host.userId, state.code, state.updatedAt);
  }

  async linkMember(userId: number, code: string, updatedAt: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO pvp_members (user_id, match_code, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET match_code = excluded.match_code, updated_at = excluded.updated_at`,
      )
      .bind(userId, code, updatedAt)
      .run();
  }

  async compareAndSet(state: MatchState, expectedRevision: number): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE pvp_matches
         SET state_json = ?, revision = ?, updated_at = ?
         WHERE code = ? AND revision = ?`,
      )
      .bind(JSON.stringify(state), state.revision, state.updatedAt, state.code, expectedRevision)
      .run();
    return (result.meta.changes ?? 0) === 1;
  }
}
