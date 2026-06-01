import React, { memo } from 'react';

function formatTime(sec) {
  if (sec == null || isNaN(sec) || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SmoothTime = memo(function SmoothTime({ syncTime = 0, className }) {
  return <span className={className}>{formatTime(syncTime)}</span>;
});

export default SmoothTime;
export { formatTime };
