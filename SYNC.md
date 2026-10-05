# Synchronization

Local writes atomically append an event and queue entry, then encrypt/persist before acknowledging success. Events contain UUIDs, parent revisions, user/device UUIDs, and timestamps. Push uploads encrypted queued events. The relay enforces unique event UUIDs and rejects different ciphertext for an existing UUID. Pull reads by monotonically increasing cursor. Remote events merge by UUID. Cursor and queue acknowledgement persist together with events. Retry after interruption is safe.

Two independent creations both survive. Concurrent edits of one record preserve all heads and flag a conflict. No last-write-wins for finances. Resolve in Settings by selecting a version; the resulting event references all heads. Unresolved records are withheld from balances with a visible warning. Device revocation denies later synchronization but cannot erase already downloaded data.

Pair another device by restoring the encrypted household backup using the household vault passphrase, then log into the private relay with that member's server credentials. The new installation retains its own device ID. Household keys never transit the relay. HTTPS is mandatory outside localhost. Automatically retry while unlocked and online, with a manual Sync action as well.
