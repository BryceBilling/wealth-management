import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import {
  schemas,
  validateEvent,
  type Event,
  type EntityType,
  type Row,
  type Data,
} from "../types";
let sql: SqlJsStatic;
export async function initSQL(wasm?: string) {
  sql ??= await initSqlJs(wasm ? { locateFile: () => wasm } : undefined);
  return sql;
}
export class Repository {
  db: Database;
  constructor(data?: Uint8Array) {
    if (!sql) throw Error("Initialize SQLite first");
    this.db = new sql.Database(data);
    const version = Number(
      this.db.exec("PRAGMA user_version")[0]?.values[0][0] ?? 0,
    );
    if (version > 1) throw Error("This vault needs a newer version of Tandem");
    this.db.run(
      `PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,record_id TEXT NOT NULL,type TEXT NOT NULL,created_at TEXT NOT NULL,body TEXT NOT NULL); CREATE INDEX IF NOT EXISTS events_record ON events(record_id); CREATE TABLE IF NOT EXISTS sync_queue(id TEXT PRIMARY KEY REFERENCES events(id), envelope TEXT); CREATE TABLE IF NOT EXISTS event_envelopes(id TEXT PRIMARY KEY REFERENCES events(id),envelope TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sync_state(id INTEGER PRIMARY KEY CHECK(id=1),cursor INTEGER NOT NULL DEFAULT 0); INSERT OR IGNORE INTO sync_state VALUES(1,0); PRAGMA user_version=1;`,
    );
  }
  events(): Event[] {
    return (
      this.db.exec("SELECT body FROM events ORDER BY created_at,id")[0]
        ?.values ?? []
    ).map((r) => validateEvent(JSON.parse(String(r[0]))));
  }
  heads(recordId: string) {
    const es = this.events().filter((e) => e.recordId === recordId);
    const parents = new Set(es.flatMap((e) => e.parents));
    return es.filter((e) => !parents.has(e.id));
  }
  conflicts() {
    return [...new Set(this.events().map((e) => e.recordId))]
      .map((id) => this.heads(id))
      .filter((h) => h.length > 1);
  }
  rows<K extends EntityType>(type: K): Row<K>[] {
    const events = this.events();
    const parents = new Set(events.flatMap((e) => e.parents));
    const groups = new Map<string, Event[]>();
    for (const e of events)
      if (e.type === type && !parents.has(e.id))
        groups.set(e.recordId, [...(groups.get(e.recordId) ?? []), e]);
    return [...groups.values()]
      .filter((h) => h.length === 1 && !h[0].deleted)
      .map(
        ([e]) =>
          ({ ...schemas[type].parse(e.data), id: e.recordId, type }) as Row<K>,
      );
  }
  get<K extends EntityType>(type: K, id: string) {
    return this.rows(type).find((r) => r.id === id);
  }
  append(e: Event, pending = false) {
    e = validateEvent(e);
    const existing = this.events().find((x) => x.id === e.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(e))
        throw Error("Event UUID collision");
      return;
    }
    for (const p of e.parents) {
      const parent = this.events().find((x) => x.id === p);
      if (parent && parent.recordId !== e.recordId)
        throw Error("Invalid parent record");
    }
    this.db.run("INSERT INTO events VALUES(?,?,?,?,?)", [
      e.id,
      e.recordId,
      e.type,
      e.createdAt,
      JSON.stringify(e),
    ]);
    if (pending) this.db.run("INSERT INTO sync_queue(id) VALUES(?)", [e.id]);
  }
  write<K extends EntityType>(
    type: K,
    data: Data[K],
    actor: string,
    device: string,
    id: string = crypto.randomUUID(),
    deleted = false,
    resolve = false,
  ) {
    const parsed = schemas[type].parse(data);
    const heads = this.heads(id);
    if (heads.length > 1 && !resolve)
      throw Error("Resolve the conflicting versions before editing");
    const e: Event = {
      id: crypto.randomUUID(),
      recordId: id,
      type,
      data: parsed,
      parents: heads.map((e) => e.id),
      actor,
      device,
      createdAt: new Date().toISOString(),
      deleted,
    };
    this.append(e, true);
    return e;
  }
  pending() {
    const ids = new Set(
      (this.db.exec("SELECT id FROM sync_queue")[0]?.values ?? []).map((r) =>
        String(r[0]),
      ),
    );
    return this.events().filter((e) => ids.has(e.id));
  }
  envelope(id: string) {
    const s = this.db.prepare(
      "SELECT envelope FROM event_envelopes WHERE id=?",
    );
    s.bind([id]);
    const r = s.step() ? s.get()[0] : null;
    s.free();
    return r ? JSON.parse(String(r)) : null;
  }
  setEnvelope(id: string, e: unknown) {
    this.db.run(
      "INSERT OR REPLACE INTO event_envelopes(id,envelope) VALUES(?,?)",
      [id, JSON.stringify(e)],
    );
  }
  acknowledge(ids: string[]) {
    for (const id of ids)
      this.db.run("DELETE FROM sync_queue WHERE id=?", [id]);
  }
  get cursor() {
    return Number(
      this.db.exec("SELECT cursor FROM sync_state WHERE id=1")[0].values[0][0],
    );
  }
  set cursor(n: number) {
    this.db.run("UPDATE sync_state SET cursor=? WHERE id=1", [n]);
  }
  meta<T>(key: string, fallback: T): T {
    const s = this.db.prepare("SELECT value FROM meta WHERE key=?");
    s.bind([key]);
    const value = s.step() ? s.get()[0] : null;
    s.free();
    return value ? JSON.parse(String(value)) : fallback;
  }
  setMeta(key: string, value: unknown) {
    this.db.run("INSERT OR REPLACE INTO meta VALUES(?,?)", [
      key,
      JSON.stringify(value),
    ]);
  }
  transaction<T>(fn: () => T) {
    this.db.run("BEGIN");
    try {
      const value = fn();
      this.db.run("COMMIT");
      return value;
    } catch (e) {
      this.db.run("ROLLBACK");
      throw e;
    }
  }
  export() {
    return this.db.export();
  }
  close() {
    this.db.close();
  }
}
