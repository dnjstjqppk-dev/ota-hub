/** #110: shared fake-D1 builder for lib/service unit tests (not a test file). */

export interface FakeHandlers {
  first?: (sql: string, params: unknown[]) => unknown;
  all?: (sql: string, params: unknown[]) => unknown[];
  run?: (sql: string, params: unknown[]) => { meta: { changes: number } };
}

export function fakeDb(handlers: FakeHandlers = {}): any {
  return {
    prepare: (sql: string) => {
      const bound = (...params: unknown[]) => ({
        first: async () => (handlers.first ? handlers.first(sql, params) : null),
        all: async () => ({ results: handlers.all ? handlers.all(sql, params) : [] }),
        run: async () => (handlers.run ? handlers.run(sql, params) : { meta: { changes: 0 } }),
      });
      // D1 allows terminal calls with no bind when the statement takes no params.
      return { bind: bound, first: () => bound().first(), all: () => bound().all(), run: () => bound().run() };
    },
  };
}

export function fakeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://test.local/", { headers });
}
