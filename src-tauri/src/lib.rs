#![allow(unused_imports)]
use base64::Engine;
use lofty::prelude::*;
use lofty::{read_from_path};
use serde::{Serialize};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use walkdir::WalkDir;

// ─── Types ───

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SongData {
    id: String,
    name: String,
    artist: String,
    album: String,
    album_artist: String,
    folder: String,
    relative_path: String,
    file_path: String,
    cover: Option<String>,
    duration: f64,
    size: u64,
    track_no: u32,
    is_favorite: bool,
    lyrics: Option<Vec<LyricLine>>,
    lyrics_unsynced: Option<String>,
    lyrics_source: Option<String>,
    lyrics_lrc: Option<Vec<LyricLine>>,
    lyrics_lrc_meta: Option<LrcMeta>,
}

#[derive(Serialize, Clone)]
struct LyricLine {
    time: f64,
    text: String,
}

#[derive(Serialize, Clone)]
struct LrcMeta {
    ti: Option<String>,
    ar: Option<String>,
    al: Option<String>,
    offset: Option<i64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    #[serde(rename = "type")]
    type_: String,
    count: Option<usize>,
    current: Option<usize>,
    total: Option<usize>,
    folder: Option<String>,
    file_name: Option<String>,
    message: Option<String>,
}

#[derive(Serialize, Clone)]
struct AudioFileResult {
    data: String,
    mime: String,
}

// ─── State ───

struct ScanCancellers {
    map: Mutex<std::collections::HashMap<String, std::sync::Arc<AtomicBool>>>,
}

impl ScanCancellers {
    fn new() -> Self {
        Self {
            map: Mutex::new(std::collections::HashMap::new()),
        }
    }
}

// ─── Helpers ───

fn song_id_from_path(full_path: &str) -> String {
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    URL_SAFE_NO_PAD.encode(full_path.as_bytes())
}

fn norm_path(path: &str) -> String {
    path.replace('\\', "/")
        .trim_end_matches('/')
        .to_lowercase()
}

const AUDIO_EXTS: &[&str] = &[".mp3", ".wav", ".flac", ".ogg", ".aac", ".m4a", ".wma"];
const IMG_EXTS: &[&str] = &[".jpg", ".jpeg", ".png", ".bmp", ".webp"];
const PRIORITY_COVERS: &[&str] = &[
    "cover.jpg", "cover.png", "cover.jpeg", "folder.jpg", "folder.png", "folder.jpeg",
    "front.jpg", "front.png", "front.jpeg", "AlbumArt.jpg", "AlbumArt.png", "albumart.jpg",
    "albumart.png",
];

fn mime_for_ext(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        ".mp3" => "audio/mpeg",
        ".wav" => "audio/wav",
        ".flac" => "audio/flac",
        ".ogg" => "audio/ogg",
        ".aac" => "audio/aac",
        ".m4a" => "audio/mp4",
        ".wma" => "audio/x-ms-wma",
        _ => "audio/mpeg",
    }
}

macro_rules! regex_lazy {
    ($re:literal) => {{
        static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
        RE.get_or_init(|| regex::Regex::new($re).unwrap())
    }};
}

fn parse_lrc(text: &str) -> (Vec<LyricLine>, Option<LrcMeta>) {
    let mut lines = Vec::new();
    let mut meta = LrcMeta {
        ti: None,
        ar: None,
        al: None,
        offset: None,
    };
    let mut lrc_offset: f64 = 0.0;

    let meta_re = regex_lazy!(r"^\[(?i:ti|ar|al|by|re|ve|au|la|offset):(.*)\]$");
    let time_re = regex_lazy!(r"\[(\d{2}):(\d{2})\.(\d{2,3})\]");

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Metadata lines
        if let Some(caps) = meta_re.captures(trimmed) {
            let full_tag = caps.get(0).unwrap().as_str();
            let tag = full_tag[1..full_tag.find(':').unwrap_or(0)].to_lowercase();
            let val = caps.get(1).unwrap().as_str().trim().to_string();
            match tag.as_str() {
                "offset" => {
                    lrc_offset = val.parse::<i64>().unwrap_or(0) as f64 / 1000.0;
                    meta.offset = Some(val.parse().unwrap_or(0));
                }
                "ti" => meta.ti = Some(val),
                "ar" => meta.ar = Some(val),
                "al" => meta.al = Some(val),
                _ => {}
            }
            continue;
        }

        // Time tags
        let mut times = Vec::new();
        let mut last_end = 0;

        for cap in time_re.captures_iter(trimmed) {
            let m = cap.get(0).unwrap();
            let min: f64 = cap.get(1).unwrap().as_str().parse().unwrap_or(0.0);
            let sec: f64 = cap.get(2).unwrap().as_str().parse().unwrap_or(0.0);
            let ms_str = cap.get(3).unwrap().as_str();
            let padded = format!("{:0<3}", ms_str);
            let ms: f64 = padded[..3].parse().unwrap_or(0.0);
            times.push(min * 60.0 + sec + ms / 1000.0);
            last_end = m.end();
        }

        if !times.is_empty() {
            let text = trimmed[last_end..].trim().to_string();
            if !text.is_empty() {
                for t in &times {
                    lines.push(LyricLine {
                        time: t + lrc_offset,
                        text: text.clone(),
                    });
                }
            }
        }
    }

    lines.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(std::cmp::Ordering::Equal));
    (
        lines,
        if meta.ti.is_some() || meta.ar.is_some() || meta.al.is_some() {
            Some(meta)
        } else {
            None
        },
    )
}

