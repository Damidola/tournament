import { clone, validateTournament } from './engine.js';
const SLOTS = ['tournament-v2-a', 'tournament-v2-b'];
export const emptyDatabase = () => ({ version: 2, revision: 0, tournaments: [], history: {} });
export function checksum(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
export function validateDatabase(data) {
  if (!data || data.version !== 2 || !Array.isArray(data.tournaments) || data.tournaments.length > 100 ||
      !Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error('Это не резервная копия Турнира версии 2.');
  const db = clone(data), ids = new Set(); db.history ||= {};
  if (typeof db.history !== 'object' || Array.isArray(db.history)) throw new Error('Повреждена история турниров.');
  for (const t of db.tournaments) {
    validateTournament(t);
    if (ids.has(t.id)) throw new Error('В копии повторяются турниры.'); ids.add(t.id);
    const history = db.history[t.id] || [];
    if (!Array.isArray(history) || history.length > 30) throw new Error('Повреждена история турнира.');
    for (const item of history) {
      if (!item || typeof item.id !== 'string' || typeof item.label !== 'string' || item.label.length > 200 ||
          typeof item.at !== 'string' || item.snapshot?.id !== t.id) throw new Error('Повреждена история турнира.');
      validateTournament(item.snapshot);
    }
  }
  return db;
}
function decode(text) {
  if (!text) return null;
  try {
    const envelope = JSON.parse(text);
    if (typeof envelope.payload !== 'string' || checksum(envelope.payload) !== envelope.checksum) return null;
    return validateDatabase(JSON.parse(envelope.payload));
  } catch { return null; }
}
export function loadDatabase(storage = localStorage) {
  const records = SLOTS.map(k => decode(storage.getItem(k))).filter(Boolean).sort((a, b) => b.revision - a.revision);
  if (records.length) return records[0];
  if (SLOTS.some(k => storage.getItem(k))) throw new Error('Не удалось прочитать локальные копии. Данные сохранены в браузере; восстановите турнир из JSON.');
  return emptyDatabase();
}
export function persistDatabase(next, expectedRevision, storage = localStorage) {
  const current = loadDatabase(storage);
  if (current.revision !== expectedRevision) throw new Error('Турнир изменён в другой вкладке. Обновите страницу, прежде чем продолжать.');
  const db = validateDatabase({ ...next, revision: expectedRevision + 1 });
  const payload = JSON.stringify(db), envelope = JSON.stringify({ checksum: checksum(payload), payload });
  // Alternate slots: a failed write leaves the preceding version intact.
  const slot = SLOTS[db.revision % 2];
  try {
    storage.setItem(slot, envelope);
    if (storage.getItem(slot) !== envelope) throw new Error('Не удалось проверить сохранение.');
  } catch { throw new Error('Изменение НЕ сохранено. Хранилище недоступно или заполнено. Скачайте резервную копию и освободите место.'); }
  return db;
}
export const isStorageKey = k => SLOTS.includes(k);
export function recoverDatabase(next, storage = localStorage) {
  // Explicit recovery only: keep the other damaged slot available for forensics.
  const db = validateDatabase({ ...next, revision: 1 });
  const payload = JSON.stringify(db), text = JSON.stringify({ checksum: checksum(payload), payload });
  storage.setItem(SLOTS[1], text);
  if (storage.getItem(SLOTS[1]) !== text) throw new Error('Восстановление не сохранено. Скачайте копию файла.');
  return db;
}
