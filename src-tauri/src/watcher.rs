use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

const AUDIO_EXTS: &[&str] = &[".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a", ".wma"];

pub struct LibraryWatcher {
    watcher: Option<RecommendedWatcher>,
}

impl LibraryWatcher {
    pub fn new() -> Self {
        Self { watcher: None }
    }

    pub fn start(
        &mut self,
        folders: &[String],
        app_handle: AppHandle,
        db_path: String,
    ) -> Result<(), String> {
        let (tx, rx) = mpsc::channel::<Result<Event, notify::Error>>();

        let mut watcher = RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default(),
        )
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

        for folder in folders {
            let path = Path::new(folder);
            if path.exists() {
                watcher
                    .watch(path, RecursiveMode::Recursive)
                    .map_err(|e| format!("Failed to watch {}: {}", folder, e))?;
            }
        }

        let app_clone = app_handle.clone();
        let db_clone = db_path.clone();

        thread::spawn(move || {
            let debounce_ms = std::time::Duration::from_millis(500);
            let mut pending: std::collections::HashMap<String, std::time::Instant> =
                std::collections::HashMap::new();

            loop {
                match rx.recv_timeout(debounce_ms) {
                    Ok(Ok(event)) => {
                        let paths = collect_audio_paths(&event);
                        for p in paths {
                            pending.insert(p, std::time::Instant::now());
                        }
                    }
                    Ok(Err(_)) => {}
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        if pending.is_empty() {
                            continue;
                        }
                        let now = std::time::Instant::now();
                        let ready: Vec<String> = pending
                            .iter()
                            .filter(|(_, t)| now.duration_since(**t) >= debounce_ms)
                            .map(|(p, _)| p.clone())
                            .collect();

                        if ready.is_empty() {
                            continue;
                        }
                        for p in &ready {
                            pending.remove(p);
                        }

                        if let Ok(conn) = rusqlite::Connection::open(&db_clone) {
                            for path in &ready {
                                let exists = Path::new(path).exists();
                                if let Err(e) =
                                    super::db::set_track_availability(&conn, path, exists)
                                {
                                    eprintln!("watcher: set_availability failed: {}", e);
                                }
                                if exists {
                                    match super::parse_song(path, "") {
                                        song if song.name != "Unknown" || song.duration > 0.0 => {
                                            let library_root = super::find_library_root(&conn, path);
                                            let mut s = song;
                                            s.library_root = library_root;
                                            if let Err(e) = super::db::upsert_track(&conn, &s) {
                                                eprintln!("watcher: upsert failed: {}", e);
                                            }
                                            let _ = app_clone.emit("fs-track-changed", serde_json::json!({
                                                "type": if exists { "created" } else { "deleted" },
                                                "track": s
                                            }));
                                        }
                                        _ => {}
                                    }
                                } else {
                                    let _ = app_clone.emit("fs-track-changed", serde_json::json!({
                                        "type": "deleted",
                                        "path": path
                                    }));
                                }
                            }
                        }
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
        });

        self.watcher = Some(watcher);
        Ok(())
    }
}

fn collect_audio_paths(event: &Event) -> Vec<String> {
    let mut result = Vec::new();
    match event.kind {
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
            for path in &event.paths {
                if let Some(ext) = path.extension() {
                    let ext_str = format!(".{}", ext.to_string_lossy().to_lowercase());
                    if AUDIO_EXTS.contains(&ext_str.as_str()) {
                        result.push(path.to_string_lossy().to_string());
                    }
                }
            }
        }
        _ => {}
    }
    result
}
