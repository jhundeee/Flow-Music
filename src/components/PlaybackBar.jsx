import React, { memo, useRef, useCallback } from 'react';
import { Heart, Shuffle, SkipBack, Pause, Play, SkipForward, Repeat, Repeat1, Rewind, FastForward, VolumeX, Volume1, Volume2, ArrowUp, Music } from 'lucide-react';

function fmtTime(s) {
  if (!s || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const PlaybackBar = memo(function PlaybackBar({
  syncTime = 0,
  duration = 0,
  volume = 80,
  isPlaying = false,
  onPlayPause,
  onPrev,
  onNext,
  onSeekBackward,
  onSeekForward,
  onVolumeChange,
  onShuffle,
  onRepeat,
  onFavorite,
  onOpenNowPlaying,
  song,
  shuffle: isShuffled,
  repeat: repeatMode,
  showNowPlaying,
}) {
  const displayTime = Math.min(syncTime, duration);
  const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0;
  const volRef = useRef(null);

  const handleVolClick = useCallback((e) => {
    const rect = volRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = (e.clientX - rect.left) / rect.width;
    onVolumeChange({ target: { value: Math.round(Math.max(0, Math.min(pct * 100, 100))) } });
  }, [onVolumeChange]);

  return (
    <div
      className="bottom-player-wrapper"
      style={{ '--progress-percent': `${progressPercent}%` }}
    >
      <div className="player-left-deck">
        <div className="pb-art-wrap" onClick={(e) => { e.stopPropagation(); onOpenNowPlaying(); }}>
          {song?.cover ? (
            <div className="pb-art" style={{ backgroundImage: `url(${song.cover})` }} />
          ) : (
            <div className="pb-art-fallback"><Music size={22} strokeWidth={1.5} /></div>
          )}
          {!showNowPlaying && (
            <div className="pb-art-overlay" onClick={(e) => { e.stopPropagation(); onOpenNowPlaying(); }}>
              <ArrowUp size={20} strokeWidth={2.5} />
            </div>
          )}
        </div>
        <div className="pb-meta">
          <div className="pb-title">{song?.name || 'no song selected'}</div>
          <div className="pb-artist">{song?.artist || ''}</div>
        </div>
      </div>

      <div className="player-center-deck">
        <button className={`player-icon-btn ${isShuffled ? 'active' : ''}`} onClick={onShuffle} title="Shuffle"><Shuffle size={18} /></button>
        <button className="player-icon-btn" onClick={onPrev} title="Previous"><SkipBack size={18} /></button>
        <button className="player-icon-btn" onClick={onSeekBackward} title="Seek Backward 10s"><Rewind size={18} /></button>
        <button className="player-icon-btn play-btn" onClick={onPlayPause} title={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
        </button>
        <button className="player-icon-btn" onClick={onSeekForward} title="Seek Forward 10s"><FastForward size={18} /></button>
        <button className="player-icon-btn" onClick={onNext} title="Next"><SkipForward size={18} /></button>
        <button className={`player-icon-btn ${repeatMode && repeatMode !== 'off' ? 'active' : ''}`} onClick={onRepeat} title={repeatMode === 'one' ? 'Repeat One' : 'Repeat All'}>
          {repeatMode === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
        </button>
      </div>

      <div className="player-right-deck">
        <span className="pb-time">{fmtTime(displayTime)} / {fmtTime(duration)}</span>
        <button
          className="player-icon-btn"
          onClick={(e) => { e.stopPropagation(); onFavorite(); }}
          style={{ color: song?.isFavorite ? '#E51400' : undefined }}
        >
          <Heart size={16} fill={song?.isFavorite ? '#E51400' : 'none'} />
        </button>
        <div className="pb-vol">
          <span className="pb-vol-icon">
            {volume <= 0 ? <VolumeX size={16} /> : volume < 50 ? <Volume1 size={16} /> : <Volume2 size={16} />}
          </span>
          <div className="pb-vol-bar" ref={volRef} onClick={handleVolClick}>
            <div className="pb-vol-fill" style={{ width: `${volume}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
});

export default PlaybackBar;
