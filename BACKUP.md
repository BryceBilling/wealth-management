# Backups

Export downloads a versioned authenticated encrypted SQLite snapshot. Restore first authenticates/decrypts, validates schema and household identity, then merges immutable events (non-destructive). Existing and restored revisions are both retained; conflicts require explicit resolution. Before importing, export a safety snapshot automatically. Pairing an empty device imports the household and asks which member is using the device. Passphrase is required; no recovery backdoor.

The server backup job archives PostgreSQL with pg_dump and encrypts it with age to an operator-supplied public recipient. Retain daily (7), weekly (4), monthly (12) snapshots and test restore on a separate database. Never place encryption private keys in the database or repository. Client backup round-trip and corruption rejection are automated test requirements.

## Restore a PostgreSQL archive

Decrypt on a trusted machine with age installed, restore into a new empty test database first, and verify counts before switching the relay connection. Never overwrite the live database as the first restore step.

```sh
age -d -i /secure/offline-key.txt -o /private/tmp/tandem-restore.dump daily-backup.dump.age
createdb tandem_restore_test
pg_restore --no-owner --no-acl -d tandem_restore_test /private/tmp/tandem-restore.dump
psql tandem_restore_test -c 'SELECT count(*) FROM events; SELECT count(*) FROM members;'
```

Use restricted temporary storage and remove the decrypted dump after verification. Financial envelopes inside the dump remain end-to-end encrypted, but account hashes/device metadata are sensitive. The Docker backup scheduler requires a running Docker engine and age recipient; the browser/client encrypted restore and PostgreSQL relay backup round trips are tested separately. The container scheduler has not been executed on this host because Docker Desktop is absent.
