import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { ChevronLeft, Play, Shuffle } from 'lucide-react';
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import PlaybackBar from './components/PlaybackBar';
import NowPlaying from './components/NowPlaying';
import { LibrarySection } from './components/Library';
import ScanProgress from './components/ScanProgress';
import FolderPicker from './components/FolderPicker';
import Settings from './components/Settings';
import Panorama from './components/Panorama';
import { SECTION_ORDER } from './components/Panorama';
import { useToast } from './components/Toast';
import { useLibraryIndexes } from './hooks/useLibraryIndexes';
import { normPath, isUnderFolder, filterSongsForFolders, collectLibraryRoots, parentDir } from './utils/paths';
import { normalizeSongs } from './utils/songId';
import TitleBar from './components/TitleBar';
import { usePlayback } from './hooks/usePlayback';

const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__;

function dedupePaths(paths) {
  const normalized = [];
  const seen = new Set();
  for (const p of paths) {
    const key = normPath(p);
    if (!seen.has(key)) {
      normalized.push(p);
      seen.add(key);
    }
  }
  return normalized.filter((p) => {
    const pNorm = normPath(p);
    return !normalized.some((other) => {
      if (p === other) return false;
      const otherNorm = normPath(other);
      return pNorm.startsWith(`${otherNorm}/`);
    });
  });
}

const STORAGE_KEY = 'splayer_library';
const FOLDERS_KEY = 'splayer_folders';
const VOLUME_KEY = 'splayer_volume';
const SESSION_KEY = 'splayer_session';
const APP_THEME_COLOR = '#6c5ce7';
const APP_THEME_RGB = '108, 92, 231';
const albumColorCache = new Map();

function loadAudioFile(filePath) {
  if (!filePath) return '';
  return convertFileSrc(filePath);
}

function formatTime(sec) {
  if (sec == null || isNaN(sec) || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function extractDominantColor(src) {
  if (!src) return Promise.resolve({ hex: APP_THEME_COLOR, rgb: APP_THEME_RGB });
  if (albumColorCache.has(src)) return Promise.resolve(albumColorCache.get(src));

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const buckets = new Map();

        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 180) continue;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const saturation = max - min;
          const brightness = (r + g + b) / 3;
          if (brightness < 28 || brightness > 235 || saturation < 24) continue;

          const qr = Math.min(255, Math.round(r / 16) * 16);
          const qg = Math.min(255, Math.round(g / 16) * 16);
          const qb = Math.min(255, Math.round(b / 16) * 16);
          const key = `${qr},${qg},${qb}`;
          const current = buckets.get(key) || { r: qr, g: qg, b: qb, count: 0, score: 0 };
          current.count += 1;
          current.score += saturation * (brightness > 180 ? 0.7 : 1);
          buckets.set(key, current);
        }

        const winner = [...buckets.values()].sort((a, b) => (b.count * b.score) - (a.count * a.score))[0];
        if (!winner) throw new Error('No dominant color found');

        let { r, g, b } = winner;
        const brightness = (r + g + b) / 3;
        if (brightness > 160) {
          const scale = 160 / brightness;
          r = Math.round(r * scale);
          g = Math.round(g * scale);
          b = Math.round(b * scale);
        }

        const color = {
          hex: rgbToHex(r, g, b),
          rgb: `${r}, ${g}, ${b}`,
        };
        albumColorCache.set(src, color);
        resolve(color);
      } catch {
        resolve({ hex: APP_THEME_COLOR, rgb: APP_THEME_RGB });
      }
    };
    img.onerror = () => resolve({ hex: APP_THEME_COLOR, rgb: APP_THEME_RGB });
    img.src = src;
  });
}

class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(e) { return { hasError: true, error: e }; }
  render() {
    if (this.state.hasError) {
      return React.createElement('div', { style: { padding: 40, color: '#fff', fontFamily: 'monospace', background: '#050510', height: '100vh' } },
        React.createElement('h1', { style: { color: '#ff4757' } }, 'Render Error'),
        React.createElement('pre', { style: { whiteSpace: 'pre-wrap', fontSize: 13, color: '#ff6b81' } }, this.state.error?.message || 'Unknown error'),
        React.createElement('pre', { style: { whiteSpace: 'pre-wrap', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 12 } }, this.state.error?.stack || '')
      );
    }
    return this.props.children;
  }
}

