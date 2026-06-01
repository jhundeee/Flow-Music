import React, { memo } from 'react';
import { X } from 'lucide-react';

const ScanProgress = memo(function ScanProgress({
  visible,
  folder,
  total,
  current,
  fileName,
  cancelled,
  onCancel,
}) {
  if (!visible) return null;

  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const displayFolder = folder ? folder.split(/[\\/]/).pop() : '';

  return (
    <div className="scan-bar">
      <div className="scan-bar-label">
        Scanning {displayFolder}... {current} / {total} files
        {cancelled && <span> — Cancelled</span>}
      </div>
      <div className="scan-bar-track">
        <div className="scan-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="scan-bar-bottom">
        <span className="scan-bar-file">{fileName || ''}</span>
        <button className="scan-bar-cancel" onClick={onCancel}><X size={14} /></button>
      </div>
    </div>
  );
});

export default ScanProgress;