fn parse_filename(name: &str) -> (String, Option<String>) {
    let name_clean = name
        .trim_start_matches(|c: char| c.is_ascii_digit() || c == ' ' || c == '.' || c == '-' || c == ')' || c == '(')
        .trim();
    if let Some(pos) = name_clean.find(|c| c == '-' || c == '–' || c == '—') {
        let artist = name_clean[..pos].trim().to_string();
        let title = name_clean[pos + 1..].trim().to_string();
        if !artist.is_empty() && !title.is_empty() {
            return (title, Some(artist));
        }
    }
    if name_clean.ends_with(')') {
        if let Some(pos) = name_clean.rstrfind(" (") {
            let title = name_clean[..pos].trim().to_string();
            if !title.is_empty() {
                return (title, None);
            }
        }
    }
    (name_clean.to_string(), None)
}

// Bounded rfind for a str pattern (simple helper)
trait StrFind {
    fn rstrfind(&self, pat: &str) -> Option<usize>;
}

impl StrFind for str {
    fn rstrfind(&self, pat: &str) -> Option<usize> {
        if pat.is_empty() {
            return None;
        }
        let pat_bytes = pat.as_bytes();
        let pat_len = pat_bytes.len();
        if pat_len > self.len() {
            return None;
        }
        for i in (0..=self.len() - pat_len).rev() {
            if &self.as_bytes()[i..i + pat_len] == pat_bytes {
                return Some(i);
            }
        }
        None
    }
}

fn find_cover_in_dir(dir: &Path) -> Option<String> {
    let entries = std::fs::read_dir(dir).ok()?;
    let mut first_img: Option<String> = None;

    for entry in entries {
        let entry = entry.ok()?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path.file_name()?.to_str()?.to_lowercase();
        let ext = path.extension()?.to_str()?.to_lowercase();
        let ext_full = format!(".{}", ext);
        if !IMG_EXTS.contains(&ext_full.as_str()) {
            continue;
        }
        if PRIORITY_COVERS.contains(&name.as_str()) {
            if let Some(data) = read_image_as_data_url(&path) {
                return Some(data);
            }
        }
        if first_img.is_none() {
            first_img = Some(name);
        }
    }

    if let Some(name) = first_img {
        let path = dir.join(&name);
        return read_image_as_data_url(&path);
    }
    None
}

fn find_cover_recursive(dir: &Path) -> Option<String> {
    if let Some(found) = find_cover_in_dir(dir) {
        return Some(found);
    }
    if let Some(parent) = dir.parent() {
        if parent != dir {
            return find_cover_in_dir(parent);
        }
    }
    None
}

fn read_image_as_data_url(path: &Path) -> Option<String> {
    let data = std::fs::read(path).ok()?;
    let ext = path.extension()?.to_str()?.to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Some(format!("data:{};base64,{}", mime, b64))
}

