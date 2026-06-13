use rusqlite::{Connection, params};
use serde::Serialize;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Serialize, Clone)]
pub struct TrackRow {
    pub id: String,
    pub path: String,
    pub name: String,
    pub artist: String,
    pub album: String,
    pub album_artist: String,
    pub folder: String,
    pub relative_path: String,
    pub cover: Option<String>,
    pub duration: f64,
    pub size: u64,
    pub track_no: u32,
    pub is_favorite: bool,
    pub is_available: bool,
    pub lyrics_source: Option<String>,
    pub lyrics_unsynced: Option<String>,
    pub lyrics_lrc: Option<String>,
    pub lyrics_lrc_meta: Option<String>,
    pub library_root: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct FolderRow {
    pub id: i64,
    pub path: String,
    pub last_scanned: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct HistoryRow {
    pub id: i64,
    pub track_id: String,
    pub played_at: String,
}

pub fn init_db(db_path: &str) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|e| format!("Failed to open DB: {}", e))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS tracks (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL DEFAULT 'Unknown',
            artist TEXT NOT NULL DEFAULT 'Unknown Artist',
            album TEXT NOT NULL DEFAULT 'Unknown Album',
            album_artist TEXT NOT NULL DEFAULT '',
            folder TEXT NOT NULL DEFAULT '',
            relative_path TEXT NOT NULL DEFAULT '',
            cover TEXT,
            duration REAL NOT NULL DEFAULT 0,
            size INTEGER NOT NULL DEFAULT 0,
            track_no INTEGER NOT NULL DEFAULT 0,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            is_available INTEGER NOT NULL DEFAULT 1,
            lyrics_source TEXT,
            lyrics_unsynced TEXT,
            lyrics_lrc TEXT,
            lyrics_lrc_meta TEXT,
            library_root TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            last_scanned TEXT
        );
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id TEXT NOT NULL,
            played_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (track_id) REFERENCES tracks(id)
        );
        CREATE INDEX IF NOT EXISTS idx_tracks_path ON tracks(path);
        CREATE INDEX IF NOT EXISTS idx_tracks_available ON tracks(is_available);
        CREATE INDEX IF NOT EXISTS idx_history_track ON history(track_id);
        CREATE INDEX IF NOT EXISTS idx_history_played ON history(played_at);"
    ).map_err(|e| format!("Failed to init schema: {}", e))?;

    Ok(conn)
}

pub fn upsert_track(conn: &Connection, song: &super::SongData) -> Result<(), String> {
    conn.execute(
        "INSERT INTO tracks (id, path, name, artist, album, album_artist, folder, relative_path,
            cover, duration, size, track_no, is_favorite, is_available, lyrics_source,
            lyrics_unsynced, lyrics_lrc, lyrics_lrc_meta, library_root, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 1,
            ?14, ?15, ?16, ?17, ?18, datetime('now'))
        ON CONFLICT(path) DO UPDATE SET
            name=excluded.name, artist=excluded.artist, album=excluded.album,
            album_artist=excluded.album_artist, folder=excluded.folder,
            relative_path=excluded.relative_path, cover=excluded.cover,
            duration=excluded.duration, size=excluded.size, track_no=excluded.track_no,
            is_available=1, lyrics_source=excluded.lyrics_source,
            lyrics_unsynced=excluded.lyrics_unsynced, lyrics_lrc=excluded.lyrics_lrc,
            lyrics_lrc_meta=excluded.lyrics_lrc_meta, library_root=excluded.library_root,
            updated_at=datetime('now')",
        params![
            song.id, song.file_path, song.name, song.artist, song.album,
            song.album_artist, song.folder, song.relative_path, song.cover,
            song.duration, song.size as i64, song.track_no,
            song.is_favorite as i64,
            song.lyrics_source, song.lyrics_unsynced,
            song.lyrics_lrc.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default()),
            song.lyrics_lrc_meta.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default()),
            song.library_root.as_deref().unwrap_or(""),
        ],
    ).map_err(|e| format!("Failed to upsert track: {}", e))?;
    Ok(())
}

pub fn get_all_tracks(conn: &Connection) -> Result<Vec<TrackRow>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, path, name, artist, album, album_artist, folder, relative_path,
            cover, duration, size, track_no, is_favorite, is_available,
            lyrics_source, lyrics_unsynced, lyrics_lrc, lyrics_lrc_meta, library_root
        FROM tracks ORDER BY name"
    ).map_err(|e| format!("Query prepare failed: {}", e))?;

    let rows = stmt.query_map([], |row| {
        Ok(TrackRow {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            artist: row.get(3)?,
            album: row.get(4)?,
            album_artist: row.get(5)?,
            folder: row.get(6)?,
            relative_path: row.get(7)?,
            cover: row.get(8)?,
            duration: row.get(9)?,
            size: row.get::<_, i64>(10)? as u64,
            track_no: row.get::<_, i32>(11)? as u32,
            is_favorite: row.get::<_, i32>(12)? != 0,
            is_available: row.get::<_, i32>(13)? != 0,
            lyrics_source: row.get(14)?,
            lyrics_unsynced: row.get(15)?,
            lyrics_lrc: row.get(16)?,
            lyrics_lrc_meta: row.get(17)?,
            library_root: row.get(18)?,
        })
    }).map_err(|e| format!("Query map failed: {}", e))?;

    let mut tracks = Vec::new();
    for row in rows {
        tracks.push(row.map_err(|e| format!("Row read failed: {}", e))?);
    }
    Ok(tracks)
}

