import React, { memo } from 'react';
import { X } from 'lucide-react';

const Settings = memo(function Settings({ visible, settings, onChange, onClose }) {
  if (!visible) return null;

  const handleToggle = (key) => {
    onChange({ ...settings, [key]: !settings[key] });
  };

  const handleDuration = (e) => {
    onChange({ ...settings, crossfadeDuration: parseFloat(e.target.value) });
  };

  const durationProgress = ((settings.crossfadeDuration - 1) / 9) * 100;

  return (
    <div className="fp-overlay" onClick={onClose}>
      <div className="fp-modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fp-header">
          <h3>Settings</h3>
          <button className="fp-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="fp-body">
          <div className="fp-toggle-row">
            <div className="fp-toggle-label-text">
              <span className="fp-toggle-title">Crossfade</span>
              <span className="fp-toggle-desc">Smooth transition between songs</span>
            </div>
            <label className="fp-toggle">
              <input
                type="checkbox"
                checked={settings.crossfade}
                onChange={() => handleToggle('crossfade')}
              />
              <span className="fp-toggle-track">
                <span className="fp-toggle-knob" />
              </span>
            </label>
          </div>

          {settings.crossfade && (
            <div className="fp-slider-row">
              <div className="fp-slider-header">
                <span className="fp-slider-label">Duration</span>
                <span className="fp-slider-value">{settings.crossfadeDuration}s</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={settings.crossfadeDuration}
                onChange={handleDuration}
                className="fp-duration-slider"
                style={{ '--progress': `${durationProgress}%` }}
                onInput={(e) => {
                  const slider = e.target;
                  const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
                  slider.style.setProperty('--progress', pct + '%');
                }}
              />
              <div className="fp-slider-labels">
                <span>1s</span>
                <span>10s</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default Settings;