function App() {
  const audioRef = useRef(null);
  const currentAudioUrlRef = useRef(null);
  const playbackTokenRef = useRef(0);
  const seekingRef = useRef(false);

  const [songs, setSongs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [drillFilter, setDrillFilter] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [folderPaths, setFolderPaths] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [albumTheme, setAlbumTheme] = useState({ hex: APP_THEME_COLOR, rgb: APP_THEME_RGB });
  const albumColor = albumTheme.hex;
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const { addToast, ToastContainer } = useToast();
  const [scanState, setScanState] = useState({
    visible: false, folder: '', total: 0, current: 0,
    fileName: '', cancelled: false,
  });
  const cancelFolderRef = useRef('');
  const scanResultRef = useRef('');
  const [lyricsLines, setLyricsLines] = useState([]);
  const [lyricsSource, setLyricsSource] = useState(null);
  const [lyricsAvailableSources, setLyricsAvailableSources] = useState([]);
  const [lyricsOffset, setLyricsOffset] = useState(0);

  const {
    currentTrack,
    shuffle,
    repeat,
    repeatRef: pbRepeatRef,
    playTrackNow,
    removeFromQueue,
    clearQueue,
    moveInQueue,
    skipToNext,
    skipToPrevious,
    jumpToTrack,
    toggleShuffle,
    toggleRepeat,
    getCombinedQueue,
    addToQueue,
    playNext,
    getSessionSnapshot,
    restoreSession,
    explicitQueue,
  } = usePlayback();

  const repeatRef = pbRepeatRef;
  const restoreTimeRef = useRef(0);

  const [settings, setSettings] = useState({ crossfade: false, crossfadeDuration: 3 });
  const saveSettings = useCallback((val) => setSettings(val), []);

  const songIndexById = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < songs.length; i++) {
      map.set(songs[i].id, i);
    }
    return map;
  }, [songs]);

  const loadVolume = useCallback(() => {
    try {
      const saved = localStorage.getItem(VOLUME_KEY);
      if (saved !== null) {
        let vol = parseFloat(saved);
        if (vol > 100) vol = vol / 100;
        vol = Math.max(0, Math.min(100, vol));
        audioRef.current.volume = vol / 100;
        setVolume(vol);
      }
    } catch {}
  }, [audioRef]);

  const saveVolume = useCallback((val) => {
    try { localStorage.setItem(VOLUME_KEY, String(val)); } catch {}
  }, []);

  const handleVolumeChange = useCallback((e) => {
    const val = parseFloat(e.target.value);
    audioRef.current.volume = val / 100;
    setVolume(val);
    saveVolume(val);
  }, [audioRef, saveVolume]);

  const loadLibrary = useCallback(async () => {
    let folders = [];
    let saved = [];
    try { folders = JSON.parse(localStorage.getItem(FOLDERS_KEY) || '[]'); } catch {}
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch {}
    if (!Array.isArray(folders)) folders = [];
    if (!Array.isArray(saved)) saved = [];
    const snakeToCamel = (obj) => {
      const map = { file_path: 'filePath', relative_path: 'relativePath', album_artist: 'albumArtist', track_no: 'trackNo', is_favorite: 'isFavorite', lyrics_source: 'lyricsSource', lyrics_unsynced: 'lyricsUnsynced', lyrics_lrc: 'lyricsLrc', lyrics_lrc_meta: 'lyricsLrcMeta', file_name: 'fileName' };
      for (const [snake, camel] of Object.entries(map)) {
        if (snake in obj && !(camel in obj)) { obj[camel] = obj[snake]; delete obj[snake]; }
      }
      if ('lyricsLRC' in obj && !('lyricsLrc' in obj)) obj.lyricsLrc = obj.lyricsLRC;
      return obj;
    };
    saved = saved.map(snakeToCamel);
    const isRealPath = (p) => p && !p.startsWith('http://') && !p.startsWith('https://') && !p.includes('localhost');
    folders = folders.filter(isRealPath);
    saved = saved.filter((s) => isRealPath(s.filePath));
    folders = dedupePaths(folders);
    const rootsFromSongs = dedupePaths(collectLibraryRoots(saved));
    if (folders.length === 0 && rootsFromSongs.length > 0) {
      folders = rootsFromSongs;
    }
    let prunedSongs = normalizeSongs(filterSongsForFolders(saved, folders));
    if (prunedSongs.length === 0 && saved.length > 0 && rootsFromSongs.length > 0) {
      folders = dedupePaths([...folders, ...rootsFromSongs]);
      prunedSongs = normalizeSongs(filterSongsForFolders(saved, folders));
    }
    prunedSongs = prunedSongs.map((s) => {
      if (s.libraryRoot) return s;
      const root = folders.find((fp) => isUnderFolder(s.filePath, fp));
      return root ? { ...s, libraryRoot: root } : s;
    });
    const invalidFolders = new Set(['', 'unknown', 'unknown album', 'unknown artist', 'localhost', 'localhost:5173', 'localhost5173']);
    prunedSongs = prunedSongs.map((s) => {
      const folderStr = s.folder ? s.folder.trim().toLowerCase() : '';
      if ((folderStr && !invalidFolders.has(folderStr)) || !s.filePath) return s;
      for (const fp of folders) {
        const normFile = s.filePath.replace(/\\/g, '/').toLowerCase();
        const normFolder = fp.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
        if (normFile.startsWith(normFolder + '/')) {
          const rel = normFile.slice(normFolder.length + 1);
          const parts = rel.split('/');
          const dir = parts.length > 1 ? parts[0] : normFolder.split('/').pop() || 'Unknown';
          return { ...s, folder: dir };
        }
      }
      const normal = s.filePath.replace(/\\/g, '/');
      const parts = normal.split('/');
      if (parts.length >= 2) {
        const candidate = parts[parts.length - 2];
        if (!candidate.includes(':')) return { ...s, folder: candidate };
      }
      return s;
    });
    setFolderPaths(folders);
    setSongs(prunedSongs);
    folderPathsRef.current = folders;
    songsRef.current = prunedSongs;
    loadedRef.current = true;

    try {
      const storedFolders = localStorage.getItem(FOLDERS_KEY) || '[]';
      const storedSongs = localStorage.getItem(STORAGE_KEY) || '[]';
      if (storedFolders !== JSON.stringify(folders) || storedSongs !== JSON.stringify(prunedSongs)) {
        localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prunedSongs));
      }
    } catch {}
  }, []);

  const loadedRef = useRef(false);

  const saveLibrary = useCallback((updatedSongs, updatedFolders) => {
    if (updatedSongs !== undefined) {
      songsRef.current = updatedSongs;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSongs)); } catch {}
    }
    if (updatedFolders !== undefined) {
      folderPathsRef.current = updatedFolders;
      try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(updatedFolders)); } catch {}
    }
  }, []);

  const persistLibrary = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(songsRef.current));
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(folderPathsRef.current));
    } catch {}
  }, []);
  const folderPathsRef = useRef(folderPaths);
  const songsRef = useRef(songs);
  const saveTimerRef = useRef(null);
  folderPathsRef.current = folderPaths;
  songsRef.current = songs;

  useEffect(() => {
    if (!loadedRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(persistLibrary, 500);
    return () => clearTimeout(saveTimerRef.current);
  }, [songs, folderPaths, persistLibrary]);

  const tagSongsWithRoot = useCallback((scanned, rootPath) => {
    if (!rootPath) return scanned;
    return scanned.map((s) => ({ ...s, libraryRoot: rootPath }));
  }, []);

  const handleScanFolder = useCallback(async (folderPath, recursive) => {
    setShowFolderPicker(false);
    cancelFolderRef.current = folderPath;
    scanResultRef.current = '';
    setScanState({ visible: true, folder: folderPath, total: 0, current: 0, fileName: '', cancelled: false });
    try {
      const scanned = await invoke('scan_folder', { folderPath, recursive });
      const result = scanResultRef.current;
      const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
      if (result === 'error') {
        addToast(`Failed to scan "${folderName}". Check folder permissions.`, 'error');
        scanResultRef.current = '';
        setScanState((prev) => ({ ...prev, visible: false }));
        return;
      }
      if (result === 'no-audio') {
        addToast(`No audio files found in "${folderName}".`, 'info');
        scanResultRef.current = '';
        setScanState((prev) => ({ ...prev, visible: false }));
        return;
      }
      const scannedTagged = tagSongsWithRoot(scanned, folderPath);
      const prevFolders = dedupePaths(folderPathsRef.current);
      const prevSongs = songsRef.current;
      const existingIds = new Set(prevSongs.map((s) => s.id));
      const newSongs = scannedTagged.filter((s) => !existingIds.has(s.id));
      const fp = normPath(folderPath);
      if (newSongs.length > 0) {
        const newFolders = dedupePaths([...prevFolders, folderPath]);
        const updated = [...prevSongs, ...newSongs];
        folderPathsRef.current = newFolders;
        songsRef.current = updated;
        setFolderPaths(newFolders);
        setSongs(updated);
        saveLibrary(updated, newFolders);
        addToast(`${newSongs.length} song${newSongs.length !== 1 ? 's' : ''} added from ${folderName}`, 'success');
      } else {
        const alreadyExists = prevFolders.some((p) => normPath(p) === fp);
        if (!alreadyExists) {
          addToast('All songs in this folder are already in your library.', 'info');
          const newFolders = dedupePaths([...prevFolders, folderPath]);
          folderPathsRef.current = newFolders;
          setFolderPaths(newFolders);
          saveLibrary(prevSongs, newFolders);
        } else {
          addToast('This folder is already in your library.', 'info');
        }
      }
    } catch (err) {
      addToast(`Failed to scan folder: ${err.message}`, 'error');
    }
    scanResultRef.current = '';
    setScanState((prev) => ({ ...prev, visible: false }));
  }, [addToast, saveLibrary, tagSongsWithRoot]);

  const handleScanFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    try {
      const scanned = await invoke('scan_files', { files });
      const scannedTagged = scanned.map((s) => ({
        ...s,
        libraryRoot: parentDir(s.filePath),
      }));
      const existingIds = new Set(songs.map((s) => s.id));
      const newSongs = scannedTagged.filter((s) => !existingIds.has(s.id));
      if (newSongs.length > 0) {
        const parentDirs = dedupePaths(newSongs.map((s) => s.libraryRoot).filter(Boolean));
        const newFolders = dedupePaths([...folderPaths, ...parentDirs]);
        const updated = [...songs, ...newSongs];
        folderPathsRef.current = newFolders;
        songsRef.current = updated;
        setSongs(updated);
        setFolderPaths(newFolders);
        saveLibrary(updated, newFolders);
        addToast(`${newSongs.length} file${newSongs.length !== 1 ? 's' : ''} added to library.`, 'success');
      } else {
        addToast('Selected files are already in your library.', 'info');
      }
    } catch (err) {
      addToast(`Failed to scan files: ${err.message}`, 'error');
    }
  }, [songs, folderPaths, addToast, saveLibrary]);

  const selectFolder = useCallback(() => {
    (async () => {
      try {
        const selected = await open({ directory: true, multiple: false, title: 'Select Music Folder' });
        if (selected) handleScanFolder(selected, true);
      } catch {
        addToast('Failed to open folder selector.', 'error');
      }
    })();
  }, [handleScanFolder, addToast]);

  const removeFolderByName = useCallback((folderName) => {
    if (!folderName) return;
    const removedCurrent = currentTrack?.folder === folderName;
    const updated = songs.filter((s) => s.folder !== folderName);
    setSongs(updated);
    songsRef.current = updated;
    saveLibrary(updated);
    if (removedCurrent) {
      setIsPlaying(false);
      audioRef.current?.pause();
      audioRef.current?.removeAttribute('src');
      playTrackNow(null, []);
    }
    addToast(`Removed "${folderName}" from library.`, 'success');
  }, [songs, currentTrack, audioRef, saveLibrary, playTrackNow, addToast]);

  const removeFolder = useCallback((folderPath) => {
    if (!folderPath) return;
    const newFolders = dedupePaths(folderPaths.filter((fp) => normPath(fp) !== normPath(folderPath)));
    const removedCurrent = currentTrack?.filePath && isUnderFolder(currentTrack.filePath, folderPath);
    const updated = songs.filter((s) => !isUnderFolder(s.filePath, folderPath));
    setFolderPaths(newFolders);
    setSongs(updated);
    songsRef.current = updated;
    folderPathsRef.current = newFolders;
    saveLibrary(updated, newFolders);
    if (removedCurrent) {
      setIsPlaying(false);
      audioRef.current?.pause();
      audioRef.current?.removeAttribute('src');
      playTrackNow(null, []);
    }
  }, [folderPaths, songs, currentTrack, saveLibrary, audioRef, playTrackNow]);

  const loadLyricsForCurrent = useCallback((song) => {
    let lines = [];
    let source = null;
    const available = [];
    const lrcLyrics = song.lyricsLrc || song.lyricsLRC || [];
    if (song.lyrics && song.lyrics.length > 0) available.push('embedded');
    if (lrcLyrics.length > 0) available.push('lrc');
    if (song.lyricsUnsynced) available.push('unsynced');
    if (lrcLyrics.length > 0 && song.lyricsSource !== 'embedded') {
      lines = lrcLyrics; source = 'lrc';
    } else if (song.lyrics && song.lyrics.length > 0) {
      lines = song.lyrics; source = 'embedded';
    } else if (lrcLyrics.length > 0) {
      lines = lrcLyrics; source = 'lrc';
    } else if (song.lyricsUnsynced) {
      lines = [{ text: song.lyricsUnsynced, time: -1 }]; source = 'unsynced';
    }
    setLyricsLines(lines); setLyricsSource(source);
    setLyricsAvailableSources(available); setLyricsOffset(0);
  }, []);

  const loadTrack = useCallback(async (track) => {
    if (!track || !track.filePath) return;
    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    const audio = audioRef.current;
    const targetVolume = Math.max(0, Math.min(1, volume / 100));
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
    audio.pause();
    setCurrentTime(0);
    lastTimeUpdateRef.current = 0;
    loadLyricsForCurrent(track);
    try {
      if (token !== playbackTokenRef.current) return;
      const src = loadAudioFile(track.filePath);
      if (!src) { addToast('Failed to load audio file.', 'error'); return; }
      audio.src = src;
      currentAudioUrlRef.current = src;
      await audio.play();
      if (token !== playbackTokenRef.current) return;
      if (restoreTimeRef.current > 0) {
        audio.currentTime = restoreTimeRef.current;
        restoreTimeRef.current = 0;
      }
      audio.volume = targetVolume;
      setIsPlaying(true);
    } catch (err) {
      console.error('loadTrack play failed:', err);
      if (token === playbackTokenRef.current) {
        audio.volume = targetVolume;
        addToast('Failed to play audio. Try again.', 'error');
      }
    }
  }, [audioRef, loadLyricsForCurrent, volume, addToast]);

  const { filteredSongs, artists, albums, folderCards } = useLibraryIndexes(songs, filter, drillFilter);

  const song = currentTrack && songIndexById.has(currentTrack.id)
    ? songs[songIndexById.get(currentTrack.id)]
    : null;

  const togglePlay = useCallback(() => {
    if (!songs.length) return;
    if (!currentTrack) {
      const first = songs.find(s => s.filePath);
      if (first) {
        playTrackNow(first, filteredSongs);
        loadTrack(first);
      }
      return;
    }
    if (audioRef.current.paused) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [songs, currentTrack, audioRef, loadTrack, playTrackNow, filteredSongs]);

  const handleNext = useCallback(() => {
    if (!currentTrack) return;
    const next = skipToNext();
    if (next) {
      loadTrack(next);
    } else {
      setIsPlaying(false);
    }
  }, [currentTrack, skipToNext, loadTrack]);

  const handlePrevious = useCallback(() => {
    if (!currentTrack) return;
    if (audioRef.current.currentTime > 3) { audioRef.current.currentTime = 0; return; }
    const prev = skipToPrevious();
    if (prev) {
      loadTrack(prev);
    }
  }, [currentTrack, skipToPrevious, loadTrack, audioRef]);

  const combinedQueue = useMemo(() => {
    const items = [];
    if (currentTrack) items.push({ song: currentTrack, type: 'current', sourceIndex: -1 });
    (explicitQueue || []).forEach((track, i) => {
      items.push({ song: track, type: 'manual', sourceIndex: i });
    });
    return items;
  }, [currentTrack, explicitQueue]);

  const playFromQueue = useCallback((combinedIndex) => {
    const items = getCombinedQueue();
    const item = items[combinedIndex];
    if (!item || item.type === 'current') return;
    jumpToTrack(item.track);
    loadTrack(item.track);
  }, [getCombinedQueue, jumpToTrack, loadTrack]);

  const handlePlayFromLibrary = useCallback((masterIdx) => {
    const track = songs[masterIdx];
    if (!track) { console.warn('handlePlayFromLibrary: no track at index', masterIdx); return; }
    playTrackNow(track, filteredSongs);
    loadTrack(track);
  }, [songs, filteredSongs, playTrackNow, loadTrack]);

  const handlePlayAll = useCallback(() => {
    if (filteredSongs.length === 0) return;
    const first = filteredSongs[0];
    const masterIdx = songIndexById.get(first.id);
    if (masterIdx != null) handlePlayFromLibrary(masterIdx);
  }, [filteredSongs, songIndexById, handlePlayFromLibrary]);

  const handleToggleFavorite = useCallback((masterIdx) => {
    setSongs(prev => {
      const u = [...prev];
      u[masterIdx] = { ...u[masterIdx], isFavorite: !u[masterIdx].isFavorite };
      return u;
    });
  }, []);

  const handleShuffleAll = useCallback(() => {
    if (filteredSongs.length === 0) return;
    const shuffled = [...filteredSongs];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playTrackNow(shuffled[0], shuffled);
    loadTrack(shuffled[0]);
  }, [filteredSongs, playTrackNow, loadTrack]);

  const currentTimeRef = useRef(0);
  const lastTimeUpdateRef = useRef(0);

  const handleTimeUpdate = useCallback((e) => {
    const a = e.currentTarget;
    const t = Math.min(a.currentTime, a.duration || Infinity);
    currentTimeRef.current = t;
    const now = Date.now();
    if (!seekingRef.current && now - lastTimeUpdateRef.current > 500) {
      lastTimeUpdateRef.current = now;
      setCurrentTime(t);
    }
  }, []);

  const handleSeekBackward = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const newTime = Math.max(0, (a.currentTime || 0) - 10);
    if (!isFinite(newTime)) return;
    seekingRef.current = true;
    a.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  const handleSeekForward = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const newTime = Math.min(a.duration || 0, (a.currentTime || 0) + 10);
    if (!isFinite(newTime)) return;
    seekingRef.current = true;
    a.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  const handleLoadedMetadata = useCallback((e) => {
    const a = e.currentTarget;
    setDuration(a.duration || 0);
    setCurrentTime(a.currentTime || 0);
    lastTimeUpdateRef.current = 0;
  }, []);

  const handleEnded = useCallback((e) => {
    const a = e.currentTarget;
    if (repeatRef.current === 'one') { a.currentTime = 0; a.play().catch(() => {}); return; }
    const next = skipToNext();
    if (next) {
      loadTrack(next);
    } else {
      setIsPlaying(false);
    }
  }, [repeatRef, skipToNext, loadTrack]);

  const handlePlay = useCallback(() => setIsPlaying(true), []);

  const handlePause = useCallback((e) => {
    setIsPlaying(false);
    setCurrentTime(Math.min(e.currentTarget.currentTime, duration || Infinity));
  }, [duration]);

  const handleError = useCallback((e) => {
    const err = e.currentTarget?.error;
    console.error('Audio playback error:', err?.message || err?.code || e.type);
  }, []);

  const handleSeeked = useCallback((e) => {
    seekingRef.current = false;
    setCurrentTime(e.currentTarget.currentTime);
  }, []);

  const mediaCtxRef = useRef(null);
  mediaCtxRef.current = { currentTrack, songs, isPlaying, audioRef, togglePlay, handlePrevious, handleNext, handleSeekForward, handleSeekBackward, setIsPlaying };
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ctx = () => mediaCtxRef.current;
    navigator.mediaSession.setActionHandler('play', () => {
      const c = ctx();
      if (!c.currentTrack && c.songs.length > 0) c.togglePlay();
      else c.audioRef.current?.play().then(() => c.setIsPlaying(true)).catch(() => {});
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      const c = ctx();
      c.audioRef.current?.pause();
      c.setIsPlaying(false);
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => ctx().handlePrevious());
    navigator.mediaSession.setActionHandler('nexttrack', () => ctx().handleNext());
    navigator.mediaSession.setActionHandler('seekforward', () => ctx().handleSeekForward());
    navigator.mediaSession.setActionHandler('seekbackward', () => ctx().handleSeekBackward());
  }, []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !song) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.name || '',
      artist: song.artist || '',
      album: song.album || '',
      artwork: song.cover
        ? [{ src: song.cover, sizes: '512x512', type: 'image/jpeg' }]
        : [],
    });
  }, [song]);

  const handleOpenNowPlaying = useCallback(() => setShowNowPlaying(true), []);
  const handleCloseNowPlaying = useCallback(() => {
    setShowNowPlaying(false);
    if (document.fullscreenElement) document.exitFullscreen();
  }, []);

