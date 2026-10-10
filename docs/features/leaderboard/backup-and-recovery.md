# Backups & Recovery

> **Module**: `backend/src/leaderboard.rs` and `backend/src/engine.rs`  
> **Key Types**: `BackupRun`, `Leaderboard::export_backup`  
> **Related Documents**: [Leaderboard Overview](README.md), [Operator Runbook](../venue-operations/operator-runbook.md)  
> **Maintenance Status**: Active / Operational Continuity  

---

## 1. Hourly JSON backups

Events run all day. To protect the board against a dead battery, a crash or a mistake:

- Every hour (`BACKUP_INTERVAL` in `engine.rs`), the engine thread calls `export_backup()`.
- It writes every stored run to a human-readable JSON file: `[{ "id": 1, "name": "Ana", "mode": "sprint", "reps": 21 }, …]`.
- Files go to a `backups` folder next to the database, named with the time in milliseconds since 1970:
  `<app data>/backups/runs-1791640800000.json`

---

## 2. Backup now

On the Leaderboard screen (**L** on Home), press **B** (or click "Backup file"). The app calls `export_backup` and shows "Backup written to …" with the full path.

---

## 3. Recovery

The database is `pump-court.sqlite3` in the app data folder:

- **Windows**: `%APPDATA%\com.pumpcourt.app\`
- **macOS**: `~/Library/Application Support/com.pumpcourt.app/`
- **Linux**: `~/.local/share/com.pumpcourt.app/`

If it is lost or damaged:
1. Quit the app.
2. Move the damaged `pump-court.sqlite3` (and any `-wal` / `-shm` files next to it) somewhere safe.
3. Start the app once to create an empty database, then quit it again.
4. Load the newest `backups/runs-*.json` back in, for example with Python:
   ```python
   import json, sqlite3
   rows = json.load(open("runs-1791640800000.json"))
   db = sqlite3.connect("pump-court.sqlite3")
   db.executemany("INSERT INTO runs (id, name, mode, reps) VALUES (:id, :name, :mode, :reps)", rows)
   db.commit()
   ```

An old database from before the current layout is never lost either: its table is kept as `runs_v1` (see [Leaderboard Overview](README.md#3-migration-from-the-old-layout)).
