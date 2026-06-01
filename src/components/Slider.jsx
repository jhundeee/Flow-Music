import React, { memo } from 'react';
import './Slider.css';

const Slider = memo(function Slider({ value, min = 0, max = 100, onChange, accentColor = 'var(--accent)' }) {
  const percentage = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <input
      type="range"
      className="custom-slider"
      min={min}
      max={max}
      value={value}
      onChange={onChange}
      style={{
        background: `linear-gradient(to right, ${accentColor} ${percentage}%, rgba(255, 255, 255, 0.2) ${percentage}%)`,
        '--thumb-color': accentColor,
        '--slider-glow': 'rgba(108, 92, 231, 0.55)',
      }}
    />
  );
});

export default Slider;
