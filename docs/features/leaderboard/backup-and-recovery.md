# Automated Backups & Disaster Recovery

> **Module**: `backend/src/leaderboard.rs` and `backend/src/engine.rs`  
> **Key Types**: `BackupRun`, `Leaderboard::export_backup`  
> **Related Documents**: [Leaderboard Overview](README.md), [Operator Runbook](../venue-operations/operator-runbook.md)  
> **Maintenance Status**: Active / Operational Continuity  

---

## 1. Automated Hourly JSON Snapshots

Live events run for 8–12 hours continuously. To protect tournament results against accidental laptop battery death, accidental OS restarts, or operator errors:

- Every 60 minutes (`BACKUP_INTERVAL = 3600s`), the background `pump-court-engine` thread automatically calls `db.export_backup()`.
- The snapshot exports every run into an unencrypted, human-readable JSON array.
- Files are saved with ISO timestamps:
  `app_data_dir/backups/pump_court_backup_2026-10-10_14-00-00.json`

---

## 2. Manual Backup Export

Operators can trigger a backup at any time from the Leaderboard screen:
- Press **L** to open the Leaderboard.
- Click **Export Backup**.
- Tauri invokes `commands::export_backup()`, creating an instant snapshot and returning the absolute path to the file.

---

## 3. Disaster Recovery Protocol

If the SQLite database file (`pump_court.db`) is corrupted or deleted:
1. Locate the latest JSON backup file in the app data folder:
   - **macOS**: `~/Library/Application Support/com.pumpcourt.app/backups/`
   - **Linux**: `~/.local/share/com.pumpcourt.app/backups/`
   - **Windows**: `%APPDATA%\com.pumpcourt.app\backups\`
2. The JSON records map directly to the `runs` schema and can be restored using the sqlite3 CLI:
   ```bash
   sqlite3 pump_court.db
   ```
