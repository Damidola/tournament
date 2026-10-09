import { clone, validateTournament } from './engine.js';
const SLOTS = ['tournament-v2-a', 'tournament-v2-b'];
export const emptyDatabase = () => ({ version: 2, revision: 0, tournaments: [], history: {}, localPlayers: [], playerLists: [], savedTeams: [] });
export function checksum(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
export function validateDatabase(data) {
  if (!data || data.version !== 2 || !Array.isArray(data.tournaments) || data.tournaments.length > 100 ||
      !Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error('Це не резервна копія Турніру версії 2.');
  const db = clone(data), ids = new Set(); db.history ||= {};
  db.localPlayers ||= []; db.playerLists ||= []; db.savedTeams ||= [];
  for (const items of [db.localPlayers, db.playerLists, db.savedTeams]) {
    if (!Array.isArray(items) || items.length > 5000) throw new Error('Пошкоджено каталог гравців.');
    const seen = new Set();
    for (const item of items) {
      if (!item || typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(item.id) || seen.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100) throw new Error('Пошкоджено профіль або список гравців.');
      seen.add(item.id);
      if (items === db.localPlayers) for (const key of ['rating', 'rapidElo', 'blitzElo']) if (item[key] != null && (!Number.isInteger(item[key]) || item[key] < 0 || item[key] > 3500)) throw new Error('Пошкоджено рейтинг гравця.');
      if (items !== db.localPlayers && (!Array.isArray(item.players) || item.players.some(id => !db.localPlayers.some(p => p.id === id)))) throw new Error('У списку є невідомий гравець.');
    }
  }
  if (typeof db.history !== 'object' || Array.isArray(db.history)) throw new Error('Пошкоджено історію турнірів.');
  db.tournaments=db.tournaments.map(validateTournament);
  for (const t of db.tournaments) {
    if (ids.has(t.id)) throw new Error('У копії повторюються турніри.'); ids.add(t.id);
    const history = db.history[t.id] || [];
    if (!Array.isArray(history) || history.length > 30) throw new Error('Пошкоджено історію турніру.');
    for (const item of history) {
      if (!item || typeof item.id !== 'string' || typeof item.label !== 'string' || item.label.length > 200 ||
          typeof item.at !== 'string' || item.snapshot?.id !== t.id) throw new Error('Пошкоджено історію турніру.');
      item.snapshot=validateTournament(item.snapshot);
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
  if (SLOTS.some(k => storage.getItem(k))) throw new Error('Не вдалося прочитати локальні копії. Дані збережено в браузері; відновіть турнір із JSON.');
  return emptyDatabase();
}
export function persistDatabase(next, expectedRevision, storage = localStorage) {
  const current = loadDatabase(storage);
  if (current.revision !== expectedRevision) throw new Error('Турнір змінено в іншій вкладці. Оновіть сторінку, перш ніж продовжити.');
  const db = validateDatabase({ ...next, revision: expectedRevision + 1 });
  const payload = JSON.stringify(db), envelope = JSON.stringify({ checksum: checksum(payload), payload });
  // Alternate slots: a failed write leaves the preceding version intact.
  const slot = SLOTS[db.revision % 2];
  try {
    storage.setItem(slot, envelope);
    if (storage.getItem(slot) !== envelope) throw new Error('Не вдалося перевірити збереження.');
  } catch { throw new Error('Зміни НЕ збережено. Сховище недоступне або заповнене. Завантажте резервну копію та звільніть місце.'); }
  return db;
}
export const isStorageKey = k => SLOTS.includes(k);
export function recoverDatabase(next, storage = localStorage) {
  // Explicit recovery only: keep the other damaged slot available for forensics.
  const db = validateDatabase({ ...next, revision: 1 });
  const payload = JSON.stringify(db), text = JSON.stringify({ checksum: checksum(payload), payload });
  storage.setItem(SLOTS[1], text);
  if (storage.getItem(SLOTS[1]) !== text) throw new Error('Відновлення не збережено. Завантажте копію файлу.');
  return db;
}
