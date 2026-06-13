export function normPath(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

export function isUnderFolder(filePath, folderPath) {
  if (!filePath || !folderPath) return false;
  const f = normPath(filePath);
  const d = normPath(folderPath);
  return f === d || f.startsWith(`${d}/`);
}

export function parentDir(filePath) {
  if (!filePath) return null;
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return idx >= 0 ? filePath.slice(0, idx) : filePath;
}

