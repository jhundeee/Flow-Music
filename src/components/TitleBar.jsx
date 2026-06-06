import { Minus, Square, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const [appWindow, setAppWindow] = useState(null);
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

  return (
    <div className="title-bar" data-tauri-drag-region>
      <span className="tb-label">flow music</span>
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
  );
}