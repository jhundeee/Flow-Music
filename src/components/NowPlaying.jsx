import React, { memo } from 'react';
import { ChevronDown, Music } from 'lucide-react';
import Queue from './Queue';
import './NowPlaying.css';

const NowPlaying = memo(function NowPlaying({
  currentTrack,
  onClose,
  queue,
  queueIndex,
  isPlaying,
  onQueuePlay,
  onQueueRemove,
  onQueueMoveUp,
  onQueueMoveDown,
  onQueueClear,
  onQueueDragReorder,
}) {

  const bgStyle = currentTrack?.cover
    ? { backgroundImage: `url(${currentTrack.cover})` }
    : {};

  const coverStyle = currentTrack?.cover
    ? { backgroundImage: `url(${currentTrack.cover})` }
    : {};

  return (
    <div className="np">
      <div className="np-bg">
        {currentTrack?.cover && <div className="np-bg-art" style={bgStyle} />}
      </div>

      <div className="np-topbar">
        <div className="np-topbar-left">
          <button className="np-btn np-minimize-btn" onClick={onClose} title="Minimize">
            <ChevronDown size={20} />
          </button>
        </div>
      </div>

      <div className="np-body">
        <div className="np-left">
          <div className="np-art-wrap">
            {currentTrack?.cover && <div className="np-art-blur" style={coverStyle} />}
            <div className="np-art" style={coverStyle}>
            {!currentTrack?.cover && (
              <div className="np-art-fallback">
                <Music size={48} strokeWidth={1} opacity={0.2} />
              </div>
            )}
          </div>
          </div>
        </div>

        <div className="np-right">
          <Queue
            queue={queue}
            queueIndex={queueIndex}
            isPlaying={isPlaying}
            onPlay={onQueuePlay}
            onRemove={onQueueRemove}
            onMoveUp={onQueueMoveUp}
            onMoveDown={onQueueMoveDown}
            onClear={onQueueClear}
            onDragReorder={onQueueDragReorder}
          />
        </div>
      </div>
    </div>
  );
});

export default NowPlaying;
