import { useMemo } from 'react';

const collator = new Intl.Collator('en', { sensitivity: 'base' });

export function useLibraryIndexes(songs, filter, drillFilter) {
  const { artists, albums, folderCards } = useMemo(() => {
    const artistMap = new Map();
    const albumMap = new Map();
    const folderMap = new Map();

    const invalidFolders = new Set(['', 'unknown', 'unknown album', 'unknown artist']);
    const inferFolder = (s) => {
      const folder = s.folder ? s.folder.trim().toLowerCase() : '';
      if (folder && !invalidFolders.has(folder)) return s.folder.trim();
      if (!s.filePath || s.filePath.startsWith('blob:')) return 'Unknown';
      const normal = s.filePath.replace(/\\/g, '/');
      const parts = normal.split('/');
      return parts.length >= 2 ? parts[parts.length - 2] : 'Unknown';
    };

    for (const s of songs) {
      const artistName = s.artist || 'Unknown Artist';
      let a = artistMap.get(artistName);
      if (!a) {
        a = { name: artistName, count: 0, cover: null };
        artistMap.set(artistName, a);
      }
      a.count += 1;
      // Artists intentionally skip cover propagation — album art should not be used as artist photo

      const albumName = s.album || 'Unknown Album';
      let al = albumMap.get(albumName);
      if (!al) {
        al = { name: albumName, artist: artistName, count: 0, cover: null, artists: new Set() };
        albumMap.set(albumName, al);
      }
      al.artists.add(artistName);
      al.artist = [...al.artists].slice(0, 3).join(', ') + (al.artists.size > 3 ? '...' : '');
      al.count += 1;
      if (!al.cover && s.cover) al.cover = s.cover;

      const folderName = inferFolder(s);
      let folder = folderMap.get(folderName);
      if (!folder) {
        folder = { name: folderName, count: 0, cover: null };
        folderMap.set(folderName, folder);
      }
      folder.count += 1;
      if (!folder.cover && s.cover) folder.cover = s.cover;
    }

    return {
      artists: [...artistMap.values()].sort((a, b) => collator.compare(a.name, b.name)),
      albums: [...albumMap.values()].sort((a, b) => collator.compare(a.name, b.name)),
      folderCards: [...folderMap.values()].sort((a, b) => collator.compare(a.name, b.name)),
    };
  }, [songs]);

  const filteredSongs = useMemo(() => {
    let filtered;
    if (drillFilter) {
      if (drillFilter.key === 'folder') {
        filtered = songs.filter((s) => s.folder === drillFilter.value);
      } else {
        filtered = songs.filter((s) => s[drillFilter.key] === drillFilter.value);
      }
    } else if (filter === 'favorites') {
      filtered = songs.filter((s) => s.isFavorite);
    } else {
      filtered = songs;
    }
    if (filter === 'all' || filter === 'favorites' || drillFilter) {
      return filtered.slice().sort((a, b) => collator.compare(a.name, b.name));
    }
    return filtered;
  }, [songs, filter, drillFilter]);

  return { filteredSongs, artists, albums, folderCards };
}
