export function normPath(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function isUnderFolder(filePath, folderPath) {
  if (!filePath || !folderPath) return false;
  const f = normPath(filePath);
  const d = normPath(folderPath);
  return f === d || f.startsWith(`${d}/`);
}

export function filterSongsForFolders(songs, folderPaths) {
  const browser = songs.filter((s) => s.filePath?.startsWith('blob:'));
  const managed = songs.filter((s) => {
    if (!s.filePath || s.filePath.startsWith('blob:')) return false;
    return folderPaths.some((fp) => isUnderFolder(s.filePath, fp));
  });
  return [...browser, ...managed];
}

export function parentDir(filePath) {
  if (!filePath) return null;
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return idx >= 0 ? filePath.slice(0, idx) : filePath;
}

export function collectLibraryRoots(songs) {
  const roots = [];
  for (const s of songs) {
    if (s.libraryRoot && typeof s.libraryRoot === 'string') roots.push(s.libraryRoot);
  }
  return roots;
}

