export function normPath(p) {
  // Windows: normalize to lowercase, remove trailing slashes
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
