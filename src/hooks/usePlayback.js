import { useState, useCallback, useRef, useEffect } from 'react';

const SESSION_KEY = 'splayer_session';
const REPEAT_MODES = ['off', 'all', 'one'];

function asArray(tracks) {
  if (!tracks) return [];
  return Array.isArray(tracks) ? tracks.filter(Boolean) : [tracks].filter(Boolean);
}

function normTrackPath(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
}

function sameTrack(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.id && b.id && a.id === b.id) return true;
  if (a.filePath && b.filePath) {
    return normTrackPath(a.filePath) === normTrackPath(b.filePath);
  }
  return false;
}

function findTrackIndex(tracks, track) {
  if (!track) return -1;
  return tracks.findIndex((candidate) => sameTrack(candidate, track));
}

function hashString(value) {
  let hash = 2166136261;
  const input = String(value || '');
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed || 1;
  return () => {
    value = Math.imul(value ^ (value >>> 15), 1 | value);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicShuffle(tracks, seedSource) {
  const shuffled = [...tracks];
  const random = seededRandom(hashString(seedSource));
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function sourceQueueAfter(sourceTracks, currentTrack) {
  if (!currentTrack || sourceTracks.length === 0) return [];
  const idx = findTrackIndex(sourceTracks, currentTrack);
  if (idx < 0) return [];
  return sourceTracks.slice(idx + 1);
}

function refsFromTracks(tracks) {
  return tracks.map((track) => (
    track ? { id: track.id, filePath: track.filePath } : null
  )).filter(Boolean);
}

function buildCombinedQueue(currentTrack, queue) {
  const items = [];
  if (currentTrack) {
    items.push({ track: currentTrack, type: 'current', sourceIndex: -1 });
  }
  queue.forEach((track, index) => {
    items.push({ track, type: 'manual', sourceIndex: index });
  });
  return items;
}

// QueueState contract:
// currentTrack is stored separately, queue contains only upcoming tracks,
// history is independent, and sourceTracks is read-only metadata for repeat-all.
export function usePlayback() {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [repeatMode, setRepeatMode] = useState('off');
  const [sourceTracks, setSourceTracks] = useState([]);
  const [playNextCount, setPlayNextCount] = useState(0);

  const repeatRef = useRef(repeatMode);
  repeatRef.current = repeatMode;

  const stateRef = useRef(null);
  stateRef.current = {
    currentTrack,
    queue,
    history,
    shuffleEnabled,
    repeatMode,
    sourceTracks,
    playNextCount,
  };

  const saveTimerRef = useRef(null);

  useEffect(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const state = stateRef.current;
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          version: 2,
          currentTrack: state.currentTrack ? { id: state.currentTrack.id, filePath: state.currentTrack.filePath } : null,
          queue: refsFromTracks(state.queue),
          history: refsFromTracks(state.history),
          shuffle: state.shuffleEnabled,
          repeat: state.repeatMode,
          sourceTracks: refsFromTracks(state.sourceTracks),
          playNextCount: state.playNextCount,

          // Kept for compatibility with older saved sessions.
          userQueue: refsFromTracks(state.queue),
          playbackContext: refsFromTracks(state.sourceTracks),
          contextIndex: findTrackIndex(state.sourceTracks, state.currentTrack),
          originalContextOrder: [],
          autoplayTracks: [],
        }));
      } catch {}
    }, 1000);
    return () => clearTimeout(saveTimerRef.current);
  }, [currentTrack, queue, history, shuffleEnabled, repeatMode, sourceTracks, playNextCount]);

  const playTrackNow = useCallback((track, contextArray = []) => {
    const source = asArray(contextArray);
    const sourceIndex = findTrackIndex(source, track);
    const upcoming = sourceIndex >= 0 ? source.slice(sourceIndex + 1) : [];

    setCurrentTrack(track || null);
    setQueue(upcoming);
    setHistory([]);
    setSourceTracks(sourceIndex >= 0 ? source : asArray(track));
    setPlayNextCount(0);
  }, []);

  const addToQueue = useCallback((tracks) => {
    const nextTracks = asArray(tracks);
    if (nextTracks.length === 0) return;
    setQueue((prev) => [...prev, ...nextTracks]);
  }, []);

  const playNext = useCallback((tracks) => {
    const nextTracks = asArray(tracks);
    if (nextTracks.length === 0) return;
    setQueue((prev) => [...nextTracks, ...prev]);
    setPlayNextCount((count) => count + nextTracks.length);
  }, []);

  const removeFromQueue = useCallback((indexOrTrack) => {
    const state = stateRef.current;
    const removeIndex = typeof indexOrTrack === 'number'
      ? indexOrTrack
      : findTrackIndex(state.queue, indexOrTrack);
    if (removeIndex < 0 || removeIndex >= state.queue.length) return;

    setQueue((prev) => {
      if (removeIndex < 0 || removeIndex >= prev.length) return prev;
      return prev.filter((_, index) => index !== removeIndex);
    });
    setPlayNextCount((count) => {
      return removeIndex < count ? Math.max(0, count - 1) : count;
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
    setPlayNextCount(0);
  }, []);

  const moveInQueue = useCallback((from, to) => {
    setQueue((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);
      return updated;
    });
    setPlayNextCount((count) => {
      if (from >= count && to >= count) return count;
      if (from < count && to < count) return count;
      if (from < count && to >= count) return Math.max(0, count - 1);
      if (from >= count && to < count) return count + 1;
      return count;
    });
  }, []);

  const resolveRepeatAllTrack = useCallback((state) => {
    if (state.sourceTracks.length === 0 || !state.currentTrack) return null;
    const currentIndex = findTrackIndex(state.sourceTracks, state.currentTrack);
    const nextIndex = currentIndex >= 0
      ? (currentIndex + 1) % state.sourceTracks.length
      : 0;
    return state.sourceTracks[nextIndex] || null;
  }, []);

  const skipToNext = useCallback(() => {
    const state = stateRef.current;

    if (state.repeatMode === 'one') {
      return state.currentTrack;
    }

    let nextTrack = state.queue[0] || null;
    let nextQueue = state.queue.slice(1);
    let nextPlayNextCount = Math.max(0, state.playNextCount - 1);

    if (!nextTrack && state.repeatMode === 'all') {
      nextTrack = resolveRepeatAllTrack(state);
      nextQueue = sourceQueueAfter(state.sourceTracks, nextTrack);
      nextPlayNextCount = 0;
    }

    if (!nextTrack) return null;

    if (state.currentTrack) {
      setHistory((prev) => [...prev, state.currentTrack]);
    }
    setCurrentTrack(nextTrack);
    setQueue(nextQueue);
    setPlayNextCount(nextPlayNextCount);
    return nextTrack;
  }, [resolveRepeatAllTrack]);

  const skipToPrevious = useCallback(() => {
    const state = stateRef.current;
    if (state.history.length === 0) return null;

    const previousTrack = state.history[state.history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    if (state.currentTrack) {
      setQueue((prev) => [state.currentTrack, ...prev]);
    }
    setCurrentTrack(previousTrack);
    setPlayNextCount((count) => count + (state.currentTrack ? 1 : 0));
    return previousTrack;
  }, []);

  const jumpToTrack = useCallback((trackOrIndex) => {
    const state = stateRef.current;
    const selectedIndex = typeof trackOrIndex === 'number'
      ? trackOrIndex
      : findTrackIndex(state.queue, trackOrIndex);
    if (selectedIndex < 0 || selectedIndex >= state.queue.length) return null;

    const selectedTrack = state.queue[selectedIndex];
    const beforeSelected = state.queue.slice(0, selectedIndex);
    const afterSelected = state.queue.slice(selectedIndex + 1);

    if (state.currentTrack) {
      setHistory((prev) => [...prev, state.currentTrack]);
    }
    setCurrentTrack(selectedTrack);
    setQueue([...beforeSelected, ...afterSelected]);
    setPlayNextCount((count) => {
      if (selectedIndex < count) return Math.max(0, count - 1);
      return Math.min(count, state.queue.length - 1);
    });
    return selectedTrack;
  }, []);

  const toggleShuffle = useCallback(() => {
    const state = stateRef.current;
    const nextShuffle = !state.shuffleEnabled;
    setShuffleEnabled(nextShuffle);

    if (!nextShuffle) return;

    setQueue((prev) => [
      ...prev.slice(0, state.playNextCount),
      ...deterministicShuffle(
        prev.slice(state.playNextCount),
        `${state.currentTrack?.id || state.currentTrack?.filePath || 'none'}:${prev.length}`,
      ),
    ]);
  }, []);

  const toggleRepeat = useCallback(() => {
    setRepeatMode((mode) => REPEAT_MODES[(REPEAT_MODES.indexOf(mode) + 1) % REPEAT_MODES.length]);
  }, []);

  const hasUpcomingSong = useCallback(() => {
    const state = stateRef.current;
    if (state.repeatMode === 'one') return Boolean(state.currentTrack);
    if (state.queue.length > 0) return true;
    return state.repeatMode === 'all' && state.sourceTracks.length > 0;
  }, []);

  const handleEnded = useCallback(() => {
    if (repeatRef.current === 'one') return 'repeat-one';
    return skipToNext() ? 'continue' : 'stop';
  }, [skipToNext]);

  const getCombinedQueue = useCallback(() => buildCombinedQueue(
    stateRef.current.currentTrack,
    stateRef.current.queue,
  ), []);

  const getSessionSnapshot = useCallback(() => {
    const state = stateRef.current;
    return {
      version: 2,
      currentTrack: state.currentTrack ? { id: state.currentTrack.id, filePath: state.currentTrack.filePath } : null,
      queue: refsFromTracks(state.queue),
      history: refsFromTracks(state.history),
      shuffle: state.shuffleEnabled,
      repeat: state.repeatMode,
      sourceTracks: refsFromTracks(state.sourceTracks),
      playNextCount: state.playNextCount,
    };
  }, []);

  const restoreSession = useCallback((songs, snapshot) => {
    if (!songs || !snapshot) return null;
    const find = (ref) => ref ? songs.find((song) => sameTrack(song, ref)) || null : null;
    const findArr = (refs) => asArray(refs).map(find).filter(Boolean);

    const restoredCurrent = find(snapshot.currentTrack);
    const restoredQueue = snapshot.queue
      ? findArr(snapshot.queue)
      : findArr(snapshot.userQueue);
    const restoredSource = snapshot.sourceTracks
      ? findArr(snapshot.sourceTracks)
      : findArr(snapshot.playbackContext);

    setCurrentTrack(restoredCurrent);
    setQueue(restoredQueue);
    setHistory(findArr(snapshot.history));
    setSourceTracks(restoredSource);
    setShuffleEnabled(snapshot.shuffle === true);
    setRepeatMode(typeof snapshot.repeat === 'string' ? snapshot.repeat : 'off');
    setPlayNextCount(Math.max(0, Math.min(snapshot.playNextCount || 0, restoredQueue.length)));
    return restoredCurrent;
  }, []);

  return {
    history,
    currentTrack,
    explicitQueue: queue,
    sourceTracks,
    sourceIndex: findTrackIndex(sourceTracks, currentTrack),
    autoplayTracks: [],
    shuffle: shuffleEnabled,
    repeat: repeatMode,
    repeatRef,
    upcomingCount: queue.length,
    playTrackNow,
    playNext,
    addToQueue,
    removeFromQueue,
    clearQueue,
    moveInQueue,
    skipToNext,
    skipToPrevious,
    jumpToTrack,
    handleEnded,
    hasUpcomingSong,
    toggleShuffle,
    toggleRepeat,
    getCombinedQueue,
    getSessionSnapshot,
    restoreSession,
  };
}
