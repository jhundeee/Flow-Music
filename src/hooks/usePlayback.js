import { useState, useCallback, useRef, useEffect } from 'react';

const SESSION_KEY = 'splayer_session';

function fisherYatesShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function usePlayback() {
  const [playbackHistory, setPlaybackHistory] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [userQueue, setUserQueue] = useState([]);
  const [playbackContext, setPlaybackContext] = useState([]);
  const [contextIndex, setContextIndex] = useState(-1);
  const [originalContextOrder, setOriginalContextOrder] = useState([]);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off');
  const [autoplayTracks, setAutoplayTracks] = useState([]);

  const repeatRef = useRef(repeat);
  repeatRef.current = repeat;

  const saveTimerRef = useRef(null);

  const snapRef = useRef(null);
  snapRef.current = { playbackHistory, userQueue, playbackContext, contextIndex, originalContextOrder, shuffle, repeat, autoplayTracks, currentTrack };

  useEffect(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const s = snapRef.current;
      const toRef = (t) => t ? { id: t.id, filePath: t.filePath } : null;
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          version: 1,
          history: s.playbackHistory.map(toRef),
          userQueue: s.userQueue.map(toRef),
          playbackContext: s.playbackContext.map(toRef),
          contextIndex: s.contextIndex,
          shuffle: s.shuffle,
          repeat: s.repeat,
          originalContextOrder: s.originalContextOrder.map(toRef),
          autoplayTracks: s.autoplayTracks.map(toRef),
          currentTrack: toRef(s.currentTrack),
        }));
      } catch {}
    }, 1000);
    return () => clearTimeout(saveTimerRef.current);
  }, [playbackHistory, userQueue, playbackContext, contextIndex, shuffle, repeat, originalContextOrder, autoplayTracks, currentTrack]);

  const findIn = useCallback((arr, track) => {
    let idx = arr.indexOf(track);
    if (idx < 0 && track) {
      idx = arr.findIndex(t => t.id === track.id || t.filePath === track.filePath);
    }
    return idx;
  }, []);

  const upcomingCount =
    userQueue.length +
    Math.max(0, playbackContext.length - 1 - contextIndex) +
    autoplayTracks.length;

  const playTrackNow = useCallback((track, contextArray) => {
    let idx = contextArray.indexOf(track);
    if (idx < 0 && track) {
      idx = contextArray.findIndex(t => t.id === track.id || t.filePath === track.filePath);
    }
    setPlaybackHistory([]);
    setUserQueue([]);
    setAutoplayTracks([]);
    setPlaybackContext(contextArray);
    setContextIndex(idx >= 0 ? idx : 0);
    setCurrentTrack(track);
    setOriginalContextOrder([]);
  }, []);

  const playNext = useCallback((track) => {
    setUserQueue(prev => [track, ...prev]);
  }, []);

  const addToQueue = useCallback((track) => {
    setUserQueue(prev => [...prev, track]);
  }, []);

  const removeFromQueue = useCallback((qi) => {
    setUserQueue(prev => prev.filter((_, i) => i !== qi));
  }, []);

  const clearQueue = useCallback(() => {
    setUserQueue([]);
  }, []);

  const moveInQueue = useCallback((from, to) => {
    if (to < 0) return;
    setUserQueue(prev => {
      if (to >= prev.length) return prev;
      const updated = [...prev];
      const [moved] = updated.splice(from, 1);
      updated.splice(to, 0, moved);
      return updated;
    });
  }, []);

  const resolveNextTrack = useCallback(() => {
    if (userQueue.length > 0) {
      const [first, ...rest] = userQueue;
      setUserQueue(rest);
      return first;
    }

    const nextIdx = contextIndex + 1;
    if (nextIdx < playbackContext.length) {
      setContextIndex(nextIdx);
      return playbackContext[nextIdx];
    }

    if (repeatRef.current === 'all' && playbackContext.length > 0) {
      setContextIndex(0);
      return playbackContext[0];
    }

    if (autoplayTracks.length > 0) {
      const [first, ...rest] = autoplayTracks;
      setAutoplayTracks(rest);
      return first;
    }

    return null;
  }, [userQueue, contextIndex, playbackContext, autoplayTracks]);

  const skipToNext = useCallback(() => {
    if (repeatRef.current === 'one') {
      return currentTrack;
    }

    const next = resolveNextTrack();
    if (next) {
      if (currentTrack) {
        setPlaybackHistory(prev => [...prev, currentTrack]);
      }
      setCurrentTrack(next);
    }
    return next || null;
  }, [currentTrack, resolveNextTrack]);

  const skipToPrevious = useCallback(() => {
    if (playbackHistory.length === 0) return null;

    const prevTrack = playbackHistory[playbackHistory.length - 1];
    setPlaybackHistory(h => h.slice(0, -1));

    if (currentTrack) {
      setUserQueue(prev => [currentTrack, ...prev]);
    }

    setCurrentTrack(prevTrack);

    const idx = findIn(playbackContext, prevTrack);
    if (idx >= 0) setContextIndex(idx);

    return prevTrack;
  }, [playbackHistory, currentTrack, playbackContext, findIn]);

  const handleEnded = useCallback(() => {
    if (repeatRef.current === 'one') return 'repeat-one';
    const next = skipToNext();
    return next ? 'continue' : 'stop';
  }, [skipToNext]);

  const hasUpcomingSong = useCallback(() => {
    if (repeatRef.current === 'one') return true;
    if (userQueue.length > 0) return true;
    if (contextIndex < playbackContext.length - 1) return true;
    if (repeatRef.current === 'all' && playbackContext.length > 0) return true;
    if (autoplayTracks.length > 0) return true;
    return false;
  }, [userQueue.length, contextIndex, playbackContext.length, autoplayTracks.length]);

  const toggleShuffle = useCallback(() => {
    setShuffle(s => {
      const next = !s;
      if (next) {
        setOriginalContextOrder([...playbackContext]);
        if (playbackContext.length > 1 && currentTrack) {
          const others = playbackContext.filter(t => t.id !== currentTrack.id && t.filePath !== currentTrack.filePath);
          const shuffled = fisherYatesShuffle(others);
          setPlaybackContext([currentTrack, ...shuffled]);
          setContextIndex(0);
        }
      } else if (originalContextOrder.length > 0) {
        setPlaybackContext(originalContextOrder);
        const idx = currentTrack ? findIn(originalContextOrder, currentTrack) : -1;
        setContextIndex(idx >= 0 ? idx : 0);
        setOriginalContextOrder([]);
      }
      return next;
    });
  }, [playbackContext, currentTrack, originalContextOrder, findIn]);

  const toggleRepeat = useCallback(() => {
    setRepeat(r => {
      const modes = ['off', 'all', 'one'];
      return modes[(modes.indexOf(r) + 1) % modes.length];
    });
  }, []);

  const getCombinedQueue = useCallback(() => {
    const items = [];
    if (currentTrack) {
      items.push({ track: currentTrack, type: 'current', sourceIndex: -1 });
    }
    userQueue.forEach((track, i) => {
      items.push({ track, type: 'manual', sourceIndex: i });
    });
    if (repeatRef.current !== 'one') {
      for (let i = contextIndex + 1; i < playbackContext.length; i++) {
        items.push({ track: playbackContext[i], type: 'auto', sourceIndex: i });
      }
      autoplayTracks.forEach((track, i) => {
        items.push({ track, type: 'autoplay', sourceIndex: i });
      });
    }
    return items;
  }, [currentTrack, userQueue, contextIndex, playbackContext, autoplayTracks]);

  const jumpToTrack = useCallback((track) => {
    if (!track) return null;

    if (currentTrack) {
      setPlaybackHistory(prev => [...prev, currentTrack]);
    }

    const eqIdx = findIn(userQueue, track);
    if (eqIdx >= 0) {
      setUserQueue(prev => prev.filter((_, i) => i !== eqIdx));
    } else {
      const srcIdx = findIn(playbackContext, track);
      if (srcIdx >= 0) {
        setContextIndex(srcIdx);
      }
    }

    setCurrentTrack(track);
    return track;
  }, [currentTrack, userQueue, playbackContext, findIn]);

  const getSessionSnapshot = useCallback(() => {
    const toRef = (t) => t ? { id: t.id, filePath: t.filePath } : null;
    return {
      version: 1,
      history: playbackHistory.map(toRef),
      userQueue: userQueue.map(toRef),
      playbackContext: playbackContext.map(toRef),
      contextIndex,
      shuffle,
      repeat,
      originalContextOrder: originalContextOrder.map(toRef),
      autoplayTracks: autoplayTracks.map(toRef),
      currentTrack: toRef(currentTrack),
    };
  }, [playbackHistory, userQueue, playbackContext, contextIndex, shuffle, repeat, originalContextOrder, autoplayTracks, currentTrack]);

  const restoreSession = useCallback((songs, snapshot) => {
    if (!songs || !snapshot) return;
    const find = (ref) => ref ? songs.find(s => s.id === ref.id || s.filePath === ref.filePath) || null : null;
    const findArr = (arr) => (arr || []).map(find).filter(Boolean);
    setPlaybackHistory(findArr(snapshot.history));
    setUserQueue(findArr(snapshot.userQueue));
    setPlaybackContext(findArr(snapshot.playbackContext));
    setAutoplayTracks(findArr(snapshot.autoplayTracks));
    setOriginalContextOrder(findArr(snapshot.originalContextOrder));
    setContextIndex(typeof snapshot.contextIndex === 'number' ? snapshot.contextIndex : -1);
    setShuffle(snapshot.shuffle === true);
    setRepeat(typeof snapshot.repeat === 'string' ? snapshot.repeat : 'off');
    const track = find(snapshot.currentTrack);
    setCurrentTrack(track);
    return track;
  }, []);

  return {
    history: playbackHistory,
    currentTrack,
    explicitQueue: userQueue,
    sourceTracks: playbackContext,
    sourceIndex: contextIndex,
    autoplayTracks,
    shuffle,
    repeat,
    repeatRef,
    upcomingCount,
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
