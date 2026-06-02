import React, { memo, useMemo, useRef } from 'react';
import { ChevronUp, ChevronDown, Music, X, ListMusic, LocateFixed, ListX, ListPlus, GripVertical } from 'lucide-react';
import './Queue.css';

function formatTime(sec) {
  if (sec == null || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const QueueRow = memo(function QueueRow({
  item,
  qi,
  queueIndex,
  isPlaying,
  queueLength,
  onPlay,
  onRemove,
  onMoveUp,
  onMoveDown,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const song = item.song || item;
  const isCurrent = qi === queueIndex;
  const active = isCurrent ? ' np-queue-item--active' : '';
  const playing = isCurrent && isPlaying ? ' np-queue-item--playing' : '';
  const canMoveUp = qi > 0 && !isCurrent;
  const canMoveDown = qi < queueLength - 1 && !isCurrent;

  return (
    <div
      className={`np-queue-item${active}${playing}${draggable ? ' np-queue-item--draggable' : ''}`}
      draggable={draggable}
      onClick={() => onPlay?.(qi)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {draggable && (
        <div className="np-q-grip">
          <GripVertical size={14} />
        </div>
      )}
      <div className="np-q-move">
        {canMoveUp && (
            <button type="button" className="np-q-up" onClick={(e) => { e.stopPropagation(); onMoveUp(qi); }} title="Move up">
              <ChevronUp size={16} />
            </button>
          )}
          {canMoveDown && (
            <button type="button" className="np-q-down" onClick={(e) => { e.stopPropagation(); onMoveDown(qi); }} title="Move down">
              <ChevronDown size={16} />
            </button>
        )}
      </div>
      <div className="np-q-art" style={song.cover ? { backgroundImage: `url(${song.cover})` } : {}}>
        {!song.cover && <Music size={22} strokeWidth={1.5} />}
      </div>
      <div className="np-q-meta">
        <div className="np-q-name">{song.name}</div>
        <div className="np-q-artist">{song.artist}</div>
      </div>
      <span className="np-q-dur">{song.duration ? formatTime(song.duration) : '--:--'}</span>
      {!isCurrent && (
        <button type="button" className="np-q-remove" onClick={(e) => { e.stopPropagation(); onRemove(qi); }} title="Remove">
          <X size={14} />
        </button>
      )}
    </div>
  );
});

function Queue({ queue = [], queueIndex = -1, isPlaying = false, onPlay, onRemove, onMoveUp, onMoveDown, onClear, onSave, onJump, onDragReorder }) {
  const { current, upcoming } = useMemo(() => {
    const cur = queueIndex >= 0 && queueIndex < queue.length ? queue[queueIndex] : null;
    const rest = [];
    for (let i = 0; i < queue.length; i++) {
      if (i === queueIndex) continue;
      rest.push({ entry: queue[i], qi: i });
    }
    return { current: cur, upcoming: rest };
  }, [queue, queueIndex]);

  const dragRef = useRef(null);

  const handleDragStart = (e, qi) => {
    dragRef.current = qi;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, qi) => {
    e.preventDefault();
    const from = dragRef.current;
    if (from !== null && from !== qi) {
      onDragReorder?.(from, qi);
    }
    dragRef.current = null;
  };

  const handleDragEnd = () => {
    dragRef.current = null;
  };

  if (!queue || queue.length === 0) {
    return (
      <div className="np-queue">
        <div className="np-queue-scroll">
          <div className="np-queue-empty">
            <ListMusic size={40} strokeWidth={1} />
            <span>Queue is empty</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="np-queue">
      <div className="np-queue-header">
        <div className="np-queue-actions">
          {onJump && (
            <button type="button" className="np-q-btn" onClick={onJump} title="Jump to Current">
              <LocateFixed size={18} />
            </button>
          )}
          {onSave && (
            <button type="button" className="np-q-btn" onClick={onSave} title="Save as Playlist">
              <ListPlus size={18} />
            </button>
          )}
        </div>
      </div>
      <div className="np-queue-sticky">
        {current && (
          <QueueRow
            item={current}
            qi={queueIndex}
            queueIndex={queueIndex}
            isPlaying={isPlaying}
            queueLength={queue.length}
            onPlay={onPlay}
            onRemove={onRemove}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
          />
        )}
      </div>
      {upcoming.length > 0 && (
        <div className="np-queue-scroll">
        {upcoming.map(({ entry, qi }) => (
          <QueueRow
            key={qi}
            item={entry}
            qi={qi}
            queueIndex={queueIndex}
            isPlaying={isPlaying}
            queueLength={queue.length}
            onPlay={onPlay}
            onRemove={onRemove}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            draggable={true}
            onDragStart={(e) => handleDragStart(e, qi)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, qi)}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
      )}
      {onClear && (
        <button type="button" className="queue-clear-hanging-btn" onClick={onClear} title="Clear Queue">
          <ListX size={14} /> CLEAR QUEUE
        </button>
      )}
    </div>
  );
}

export default memo(Queue);
