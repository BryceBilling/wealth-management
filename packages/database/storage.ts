import type { Envelope } from "./crypto";
export interface Storage {
  read(): Promise<Envelope | null>;
  write(e: Envelope): Promise<void>;
}
export class BrowserStorage implements Storage {
  private lastData: string | null = null;
  async db() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("tandem-vault", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("vault");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async read() {
    const db = await this.db();
    return new Promise<Envelope | null>((resolve, reject) => {
      const tx = db.transaction("vault");
      const req = tx.objectStore("vault").get("active");
      req.onsuccess = () => {
        this.lastData = req.result?.data ?? null;
        resolve(req.result ?? null);
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }
  async write(e: Envelope) {
    const db = await this.db();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("vault", "readwrite");
      const store = tx.objectStore("vault");
      const req = store.get("active");
      let stale = false;
      req.onsuccess = () => {
        if ((req.result?.data ?? null) !== this.lastData) {
          stale = true;
          tx.abort();
          return;
        }
        store.put(e, "active");
      };
      tx.oncomplete = () => {
        this.lastData = e.data;
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.onabort = () => {
        db.close();
        reject(
          stale
            ? new Error(
                "Another tab changed this vault. Reopen this tab before saving; your last action was not saved.",
              )
            : tx.error,
        );
      };
    });
  }
}