fn parse_song(full_path: &str, folder_path: &str) -> SongData {
    let path = Path::new(full_path);
    let _ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
    let base = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown");
    let dir = path.parent().unwrap_or(Path::new("."));

    // Attempt metadata parsing with lofty
    let (name, artist, album, album_artist, track_no, duration, cover, lyrics_synced, lyrics_unsynced) =
        match read_from_path(full_path) {
            Ok(tagged_file) => {
                let dur = tagged_file.properties().duration().as_secs_f64();
                let all_tags = tagged_file.tags();

                if !all_tags.is_empty() {
                    let n = all_tags.iter().find_map(|t| {
                        t.title().and_then(|v| {
                            let trimmed = v.trim();
                            if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
                        })
                    }).unwrap_or_else(|| base.to_string());
                    let a = all_tags.iter().find_map(|t| {
                        t.artist().and_then(|v| {
                            let trimmed = v.trim();
                            if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
                        })
                    }).unwrap_or_else(|| "Unknown Artist".to_string());
                    let al = all_tags.iter().find_map(|t| {
                        t.album().and_then(|v| {
                            let trimmed = v.trim();
                            if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
                        })
                    }).unwrap_or_else(|| "Unknown Album".to_string());
                    let aa = a.clone();
                    let tn = all_tags.first().and_then(|t| t.track()).unwrap_or(0);

                    let cv = all_tags.iter().find_map(|tag| {
                        tag.pictures().first().map(|pic| {
                            let b64 = base64::engine::general_purpose::STANDARD.encode(pic.data());
                            let mime = pic.mime_type()
                                .map(|m| m.as_str().to_string())
                                .unwrap_or_else(|| "image/jpeg".to_string());
                            format!("data:{};base64,{}", mime, b64)
                        })
                    });

                    // Try to extract lyrics via item iteration
                    let mut unsynced = None;
                    for tag in all_tags {
                        for item in tag.items() {
                            let key_str = format!("{:?}", item.key());
                            let kl = key_str.to_lowercase();
                            if (kl.contains("lyrics") || kl.contains("unsync")) && unsynced.is_none() {
                                unsynced = item.value().text().map(|s| s.to_string());
                            }
                        }
                    }

                    (n, a, al, aa, tn, dur, cv, None::<Vec<LyricLine>>, unsynced)
                } else {
                    let (title, parsed_artist) = parse_filename(base);
                    (
                        title,
                        parsed_artist.unwrap_or_else(|| "Unknown Artist".to_string()),
                        "Unknown Album".to_string(),
                        String::new(),
                        0,
                        dur,
                        None,
                        None::<Vec<LyricLine>>,
                        None,
                    )
                }
            }
            Err(_) => {
                let (title, parsed_artist) = parse_filename(base);
                (
                    title,
                    parsed_artist.unwrap_or_else(|| "Unknown Artist".to_string()),
                    "Unknown Album".to_string(),
                    String::new(),
                    0,
                    0.0,
                    None,
                    None::<Vec<LyricLine>>,
                    None,
                )
            }
        };

    let cover_fallback = cover.or_else(|| find_cover_recursive(dir));
    let folder = dir.file_name().and_then(|s| s.to_str()).unwrap_or("Unknown").to_string();

    // External LRC file
    let lrc_path = dir.join(format!("{}.lrc", base));
    let (lyrics_lrc, lyrics_lrc_meta) = if lrc_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&lrc_path) {
            let (lrc_lines, lrc_meta) = parse_lrc(&content);
            if !lrc_lines.is_empty() {
                (Some(lrc_lines), lrc_meta)
            } else {
                (None, None)
            }
        } else {
            (None, None)
        }
    } else {
        (None, None)
    };

    let (final_lyrics, lyrics_source) = if lyrics_lrc.is_some() {
        (lyrics_lrc.clone(), Some("lrc".to_string()))
    } else if lyrics_synced.is_some() {
        (lyrics_synced, Some("embedded".to_string()))
    } else if lyrics_unsynced.is_some() {
        (None, Some("unsynced".to_string()))
    } else {
        (None, None)
    };

    SongData {
        id: song_id_from_path(full_path),
        name,
        artist,
        album,
        album_artist,
        folder,
        relative_path: Path::new(full_path)
            .strip_prefix(folder_path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| base.to_string()),
        file_path: full_path.to_string(),
        cover: cover_fallback,
        duration,
        size: std::fs::metadata(full_path).map(|m| m.len()).unwrap_or(0),
        track_no,
        is_favorite: false,
        lyrics: final_lyrics,
        lyrics_unsynced,
        lyrics_source,
        lyrics_lrc,
        lyrics_lrc_meta,
    }
}

// ─── Tauri Commands ───

#[tauri::command]
fn window_minimize(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.minimize();
    }
}

