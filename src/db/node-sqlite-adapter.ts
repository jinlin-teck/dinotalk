import { DatabaseSync } from "node:sqlite";

interface NodeSqliteStatement {
  run: (...params: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  setReturnArrays?: (enabled: boolean) => void;
}

function normalizeParams(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    return p;
  });
}

function toPlainObjectRow(row: unknown): unknown {
  if (row && typeof row === "object" && !Array.isArray(row)) {
    return { ...(row as Record<string, unknown>) };
  }
  return row;
}

export interface BetterSqliteCompatClient {
  exec: (sql: string) => void;
  pragma: (pragmaClause: string) => void;
  close: () => void;
  prepare: (sqlText: string) => {
    run: (...params: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
    raw: () => {
      get: (...params: unknown[]) => unknown;
      all: (...params: unknown[]) => unknown[];
    };
  };
  transaction: <TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult
  ) => ((...args: TArgs) => TResult) & {
    deferred: (...args: TArgs) => TResult;
    immediate: (...args: TArgs) => TResult;
    exclusive: (...args: TArgs) => TResult;
  };
}

export function createBetterSqliteCompatClient(dbPath: string): BetterSqliteCompatClient {
  const db = new DatabaseSync(dbPath);

  const runInTx = <TArgs extends unknown[], TResult>(
    mode: "DEFERRED" | "IMMEDIATE" | "EXCLUSIVE",
    fn: (...args: TArgs) => TResult
  ) => {
    return (...args: TArgs): TResult => {
      db.exec(`BEGIN ${mode}`);
      try {
        const result = fn(...args);
        db.exec("COMMIT");
        return result;
      } catch (err) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // ignore rollback error if transaction already closed
        }
        throw err;
      }
    };
  };

  return {
    exec(sql: string) {
      db.exec(sql);
    },
    pragma(pragmaClause: string) {
      db.exec(`PRAGMA ${pragmaClause}`);
    },
    close() {
      db.close();
    },
    prepare(sqlText: string) {
      const stmt = db.prepare(sqlText) as unknown as NodeSqliteStatement;
      return {
        run(...params: unknown[]) {
          return stmt.run(...(normalizeParams(params) as never[]));
        },
        get(...params: unknown[]) {
          stmt.setReturnArrays?.(false);
          return toPlainObjectRow(stmt.get(...(normalizeParams(params) as never[])));
        },
        all(...params: unknown[]) {
          stmt.setReturnArrays?.(false);
          return stmt.all(...(normalizeParams(params) as never[])).map(toPlainObjectRow);
        },
        raw() {
          return {
            get(...params: unknown[]) {
              stmt.setReturnArrays?.(true);
              return stmt.get(...(normalizeParams(params) as never[]));
            },
            all(...params: unknown[]) {
              stmt.setReturnArrays?.(true);
              return stmt.all(...(normalizeParams(params) as never[]));
            },
          };
        },
      };
    },
    transaction<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult) {
      const deferred = runInTx("DEFERRED", fn);
      const wrapper = ((...args: TArgs) => deferred(...args)) as ((...args: TArgs) => TResult) & {
        deferred: (...args: TArgs) => TResult;
        immediate: (...args: TArgs) => TResult;
        exclusive: (...args: TArgs) => TResult;
      };
      wrapper.deferred = deferred;
      wrapper.immediate = runInTx("IMMEDIATE", fn);
      wrapper.exclusive = runInTx("EXCLUSIVE", fn);
      return wrapper;
    },
  };
}
