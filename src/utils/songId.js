function songIdFromPath(filePath) {
  if (!filePath) return null;
  if (filePath.startsWith('blob:')) return filePath;
  const bytes = new TextEncoder().encode(filePath);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Reassign ids from filePath and drop duplicate entries. */
export function normalizeSongs(songs) {
  const byId = new Map();
  for (const song of songs) {
    const id = songIdFromPath(song.filePath) || song.id;
    if (!id) continue;
    if (!byId.has(id)) {
      byId.set(id, { ...song, id });
    }
  }
  return [...byId.values()];
}