#[tauri::command]
fn window_maximize(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_maximized().unwrap_or(false) {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
fn window_close(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.close();
    }
}

#[tauri::command]
fn window_is_maximized(app: AppHandle) -> bool {
    app.get_webview_window("main")
        .and_then(|w| w.is_maximized().ok())
        .unwrap_or(false)
}

#[tauri::command]
async fn read_audio_file(path: String) -> Result<AudioFileResult, String> {
    let data = std::fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("mp3");
    let mime = mime_for_ext(&format!(".{}", ext)).to_string();
    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
    Ok(AudioFileResult {
        data: b64,
        mime,
    })
}

#[tauri::command]
async fn open_folder(path: String) -> Result<(), String> {
    let _ = std::process::Command::new("cmd")
        .args(["/c", "start", "", &path])
        .spawn();
    Ok(())
}

#[tauri::command]
async fn get_cover(path: String) -> Result<Option<String>, String> {
    let path = Path::new(&path);
    // Try embedded cover first
    if let Ok(tagged_file) = read_from_path(&path) {
        if let Some(tag) = tagged_file.tags().first() {
            if let Some(pic) = tag.pictures().first() {
                let b64 = base64::engine::general_purpose::STANDARD.encode(pic.data());
                let mime = pic.mime_type().map(|m| m.as_str().to_string()).unwrap_or_else(|| "image/jpeg".to_string());
                return Ok(Some(format!("data:{};base64,{}", mime, b64)));
            }
        }
    }
    // Fallback: folder cover
    let dir = path.parent().unwrap_or(path);
    Ok(find_cover_recursive(dir))
}

#[tauri::command]
async fn scan_files(files: Vec<String>, app: AppHandle) -> Result<Vec<SongData>, String> {
    let folder_path = "individual_files";
    let songs: Vec<SongData> = files
        .into_iter()
        .map(|fp| {
            let song = parse_song(&fp, folder_path);
            song
        })
        .collect();
    let _ = app.emit(
        "scan-progress",
        ScanProgress {
            type_: "complete".to_string(),
            count: Some(songs.len()),
            current: None,
            total: None,
            folder: None,
            file_name: None,
            message: None,
        },
    );
    Ok(songs)
}

#[tauri::command]
async fn cancel_scan(folder_path: String, state: State<'_, ScanCancellers>) -> Result<(), String> {
    let map = state.map.lock().map_err(|e| e.to_string())?;
    if let Some(canceller) = map.get(&norm_path(&folder_path)) {
        canceller.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
async fn scan_folder(
    app: AppHandle,
    folder_path: String,
    recursive: bool,
    state: State<'_, ScanCancellers>,
) -> Result<Vec<SongData>, String> {
    let cancel_flag = std::sync::Arc::new(AtomicBool::new(false));
    {
        let mut map = state.map.lock().map_err(|e| e.to_string())?;
        map.insert(norm_path(&folder_path), cancel_flag.clone());
    }

    let folder = Path::new(&folder_path);
    let mut all_files = Vec::new();

    let walker = if recursive {
        WalkDir::new(folder).follow_links(false)
    } else {
        WalkDir::new(folder).max_depth(1)
    };

    for entry in walker {
        let entry = entry.map_err(|e| format!("Failed to read folder: {}", e))?;
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension() {
                let ext_str = format!(".{}", ext.to_string_lossy().to_lowercase());
                if AUDIO_EXTS.contains(&ext_str.as_str()) {
                    all_files.push(entry.path().to_string_lossy().to_string());
                }
            }
        }
    }

    let total = all_files.len();
    let _ = app.emit(
        "scan-progress",
        ScanProgress {
            type_: "total".to_string(),
            count: Some(total),
            current: None,
            total: None,
            folder: Some(folder_path.clone()),
            file_name: None,
            message: None,
        },
    );

    if total == 0 {
        let mut map = state.map.lock().map_err(|e| e.to_string())?;
        map.remove(&norm_path(&folder_path));
        let _ = app.emit(
            "scan-progress",
            ScanProgress {
                type_: "no-audio".to_string(),
                count: None,
                current: None,
                total: None,
                folder: None,
                file_name: None,
                message: Some("No audio files found in this folder.".to_string()),
            },
        );
        return Ok(Vec::new());
    }

    let songs: Vec<SongData> = all_files
        .into_iter()
        .filter(|_| !cancel_flag.load(Ordering::SeqCst))
        .enumerate()
        .map(|(i, fp)| {
            let song = parse_song(&fp, &folder_path);
            let _ = app.emit(
                "scan-progress",
                ScanProgress {
                    type_: "progress".to_string(),
                    count: None,
                    current: Some(i + 1),
                    total: Some(total),
                    folder: None,
                    file_name: Some(
                        Path::new(&fp)
                            .file_name()
                            .and_then(|s| s.to_str())
                            .unwrap_or("")
                            .to_string(),
                    ),
                    message: None,
                },
            );
            song
        })
        .collect();

    let was_cancelled = cancel_flag.load(Ordering::SeqCst);
    {
        let mut map = state.map.lock().map_err(|e| e.to_string())?;
        map.remove(&norm_path(&folder_path));
    }

    if was_cancelled {
        let _ = app.emit(
            "scan-progress",
            ScanProgress {
                type_: "cancelled".to_string(),
                count: None,
                current: None,
                total: None,
                folder: None,
                file_name: None,
                message: None,
            },
        );
    } else {
        let _ = app.emit(
            "scan-progress",
            ScanProgress {
                type_: "complete".to_string(),
                count: Some(songs.len()),
                current: None,
                total: None,
                folder: None,
                file_name: None,
                message: None,
            },
        );
    }

    Ok(songs)
}

use regex;

pub fn run() {
    let _ = env_logger::try_init();
    println!("Tauri::run starting...");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(ScanCancellers::new())
        .invoke_handler(tauri::generate_handler![
            window_minimize,
            window_maximize,
            window_close,
            window_is_maximized,
            read_audio_file,
            open_folder,
            get_cover,
            cancel_scan,
            scan_folder,
            scan_files,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
