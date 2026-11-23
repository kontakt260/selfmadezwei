// Kleiner In-Memory-Ersatz für den Supabase-Client in Unit-Tests.
//
// Unterstützt genau die Aufrufketten, die serverseitiger Code im Projekt
// benutzt: select/insert/update/delete mit eq/is/lt-Filtern, order, limit,
// single/maybeSingle. Eindeutigkeit lässt sich pro Tabelle angeben — ein
// Verstoß liefert wie Postgres den Fehlercode 23505.

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string; code?: string } | null };

export type FakeDb = Record<string, Row[]>;

export type FakeSupabaseOptions = {
  /** Spalten, die pro Tabelle eindeutig sein müssen. */
  unique?: Record<string, string[]>;
  /** Fehler für einen bestimmten Schreibvorgang erzwingen. */
  failOn?: (op: "insert" | "update" | "delete", table: string, row: Row | null) => string | null;
};

type Filter = { column: string; test: (value: unknown) => boolean };

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private returning = false;
  private max: number | null = null;
  private sort: { column: string; ascending: boolean } | null = null;

  constructor(
    private db: FakeDb,
    private options: FakeSupabaseOptions,
    private table: string,
    private op: "select" | "insert" | "update" | "delete",
    private payload: Row | Row[] | null,
  ) {}

  select(_columns?: string) {
    this.returning = true;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ column, test: (v) => v === value });
    return this;
  }
  is(column: string, value: null) {
    this.filters.push({ column, test: (v) => (v ?? null) === value });
    return this;
  }
  lt(column: string, value: string) {
    this.filters.push({ column, test: (v) => typeof v === "string" && v < value });
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.sort = { column, ascending: opts?.ascending ?? true };
    return this;
  }
  limit(count: number) {
    this.max = count;
    return this;
  }

  async maybeSingle(): Promise<Result> {
    const res = this.run();
    if (res.error) return res;
    const rows = res.data as Row[];
    return { data: rows[0] ?? null, error: null };
  }
  async single(): Promise<Result> {
    const res = this.run();
    if (res.error) return res;
    const rows = res.data as Row[];
    if (rows.length !== 1) return { data: null, error: { message: "expected exactly one row" } };
    return { data: rows[0], error: null };
  }
  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    const res = this.run();
    return Promise.resolve(
      this.returning || this.op === "select" ? res : { data: null, error: res.error },
    ).then(onFulfilled, onRejected);
  }

  private rows(): Row[] {
    if (!this.db[this.table]) this.db[this.table] = [];
    return this.db[this.table];
  }
  private matches(row: Row): boolean {
    return this.filters.every((f) => f.test(row[f.column]));
  }

  private executed: Result | null = null;
  private run(): Result {
    // Eine Kette darf nur einmal wirken, auch wenn sie mehrfach
    // „abgeholt" wird.
    if (!this.executed) this.executed = this.execute();
    return this.executed;
  }

  private execute(): Result {
    const table = this.rows();
    const fail = (row: Row | null) =>
      this.op === "select" ? null : (this.options.failOn?.(this.op, this.table, row) ?? null);

    if (this.op === "insert") {
      const inserted: Row[] = [];
      for (const raw of Array.isArray(this.payload) ? this.payload : [this.payload ?? {}]) {
        const message = fail(raw);
        if (message) return { data: null, error: { message } };
        for (const column of this.options.unique?.[this.table] ?? []) {
          if (table.some((r) => r[column] === raw[column])) {
            return {
              data: null,
              error: { code: "23505", message: `duplicate key value (${this.table}.${column})` },
            };
          }
        }
        const row = { id: `${this.table}-${table.length + 1}`, ...raw };
        table.push(row);
        inserted.push(row);
      }
      return { data: inserted, error: null };
    }

    if (this.op === "update") {
      const message = fail(this.payload as Row);
      if (message) return { data: null, error: { message } };
      const updated = table.filter((r) => this.matches(r));
      for (const row of updated) Object.assign(row, this.payload);
      return { data: updated, error: null };
    }

    if (this.op === "delete") {
      const message = fail(null);
      if (message) return { data: null, error: { message } };
      const removed = table.filter((r) => this.matches(r));
      this.db[this.table] = table.filter((r) => !this.matches(r));
      return { data: removed, error: null };
    }

    let found = table.filter((r) => this.matches(r));
    if (this.sort) {
      const { column, ascending } = this.sort;
      found = [...found].sort((a, b) => {
        const cmp = String(a[column] ?? "").localeCompare(String(b[column] ?? ""));
        return ascending ? cmp : -cmp;
      });
    }
    if (this.max !== null) found = found.slice(0, this.max);
    return { data: found, error: null };
  }
}

export function createFakeSupabase(db: FakeDb, options: FakeSupabaseOptions = {}) {
  return {
    from(table: string) {
      return {
        select: (columns?: string) => new Query(db, options, table, "select", null).select(columns),
        insert: (payload: Row | Row[]) => new Query(db, options, table, "insert", payload),
        update: (payload: Row) => new Query(db, options, table, "update", payload),
        delete: () => new Query(db, options, table, "delete", null),
      };
    },
  };
}