pub fn get_folders(conn: &Connection) -> Result<Vec<FolderRow>, String> {
    let mut stmt = conn.prepare("SELECT id, path, last_scanned FROM folders ORDER BY path")
        .map_err(|e| format!("Query prepare failed: {}", e))?;
    let rows = stmt.query_map([], |row| {
        Ok(FolderRow {
            id: row.get(0)?,
            path: row.get(1)?,
            last_scanned: row.get(2)?,
        })
    }).map_err(|e| format!("Query map failed: {}", e))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("Row read failed: {}", e))?);
    }
    Ok(out)
}

pub fn add_folder(conn: &Connection, folder_path: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO folders (path) VALUES (?1)",
        params![folder_path],
    ).map_err(|e| format!("Failed to add folder: {}", e))?;
    Ok(())
}

pub fn remove_folder(conn: &Connection, folder_path: &str) -> Result<(), String> {
    conn.execute("DELETE FROM folders WHERE path = ?1", params![folder_path])
        .map_err(|e| format!("Failed to remove folder: {}", e))?;
    Ok(())
}

pub fn update_folder_scanned(conn: &Connection, folder_path: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE folders SET last_scanned = datetime('now') WHERE path = ?1",
        params![folder_path],
    ).map_err(|e| format!("Failed to update folder scan time: {}", e))?;
    Ok(())
}

pub fn set_track_availability(conn: &Connection, file_path: &str, available: bool) -> Result<(), String> {
    conn.execute(
        "UPDATE tracks SET is_available = ?1, updated_at = datetime('now') WHERE path = ?2",
        params![available as i32, file_path],
    ).map_err(|e| format!("Failed to set availability: {}", e))?;
    Ok(())
}

pub fn mark_missing_tracks(conn: &Connection) -> Result<usize, String> {
    let count = conn.execute(
        "UPDATE tracks SET is_available = 0, updated_at = datetime('now')
        WHERE is_available = 1 AND path NOT LIKE 'blob:%'",
        [],
    ).map_err(|e| format!("Failed to mark missing tracks: {}", e))?;
    Ok(count)
}

pub fn check_availability_initial(conn: &Connection) -> Result<usize, String> {
    let folders = get_folders(conn)?;
    let mut all_paths = Vec::new();
    for f in &folders {
        let fp = Path::new(&f.path);
        if !fp.exists() { continue; }
        let walker = walkdir::WalkDir::new(fp).follow_links(false);
        for entry in walker {
            if let Ok(e) = entry {
                if e.file_type().is_file() {
                    if let Some(ext) = e.path().extension() {
                        let ext_str = format!(".{}", ext.to_string_lossy().to_lowercase());
                        let audio_exts: &[&str] = &[".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a", ".wma"];
                        if audio_exts.contains(&ext_str.as_str()) {
                            all_paths.push(e.path().to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }
    bulk_set_availability(conn, &all_paths)
}

pub fn bulk_set_availability(conn: &Connection, available_paths: &[String]) -> Result<usize, String> {
    let tx = conn.unchecked_transaction()
        .map_err(|e| format!("Failed to start tx: {}", e))?;

    let count = tx.execute(
        "UPDATE tracks SET is_available = 0, updated_at = datetime('now')
        WHERE is_available = 1 AND path NOT LIKE 'blob:%'",
        [],
    ).map_err(|e| format!("Failed to clear availability: {}", e))?;

    for path in available_paths {
        tx.execute(
            "UPDATE tracks SET is_available = 1, updated_at = datetime('now') WHERE path = ?1",
            params![path],
        ).map_err(|e| format!("Failed to set availability: {}", e))?;
    }

    tx.commit().map_err(|e| format!("Failed to commit: {}", e))?;
    Ok(count)
}

pub fn log_play(conn: &Connection, track_id: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO history (track_id) VALUES (?1)",
        params![track_id],
    ).map_err(|e| format!("Failed to log play: {}", e))?;
    Ok(())
}

pub fn get_recent_history(conn: &Connection, limit: usize) -> Result<Vec<HistoryRow>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, track_id, played_at FROM history ORDER BY played_at DESC LIMIT ?1"
    ).map_err(|e| format!("Query prepare failed: {}", e))?;

    let rows = stmt.query_map(params![limit as i64], |row| {
        Ok(HistoryRow {
            id: row.get(0)?,
            track_id: row.get(1)?,
            played_at: row.get(2)?,
        })
    }).map_err(|e| format!("Query map failed: {}", e))?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("Row read failed: {}", e))?);
    }
    Ok(out)
}

pub fn delete_track(conn: &Connection, file_path: &str) -> Result<(), String> {
    conn.execute("DELETE FROM tracks WHERE path = ?1", params![file_path])
        .map_err(|e| format!("Failed to delete track: {}", e))?;
    Ok(())
}
