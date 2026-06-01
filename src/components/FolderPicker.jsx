import React, { memo, useState } from 'react';
import { X, FolderOpen, Folder, ListPlus, Music } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';

const AUDIO_FILTERS = [
  { name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'ogg', 'aac', 'm4a', 'wma'] },
];

const FolderPicker = memo(function FolderPicker({
  visible,
  onScan,
  onScanFiles,
  onClose,
}) {
  const [folderPath, setFolderPath] = useState('');
  const [recursive, setRecursive] = useState(true);
  const [selectError, setSelectError] = useState('');

  if (!visible) return null;

  const handleSelectFolder = async () => {
    setSelectError('');
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Music Folder',
      });
      if (selected) setFolderPath(selected);
    } catch (err) {
      setSelectError('Failed to open folder selector.');
    }
  };

  const handleScan = () => {
    if (!folderPath) {
      setSelectError('Please select a folder first.');
      return;
    }
    onScan(folderPath, recursive);
  };

  return (
    <div className="fp-overlay">
      <div className="fp-modal">
        <div className="fp-header">
          <h3>Add to Library</h3>
          <button className="fp-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="fp-body">
          <div className="fp-section-label">Add Files</div>
          <button className="fp-select-btn" onClick={async () => {
            try {
              const selected = await open({
                multiple: true,
                filters: AUDIO_FILTERS,
                title: 'Select Audio Files',
              });
              if (selected && selected.length > 0) {
                onScanFiles(Array.isArray(selected) ? selected : [selected]);
                onClose();
              }
            } catch (err) {
              setSelectError('Failed to open file selector.');
            }
          }}>
            <Music size={20} />
            <span>Select Audio Files</span>
          </button>

          <div className="fp-divider"><span>or</span></div>

          <div className="fp-section-label">Add Folder</div>
          <button className="fp-select-btn" onClick={handleSelectFolder}>
            <FolderOpen size={20} />
            <span>Select Folder</span>
          </button>

          {folderPath && (
            <div className="fp-path">
            <Folder size={20} />
            <span className="fp-path-text">{folderPath}</span>
            </div>
          )}

          {selectError && <div className="fp-error">{selectError}</div>}

          <label className="fp-toggle">
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
            />
            <span className="fp-toggle-track">
              <span className="fp-toggle-knob" />
            </span>
            <span className="fp-toggle-label">Scan subfolders</span>
          </label>

          <div className="fp-hint">
            Common audio formats: MP3, FLAC, WAV, M4A, OGG, AAC, WMA
          </div>
        </div>

        <div className="fp-footer">
          <button className="fp-btn fp-btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="fp-btn fp-btn-primary"
            onClick={handleScan}
            disabled={!folderPath}
          >
            <ListPlus size={18} />
            <span>Add to Library</span>
          </button>
        </div>
      </div>
    </div>
  );
});

export default FolderPicker;