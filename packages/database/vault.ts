import { Repository } from "./repository";
import {
  derive,
  decrypt,
  encrypt,
  randomSalt,
  sealJSON,
  type Envelope,
} from "./crypto";
import type { Storage } from "./storage";
export class Vault {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(
    public repo: Repository,
    public key: CryptoKey,
    public salt: string,
    public storage: Storage,
  ) {}
  static async create(passphrase: string, storage: Storage) {
    const salt = randomSalt();
    return new Vault(
      new Repository(),
      await derive(passphrase, salt),
      salt,
      storage,
    );
  }
  static async unlock(passphrase: string, storage: Storage) {
    const e = await storage.read();
    if (!e) throw Error("No vault exists");
    const key = await derive(passphrase, e.salt);
    return new Vault(
      new Repository(await decrypt(e, key)),
      key,
      e.salt,
      storage,
    );
  }
  async persist() {
    await this.storage.write(await this.backup());
  }
  async backup() {
    return encrypt(this.repo.export(), this.key, this.salt);
  }
  async mutate<T>(fn: (r: Repository) => T | Promise<T>): Promise<T> {
    const operation = this.chain.then(async () => {
      const before = this.repo.export();
      try {
        const result = await fn(this.repo);
        for (const event of this.repo.pending())
          if (!this.repo.envelope(event.id))
            this.repo.setEnvelope(
              event.id,
              await sealJSON(event, this.key, this.salt),
            );
        await this.persist();
        return result;
      } catch (e) {
        this.repo.close();
        this.repo = new Repository(before);
        throw e;
      }
    });
    this.chain = operation.catch(() => {});
    return operation;
  }
  async restore(e: Envelope, passphrase: string) {
    const key = await derive(passphrase, e.salt);
    const incoming = new Repository(await decrypt(e, key));
    const previousKey = this.key,
      previousSalt = this.salt;
    try {
      const users = incoming.rows("household");
      if (users.length !== 1)
        throw Error("Backup must contain exactly one household");
      const existing = this.repo.rows("household")[0];
      if (existing && existing.id !== users[0].id)
        throw Error("This backup belongs to a different household");
      if (!existing) {
        this.key = key;
        this.salt = e.salt;
      }
      await this.mutate((repo) => {
        for (const event of incoming.events()) {
          repo.append(event, true);
          const envelope = incoming.envelope(event.id);
          if (envelope && e.salt === this.salt)
            repo.setEnvelope(event.id, envelope);
        }
      });
    } catch (error) {
      this.key = previousKey;
      this.salt = previousSalt;
      throw error;
    } finally {
      incoming.close();
    }
  }
}
