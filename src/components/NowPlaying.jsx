import React, { memo, useState, useEffect, useRef } from 'react';
import { ChevronDown, Minus, Square, X, Music } from 'lucide-react';
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
  const [appWindow, setAppWindow] = useState(null);
  const [maximized, setMaximized] = useState(false);
  const unsubRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        if (cancelled) return;
        const win = getCurrentWebviewWindow();
        setAppWindow(win);
        const max = await win.isMaximized();
        if (!cancelled) setMaximized(max);
        const fn = await win.onResized(async () => {
          const m = await win.isMaximized();
          if (!cancelled) setMaximized(m);
        });
        unsubRef.current = fn;
      } catch (_) {}
    })();
    return () => { cancelled = true; unsubRef.current?.(); };
  }, []);

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
        <div className="np-topbar-right">
          {appWindow && (
            <div className="tb-controls">
              <button className="tb-ctrl" onClick={() => appWindow.minimize()} aria-label="Minimize"><Minus size={14} /></button>
              <button className="tb-ctrl" onClick={() => appWindow.toggleMaximize()} aria-label={maximized ? 'Restore' : 'Maximize'}>
                {maximized ? (
                  <span className="tb-restore-icon"><span className="tb-restore-back" /><span className="tb-restore-front" /></span>
                ) : (
                  <Square size={12} />
                )}
              </button>
              <button className="tb-ctrl tb-close" onClick={() => appWindow.close()} aria-label="Close"><X size={14} /></button>
            </div>
          )}
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
