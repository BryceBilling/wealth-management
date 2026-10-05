# Tandem architecture

Private, single-household application for exactly two members and multiple devices. React/TypeScript runs in a Tauri shell or an installable offline browser app. SQLite (sql.js/WASM) is the operational database. SQLite bytes are encrypted before atomic persistence to IndexedDB; no financial records are persisted as plaintext. Tauri bundles the same local assets. This avoids platform-specific SQLCipher builds while preserving SQLite queries and migrations. The unlocked database and key exist in memory only.

A dedicated integer/BigInt financial engine is independent of UI. User actions append immutable revision events. SQLite stores events and materialized record heads. Competing revisions remain explicit conflicts and are excluded from calculations until resolved. Resolution references all conflicting heads, preserving audit history.

Private Node/TypeScript/Fastify relay stores end-to-end encrypted events in PostgreSQL. Cursor-based push/pull is idempotent. Each member has a separately provisioned password and revocable device token. The household vault passphrase is separate from server credentials and never reaches the server. No public registration, telemetry or analytics. An optional direct HTTPS client requests Twelve Data quotes using a locally encrypted API key. It sends only the requested symbol/exchange and key, never balances or units. The relay also serves the production PWA assets, so phones can install and synchronize from one private HTTPS origin.

Build incrementally: schema and finance tests, encrypted repository and sync, UI, private server, end-to-end acceptance and failure tests. Platform-specific native biometrics and signed distributables require separate platform validation.
