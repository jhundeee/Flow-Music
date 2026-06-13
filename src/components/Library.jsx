import React, { memo } from 'react';
import { Music, Heart, ChevronLeft, X, SkipForward, ListPlus } from 'lucide-react';

function fmtTime(s) {
  if (!s || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const accentColors = [
  '#1BA1E2', '#825A9E', '#60A917', '#FA6800', '#00ABA9',
  '#E51400', '#E5148C', '#8CBF26', '#76608A', '#647687',
];

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) & 0x7fffffff;
  return accentColors[h % accentColors.length];
}

/* ─── Song Row ─── */
const SongTileRow = memo(function SongTileRow({ track, rowIndex, isActive, onPlay, onToggleFavorite, showIndex, onPlayNext, onAddToQueue }) {
  return (
    <div
      className={`song-tile-row${isActive ? ' active' : ''}`}
      onClick={onPlay}
    >
      <span className="tile-index">{showIndex ? rowIndex + 1 : ''}</span>
      {track.cover ? (
        <div className="tile-thumb" style={{ backgroundImage: `url(${track.cover})` }} />
      ) : (
        <div className="tile-thumb-icon"><Music size={18} strokeWidth={1.5} /></div>
      )}
      <div className="tile-text">
        <div className="tt-title">{track.name || 'Unknown'}</div>
        <div className="tt-artist">{track.artist || ''}</div>
      </div>
      <div className="tile-actions">
        <button
          className="tile-fav"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        >
          {track.isFavorite ? <Heart size={14} fill="#E51400" color="#E51400" /> : <Heart size={14} />}
        </button>
        <button
          className="tile-queue-next"
          onClick={(e) => { e.stopPropagation(); onPlayNext(track); }}
          title="Play Next"
        >
          <SkipForward size={14} />
        </button>
        <button
          className="tile-queue-add"
          onClick={(e) => { e.stopPropagation(); onAddToQueue(track); }}
          title="Add to Queue"
        >
          <ListPlus size={14} />
        </button>
      </div>
      <span className="tile-dur">{track.duration ? fmtTime(track.duration) : ''}</span>
    </div>
  );
});

