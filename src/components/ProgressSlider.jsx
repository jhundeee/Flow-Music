import React, { memo } from 'react';
import './Slider.css';

const ProgressSlider = memo(function ProgressSlider({
  value = 0,
  duration = 0,
  accentColor = 'var(--accent)',
  onSeekInput,
  onSeekEnd,
}) {
  const max = duration > 0 ? duration : 100;
  const pct = max > 0 ? (value / max) * 100 : 0;

  return (
    <input
      type="range"
      className="custom-slider custom-slider--progress"
      min={0}
      max={max}
      step={0.05}
      value={value}
      onInput={(e) => onSeekInput?.(parseFloat(e.target.value))}
      onChange={(e) => onSeekEnd?.(parseFloat(e.target.value))}
      style={{
        background: `linear-gradient(to right, ${accentColor} ${pct}%, rgba(255, 255, 255, 0.18) ${pct}%)`,
        '--thumb-color': accentColor,
        '--slider-glow': `${accentColor}99`,
      }}
    />
  );
});

export default ProgressSlider;
