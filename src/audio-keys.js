export function audioKey(text) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i += 1) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `z${(hash >>> 0).toString(36)}`;
}

export function audioPath(text) {
  const key = audioKey(text);
  return key ? `/audio/${key}.mp3` : '';
}
