import type { Env } from "../env.ts";

/**
 * TG-07: portable database surface. D1 today, Postgres tomorrow (TG-09).
 *
 * Rule: new code talks to `Db`, never to `env.DB` directly. Migration
 * proceeds one module at a time behind this interface; see
 * docs/D1_TO_POSTGRES_MIGRATION.md. The first adopted module is analytics
 * (worker/src/lib/analytics.ts).
 */

export type DbValue = string | number | boolean | null | ArrayBuffer | ArrayBufferView;

export interface DbBound {
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ changes: number }>;
}

export interface DbStmt {
  bind(...values: DbValue[]): DbBound;
}

export interface Db {
  prepare(sql: string): DbStmt;
  batch(stmts: DbBound[]): Promise<Array<{ changes: number }>>;
}

class D1Bound implements DbBound {
  private readonly stmt: D1PreparedStatement;
  constructor(stmt: D1PreparedStatement) {
    this.stmt = stmt;
  }

  first<T>(): Promise<T | null> {
    return this.stmt.first<T>();
  }

  async all<T>(): Promise<{ results: T[] }> {
    const r = await this.stmt.all<T>();
    return { results: r.results ?? [] };
  }

  async run(): Promise<{ changes: number }> {
    const r = await this.stmt.run();
    return { changes: r.meta.changes ?? 0 };
  }

  get inner(): D1PreparedStatement {
    return this.stmt;
  }
}

class D1DatabaseAdapter implements Db {
  private readonly d1: D1Database;
  constructor(d1: D1Database) {
    this.d1 = d1;
  }

  prepare(sql: string): DbStmt {
    const stmt = this.d1.prepare(sql);
    return { bind: (...values: DbValue[]) => new D1Bound(stmt.bind(...values)) };
  }

  async batch(stmts: DbBound[]): Promise<Array<{ changes: number }>> {
    const inners = stmts.map((s) => {
      if (!(s instanceof D1Bound)) throw new Error("Db.batch accepts only statements from the same adapter");
      return s.inner;
    });
    const out = await this.d1.batch(inners);
    return out.map((r) => ({ changes: r.meta.changes ?? 0 }));
  }
}

/** Wrap the request's D1 binding in the portable interface. */
export function db(env: Env): Db {
  return new D1DatabaseAdapter(env.DB);
}