const handleFavorite = useCallback(() => {
  if (!currentTrack) return;
  setSongs(prev => {
    const idx = songIndexById.get(currentTrack.id);
    if (idx == null || idx >= prev.length) return prev;
    const updated = [...prev];
    const wasFavorite = updated[idx].isFavorite;
    updated[idx] = { ...updated[idx], isFavorite: !wasFavorite };
    addToast(wasFavorite ? 'Removed from favorites' : 'Added to favorites', 'success');
    return updated;
  });
}, [currentTrack, songIndexById, addToast]);

const handleAddToQueue = useCallback((track) => {
  addToQueue(track);
  addToast(`Added "${track.name}" to queue`, 'success');
}, [addToQueue, addToast]);

const handlePlayNext = useCallback((track) => {
  playNext(track);
  addToast(`Added "${track.name}" to play next`, 'success');
}, [playNext, addToast]);

const handleSaveQueue = useCallback(() => {
  addToast('Queue saved as playlist', 'success');
}, [addToast]);

const handleJumpToCurrent = useCallback(() => {
  addToast('Jumped to current track', 'info');
}, [addToast]);

  useEffect(() => {
    const flush = () => {
      clearTimeout(saveTimerRef.current);
      persistLibrary();
    };
    window.addEventListener('beforeunload', flush);
    let unlistenClose;
    if (isTauri) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().onCloseRequested(() => { flush(); }).then((fn) => { unlistenClose = fn; });
      }).catch(() => {});
    }
    return () => {
      window.removeEventListener('beforeunload', flush);
      unlistenClose?.();
    };
  }, [persistLibrary]);

  useEffect(() => {
    if (!isTauri) return;
    let unsub;
    (async () => {
      unsub = await listen('scan-progress', (event) => {
        const data = event.payload;
        setScanState((prev) => {
          if (!prev.visible) return prev;
          switch (data.type) {
            case 'total': return { ...prev, folder: data.folder || prev.folder, total: data.count, current: 0, fileName: '' };
            case 'progress': return { ...prev, current: data.current, total: data.total, fileName: data.fileName || data.file_name || '' };
            case 'no-audio': scanResultRef.current = 'no-audio'; return { ...prev, visible: false };
            case 'error': scanResultRef.current = 'error'; return { ...prev, visible: false, cancelled: true };
            case 'complete':
            case 'cancelled':
              cancelFolderRef.current = '';
              if (data.type === 'complete') scanResultRef.current = 'complete';
              return { ...prev, cancelled: data.type === 'cancelled' };
            default: return prev;
          }
        });
      });
    })();
    return () => { if (unsub) unsub(); };
  }, [addToast]);

  useEffect(() => {
    loadVolume();
    loadLibrary();
  }, []);

  const sessionRestoredRef = useRef(false);

  useEffect(() => {
    if (songs.length === 0 || sessionRestoredRef.current) return;
    sessionRestoredRef.current = true;
    let snapshot = null;
    try { snapshot = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch {}
    if (!snapshot) return;
    const track = restoreSession(songs, snapshot);
    if (snapshot.filter && snapshot.filter !== filter) setFilter(snapshot.filter);
    if (snapshot.drillFilter) setDrillFilter(snapshot.drillFilter);
    else if (!snapshot.drillFilter && snapshot.filter === 'all') setDrillFilter(null);
    if (snapshot.isPlaying === true) setIsPlaying(true);
    if (snapshot.currentTime > 0) restoreTimeRef.current = snapshot.currentTime;
    if (track) loadTrack(track);
  }, [songs, restoreSession, loadTrack, filter]);

  const sessionSaveTimerRef = useRef(null);

  useEffect(() => {
    clearTimeout(sessionSaveTimerRef.current);
    sessionSaveTimerRef.current = setTimeout(() => {
      try {
        const existing = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
        existing.currentTime = currentTime;
        existing.isPlaying = isPlaying;
        existing.filter = filter;
        existing.drillFilter = drillFilter;
        localStorage.setItem(SESSION_KEY, JSON.stringify(existing));
      } catch {}
    }, 2000);
    return () => clearTimeout(sessionSaveTimerRef.current);
  }, [currentTime, isPlaying, filter, drillFilter]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [togglePlay]);

  useEffect(() => {
    let cancelled = false;
    extractDominantColor(song?.cover).then((color) => {
      if (!cancelled) setAlbumTheme(color);
    });
    return () => { cancelled = true; };
  }, [song?.cover]);

  const handleFilterBy = useCallback((key, value) => {
    setDrillFilter({ key, value });
    setFilter(key === 'folder' ? 'folders' : key === 'artist' ? 'artists' : key === 'album' ? 'albums' : 'all');
  }, []);

  const handleDrillBack = useCallback(() => setDrillFilter(null), []);

  return (
    <AppErrorBoundary>
    <div
      className="app-shell"
      style={{ '--accent': albumTheme.hex, '--accent-rgb': albumTheme.rgb }}
    >
      <TitleBar />
      <div style={{ display: showNowPlaying ? 'none' : 'contents' }}>
      <nav className="pivot-nav">
        {SECTION_ORDER.map((f) => (
          <button
            key={f}
            className={`pivot-item ${filter === f ? 'active' : ''}`}
            style={filter === f ? { '--accent': albumColor } : undefined}
            onClick={() => { setFilter(f); setDrillFilter(null); }}
          >
            {f === 'all' ? 'songs' : f}
          </button>
        ))}
        <button className="pivot-add-btn" onClick={selectFolder}>+ add folder</button>
      </nav>
      <div className="app-main">
{!drillFilter && (
  <Panorama activeSection={filter}>
    <LibrarySection section="all" filteredSongs={filteredSongs} onPlaySong={handlePlayFromLibrary} currentTrack={song} songIndexById={songIndexById} onToggleFavorite={handleToggleFavorite} onFilterBy={handleFilterBy} onPlayNext={handlePlayNext} onAddToQueue={handleAddToQueue} />
    <LibrarySection section="artists" artists={artists} onFilterBy={handleFilterBy} />
    <LibrarySection section="albums" albums={albums} onFilterBy={handleFilterBy} />
    <LibrarySection section="folders" folderCards={folderCards} folderPaths={folderPaths} onFilterBy={handleFilterBy} onRemoveFolderByName={removeFolderByName} />
    <LibrarySection section="favorites" filteredSongs={filteredSongs} onPlaySong={handlePlayFromLibrary} currentTrack={song} songIndexById={songIndexById} onToggleFavorite={handleToggleFavorite} onFilterBy={handleFilterBy} onPlayNext={handlePlayNext} onAddToQueue={handleAddToQueue} />
  </Panorama>
)}
{drillFilter && (
  <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
    <div className="panorama-section" style={{ width: '100vw', overflowY: 'auto' }}>
      <div className="drill-header">
        <button className="back-tile" onClick={handleDrillBack}><ChevronLeft size={20} /></button>
        <h2>{drillFilter.value}</h2>
      </div>
      <LibrarySection
        section="all"
        filteredSongs={filteredSongs}
        artists={artists}
        albums={albums}
        folderCards={folderCards}
        folderPaths={folderPaths}
        onPlaySong={handlePlayFromLibrary}
        currentTrack={song}
        songIndexById={songIndexById}
        onToggleFavorite={handleToggleFavorite}
        onFilterBy={handleFilterBy}
        onPlayNext={handlePlayNext}
        onAddToQueue={handleAddToQueue}
      />
    </div>
  </div>
)}
      </div>
      <div className="fab-actions">
        <button className="fab-btn play-all" onClick={handlePlayAll} title="Play All">
          <Play size={18} fill="currentColor" />
        </button>
        <button className="fab-btn shuffle-all" onClick={handleShuffleAll} title="Shuffle">
          <Shuffle size={18} />
        </button>
      </div>
      </div>
{showNowPlaying && (
  <div className="np-overlay">
    <NowPlaying
      currentTrack={song}
      onClose={handleCloseNowPlaying}
      queue={combinedQueue}
      queueIndex={0}
      isPlaying={isPlaying}
      onQueuePlay={playFromQueue}
      onQueueRemove={(qi) => {
        const items = getCombinedQueue();
        const item = items[qi];
        if (item && item.type === 'manual') removeFromQueue(item.sourceIndex);
      }}
      onQueueMoveUp={(qi) => {
        const items = getCombinedQueue();
        const item = items[qi];
        if (item && item.type === 'manual') moveInQueue(item.sourceIndex, item.sourceIndex - 1);
      }}
      onQueueMoveDown={(qi) => {
        const items = getCombinedQueue();
        const item = items[qi];
        if (item && item.type === 'manual') moveInQueue(item.sourceIndex, item.sourceIndex + 1);
      }}
      onQueueDragReorder={(fromQi, toQi) => {
        const items = getCombinedQueue();
        const from = items[fromQi];
        const to = items[toQi];
        if (from?.type === 'manual' && to?.type === 'manual') {
          moveInQueue(from.sourceIndex, to.sourceIndex);
        }
      }}
      onQueueClear={clearQueue}
      onSave={handleSaveQueue}
      onJump={handleJumpToCurrent}
    />
  </div>
)}
      <PlaybackBar
        syncTime={currentTime}
        duration={duration}
        volume={volume}
        isPlaying={isPlaying}
        albumColor={albumColor}
        song={song}
        onPlayPause={togglePlay}
        onPrev={handlePrevious}
        onNext={handleNext}
        onSeekBackward={handleSeekBackward}
        onSeekForward={handleSeekForward}
        onVolumeChange={handleVolumeChange}
        onShuffle={toggleShuffle}
        onRepeat={toggleRepeat}
        onFavorite={handleFavorite}
        onOpenNowPlaying={handleOpenNowPlaying}
        onOpenSettings={() => setShowSettings(true)}
        shuffle={shuffle}
        repeat={repeat}
        showNowPlaying={showNowPlaying}
      />
      <Settings visible={showSettings} settings={settings} onChange={saveSettings} onClose={() => setShowSettings(false)} />
      <FolderPicker visible={showFolderPicker} onScan={handleScanFolder} onScanFiles={handleScanFiles} onClose={() => setShowFolderPicker(false)} />
      <ScanProgress
        visible={scanState.visible}
        folder={scanState.folder}
        total={scanState.total}
        current={scanState.current}
        fileName={scanState.fileName}
        cancelled={scanState.cancelled}
        onCancel={() => {
          cancelFolderRef.current = scanState.folder;
          invoke('cancel_scan', { folderPath: scanState.folder });
        }}
      />
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={handlePlay}
        onPause={handlePause}
        onError={handleError}
        onSeeked={handleSeeked}
      />
      {ToastContainer}
    </div>
    </AppErrorBoundary>
  );
}

export default App;
