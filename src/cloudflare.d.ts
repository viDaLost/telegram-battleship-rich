interface D1Meta {
  changes?: number;
}

interface D1Result<T = unknown> {
  results?: T[];
  meta: D1Meta;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