/* ─── Tile Card ─── */
function TileCard({ item, accent, onClick, onRemove }) {
  const color = item.cover ? undefined : (accent || hashColor(item.name));
  return (
    <div className="tile" onClick={onClick} style={item.cover ? {} : { backgroundColor: color }}>
      {item.cover && <div className="tile-cover" style={{ backgroundImage: `url(${item.cover})` }} />}
      {item.cover && <div className="tile-overlay" />}
      <div className="tile-title">{item.name}</div>
      <div className="tile-sub">{item.count} {item.count === 1 ? 'song' : 'songs'}</div>
      {onRemove && (
        <button className="tile-remove" onClick={(e) => { e.stopPropagation(); onRemove(item.name); }} title="Remove folder">
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/* ─── Section: Songs ─── */
function SongsSection({ songs, currentTrack, songIndexById, onPlaySong, onToggleFavorite, showIndex, onPlayNext, onAddToQueue }) {
  if (!songs.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Music size={32} strokeWidth={1} /></div>
        <div className="empty-text">no songs yet</div>
      </div>
    );
  }
  return (
    <div className="song-tile-list">
      {songs.map((track, i) => {
        const isActive = currentTrack && (track.id === currentTrack.id || track.filePath === currentTrack.filePath);
        const masterIdx = songIndexById?.get(track.id) ?? -1;
        return (
          <SongTileRow
            key={track.id || track.filePath || i}
            track={track}
            rowIndex={i}
            isActive={isActive}
            showIndex={showIndex}
            onPlay={() => masterIdx >= 0 && onPlaySong(masterIdx)}
            onToggleFavorite={() => masterIdx >= 0 && onToggleFavorite(masterIdx)}
            onPlayNext={onPlayNext}
            onAddToQueue={onAddToQueue}
          />
        );
      })}
    </div>
  );
}

/* ─── Section: Artists ─── */
function ArtistsSection({ artists, onFilterBy }) {
  if (!artists?.length) {
    return <div className="empty-state"><div className="empty-icon"><Music size={32} strokeWidth={1} /></div><div className="empty-text">no artists</div></div>;
  }
  return (
    <div className="tile-grid">
      {artists.map((a) => (
        <TileCard key={a.name} item={a} onClick={() => onFilterBy('artist', a.name)} />
      ))}
    </div>
  );
}

/* ─── Section: Albums ─── */
function AlbumsSection({ albums, onFilterBy }) {
  if (!albums?.length) {
    return <div className="empty-state"><div className="empty-icon"><Music size={32} strokeWidth={1} /></div><div className="empty-text">no albums</div></div>;
  }
  return (
    <div className="tile-grid">
      {albums.map((a) => (
        <TileCard key={a.name} item={a} accent="var(--accent-green)" onClick={() => onFilterBy('album', a.name)} />
      ))}
    </div>
  );
}

/* ─── Section: Folders ─── */
function FoldersSection({ folderCards, onFilterBy, onRemoveFolderByName }) {
  if (!folderCards?.length) {
    return <div className="empty-state"><div className="empty-icon"><Music size={32} strokeWidth={1} /></div><div className="empty-text">no folders — add one above</div></div>;
  }
  return (
    <div className="tile-grid">
      {folderCards.map((f) => (
        <TileCard key={f.name} item={f} accent="var(--accent-orange)" onClick={() => onFilterBy('folder', f.name)} onRemove={onRemoveFolderByName} />
      ))}
    </div>
  );
}

/* ─── Main Library ─── */
const Library = memo(function Library({
  songs,
  filter,
  drillFilter,
  filteredSongs,
  artists,
  albums,
  folderCards,
  onPlaySong,
  currentTrack,
  songIndexById,
  onToggleFavorite,
  onFilterBy,
  onDrillBack,
  folderPaths,
  onPlayNext,
  onAddToQueue,
}) {
  if (drillFilter) {
    return (
      <div className="panorama-section" style={{ width: '100vw', overflowY: 'auto' }}>
        <div className="drill-header">
          <button className="back-tile" onClick={onDrillBack}><ChevronLeft size={20} /></button>
          <h2 style={{ textTransform: 'uppercase' }}>{drillFilter.value}</h2>
        </div>
        <SongsSection
          songs={filteredSongs}
          currentTrack={currentTrack}
          songIndexById={songIndexById}
          onPlaySong={onPlaySong}
          onToggleFavorite={onToggleFavorite}
          showIndex
          onPlayNext={onPlayNext}
          onAddToQueue={onAddToQueue}
        />
      </div>
    );
  }
  if (!songs.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Music size={32} strokeWidth={1} /></div>
        <div className="empty-text">add a folder to get started</div>
      </div>
    );
  }
  return null;
});

/* ─── Individual Panorama Section ─── */
const LibrarySection = memo(function LibrarySection({ section, filteredSongs, artists, albums, folderCards, folderPaths, onPlaySong, currentTrack, songIndexById, onToggleFavorite, onFilterBy, onRemoveFolderByName, onPlayNext, onAddToQueue }) {
  switch (section) {
    case 'all':
      return (
        <SongsSection
          songs={filteredSongs}
          currentTrack={currentTrack}
          songIndexById={songIndexById}
          onPlaySong={onPlaySong}
          onToggleFavorite={onToggleFavorite}
          showIndex
          onPlayNext={onPlayNext}
          onAddToQueue={onAddToQueue}
        />
      );
    case 'artists':
      return <ArtistsSection artists={artists} onFilterBy={onFilterBy} />;
    case 'albums':
      return <AlbumsSection albums={albums} onFilterBy={onFilterBy} />;
    case 'folders':
      return <FoldersSection folderCards={folderCards} folderPaths={folderPaths} onFilterBy={onFilterBy} onRemoveFolderByName={onRemoveFolderByName} />;
    case 'favorites':
      return (
        <SongsSection
          songs={filteredSongs}
          currentTrack={currentTrack}
          songIndexById={songIndexById}
          onPlaySong={onPlaySong}
          onToggleFavorite={onToggleFavorite}
          showIndex
          onPlayNext={onPlayNext}
          onAddToQueue={onAddToQueue}
        />
      );
    default:
      return null;
  }
});

export { LibrarySection };
export default Library;
