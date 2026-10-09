import { RESULTS, statistics, teamStatistics, isTeamSystem } from './engine.js';

// The app uses the same Material icon glyphs as the Android reference.
const materialNames = {
  account: 'account_circle', cloud: 'cloud_upload', sun: 'light_mode',
  shield: 'privacy_tip', star: 'star', share: 'share', bars: 'bar_chart', globe: 'language'
};
const solidIcon = name => `<span class="icon material-icon native-solid-icon" aria-hidden="true">${materialNames[name] || materialNames.bars}</span>`;
const chevron = '<span class="icon material-icon native-chevron" aria-hidden="true">chevron_right</span>';

export function renderAccount({ button, esc, theme = 'light' }) {
  const themes = { light: 'Світла тема', dark: 'Темна тема', system: 'Як на пристрої' };
  return `<section class="account-screen native-screen">
    <section class="native-card account-card">
      <div class="account-card-heading"><span class="account-avatar">${solidIcon('account')}</span><div><h2>Обліковий запис</h2><p>Вхід не виконано</p></div><span class="account-status-icon">${solidIcon('account')}</span></div>
      ${button('google-signin', '<img class="google-logo" src="./assets/google.png" alt=""><span>Увійти через Google</span>', 'account-google')}
    </section>
    <section class="native-card cloud-card">
      <h2>${solidIcon('cloud')}<span>Хмарна резервна копія</span></h2>
      <p>Зберігайте турніри, гравців і дані застосунку в підключеному хмарному обліковому записі, щоб відновити їх на іншому пристрої.</p>
      ${button('cloud-backup', solidIcon('account') + '<span class="cloud-button-label">Увійдіть, щоб використовувати хмарну копію</span>', 'primary account-backup-button')}
    </section>
    ${button('theme-choose', `<span class="account-setting-icon">${solidIcon('sun')}</span><span class="account-setting-text"><strong>Тема</strong><span>${esc(themes[theme] || themes.light)}</span></span>${chevron}`, 'native-card theme-card')}
  </section>`;
}

export function renderInfo({ button }) {
  return `<section class="info-screen native-screen">${[
    ['privacy', 'shield', 'Політика конфіденційності'],
    ['app-about', 'star', 'Оцініть застосунок на 5 зірок!'],
    ['share-app', 'share', 'Поділитися застосунком']
  ].map(([action, symbol, text]) => button(action, solidIcon(symbol) + `<span>${text}</span>`, 'native-card info-row')).join('')}</section>`;
}

const playedResults = new Set(['1-0', '½-½', '0-1']);
const normalizedName = value => String(value || '').trim().normalize('NFKC').toLocaleLowerCase('uk-UA');

export function collectStatistics(db) {
  const tournaments = (db.tournaments || []).filter(t => !t.demo);
  const directory = new Map((db.localPlayers || []).map(p => [p.id, p]));
  const names = new Map((db.localPlayers || []).map(p => [normalizedName(p.name), p.id]));
  const players = new Map(), teams = new Map();
  let games = 0, draws = 0, teamGames = 0, teamDraws = 0;
  function person(map, p, team = false) {
    const localId = !team && (p.localPlayerId || names.get(normalizedName(p.name)));
    const key = localId ? 'profile:' + localId : 'name:' + normalizedName(p.name);
    if (!map.has(key)) map.set(key, { key, name: directory.get(localId)?.name || p.name, localPlayerId: localId || null, wins: 0, draws: 0, losses: 0, played: 0, tournamentWins: 0, eloGain: 0, eloTotal: 0, tournaments: [] });
    return map.get(key);
  }
  for (const t of tournaments) {
    const byId = new Map((t.players || []).map(p => [p.id, person(players, p)]));
    for (const p of t.players || []) {
      const row = byId.get(p.id), history = p.eloHistory || [];
      const gain = history.length ? history.reduce((sum, h) => sum + Number(h.change || 0), 0) : t.mode === 'advanced' ? Number(p.rating || 0) - Number(p.initialRating ?? p.rating ?? 0) : 0;
      row.eloGain = Math.max(row.eloGain, gain);
      row.eloTotal += gain;
      row.tournaments.push({ id: t.id, name: t.name, status: t.status, wins: 0, draws: 0, losses: 0, played: 0, eloGain: gain, winner: false });
    }
    for (const round of t.rounds || []) for (const match of round.matches || []) for (const game of match.boards || [match]) {
      if (!game.black || !playedResults.has(game.result)) continue;
      const a = byId.get(game.white), b = byId.get(game.black);
      if (!a || !b) continue;
      games++;
      if (game.result === '½-½') draws++;
      for (const [row, score] of [[a, RESULTS[game.result][0]], [b, RESULTS[game.result][1]]]) {
        const entry = row.tournaments.at(-1), metric = score === 1 ? 'wins' : score === .5 ? 'draws' : 'losses';
        row.played++; row[metric]++; entry.played++; entry[metric]++;
      }
    }
    if (isTeamSystem(t.system)) {
      const rows = teamStatistics(t);
      teamGames += rows.reduce((sum, p) => sum + p.played, 0) / 2;
      teamDraws += rows.reduce((sum, p) => sum + p.draws, 0) / 2;
      for (const p of rows) {
        const row = person(teams, p, true), winner = t.status === 'finished' && p.rank === 1;
        for (const field of ['played', 'wins', 'draws', 'losses']) row[field] += p[field];
        if (winner) row.tournamentWins++;
        row.tournaments.push({ id: t.id, name: t.name, status: t.status, played: p.played, wins: p.wins, draws: p.draws, losses: p.losses, winner, eloGain: 0 });
      }
    } else if (t.status === 'finished' && t.players?.length) {
      const champion = statistics(t)[0], row = byId.get(champion?.id);
      if (row) { row.tournamentWins++; row.tournaments.at(-1).winner = true; }
    }
  }
  return {
    players: [...players.values()].sort((a, b) => a.name.localeCompare(b.name, 'uk')),
    teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name, 'uk')),
    overview: { tournaments: tournaments.length, participants: players.size, games, draws },
    teamOverview: { tournaments: tournaments.filter(t => isTeamSystem(t.system)).length, participants: teams.size, games: teamGames, draws: teamDraws }
  };
}

const recordLabels = {
  wins: 'Найбільше перемог', draws: 'Найбільше нічиїх',
  tournamentWins: 'Найбільше перемог у турнірах', eloGain: 'Найкращий приріст Elo'
};
const recordLeaders = (rows, metric) => {
  const value = Math.max(0, ...rows.map(p => Number(p[metric]) || 0));
  return { value, leaders: value > 0 ? rows.filter(p => p[metric] === value) : [] };
};

export function renderStatistics(db, { button, esc, fmt, kind = 'players' }) {
  const data = collectStatistics(db), team = kind === 'teams', rows = team ? data.teams : data.players;
  const overview = team ? data.teamOverview : data.overview;
  const metrics = team ? ['wins', 'draws', 'tournamentWins'] : ['wins', 'draws', 'tournamentWins', 'eloGain'];
  return `<section class="statistics-screen native-screen"><h2 class="stats-section-heading">Огляд</h2>
    <div class="stats-overview">${[['tournaments', 'Турніри'], ['participants', team ? 'Команди' : 'Учасники'], ['games', team ? 'Матчі' : 'Партії'], ['draws', 'Нічиї']].map(([field, title]) => `<div class="native-card stats-tile"><h3>${title}</h3><strong>${fmt(overview[field])}</strong></div>`).join('')}</div>
    <div class="stats-kind-tabs">${button('stats-kind', 'Гравці', kind === 'players' ? 'primary selected' : '', 'data-kind="players" aria-pressed="' + (kind === 'players') + '"')}${button('stats-kind', 'Команди', team ? 'primary selected' : '', 'data-kind="teams" aria-pressed="' + team + '"')}</div>
    <h2 class="stats-section-heading stats-records-heading">Рекорди</h2><div class="stats-records">${metrics.map(metric => {
      const { value, leaders } = recordLeaders(rows, metric);
      const name = leaders.length === 1 ? leaders[0].name : leaders.length ? 'Спільний рекорд' : 'Ще немає результатів';
      const preview = leaders.length > 1 ? `<small data-user-content>${esc(leaders.slice(0, 2).map(p => p.name).join(', '))}${leaders.length > 2 ? ', +' + (leaders.length - 2) : ''}</small>` : '';
      return button('stats-record', `<span class="stats-record-icon">${solidIcon('bars')}</span><span class="stats-record-copy"><span class="stats-record-title">${recordLabels[metric]}</span><strong ${leaders.length === 1 ? 'data-user-content' : ''}>${esc(name)}</strong>${preview}</span><strong class="stats-record-value">${fmt(value)}</strong>${chevron}`, 'native-card stats-record', `data-kind="${team ? 'teams' : 'players'}" data-metric="${metric}"`);
    }).join('')}</div>
    ${rows.length ? `<details class="stats-all-players"><summary>${team ? 'Команди' : 'Гравці'}</summary><div class="stats-participants">${rows.map(p => button('stats-profile', `<span class="stats-participant-name" data-user-content>${esc(p.name)}</span><span class="stats-participant-games">${fmt(p.played)} ${team ? 'матчів' : 'партій'}</span>${chevron}`, 'native-card stats-participant', `data-kind="${team ? 'teams' : 'players'}" data-name="${esc(p.name)}"`)).join('')}</div></details>` : ''}
  </section>`;
}

export function renderStatisticsRecord(db, { button, esc, fmt, kind = 'players', metric = 'wins' }) {
  const data = collectStatistics(db), rows = kind === 'teams' ? data.teams : data.players;
  const { value, leaders } = recordLeaders(rows, metric);
  return `<div class="stats-record-detail"><p class="stats-record-detail-value">${fmt(value)}</p>${leaders.length ? leaders.map(p => button('stats-profile', `<span data-user-content>${esc(p.name)}</span>${chevron}`, 'native-card stats-detail-person', `data-kind="${kind === 'teams' ? 'teams' : 'players'}" data-name="${esc(p.name)}"`)).join('') : '<p>Рекордів ще немає. Внесіть результати партій у турнірі.</p>'}</div>`;
}

export function renderStatisticsProfile(db, { button, esc, fmt, kind = 'players', name }) {
  const data = collectStatistics(db), row = (kind === 'teams' ? data.teams : data.players).find(p => p.name === name);
  if (!row) return '<p>Учасника не знайдено.</p>';
  return `<div class="stats-profile-detail"><div class="stats-overview">${[['played', kind === 'teams' ? 'Матчі' : 'Партії'], ['wins', 'Перемоги'], ['draws', 'Нічиї'], ['losses', 'Поразки']].map(([field, title]) => `<div class="native-card stats-tile"><h3>${title}</h3><strong>${fmt(row[field])}</strong></div>`).join('')}</div><p>Перемоги у турнірах: <strong>${fmt(row.tournamentWins)}</strong></p>${kind !== 'teams' ? `<p>Найкращий приріст Elo: <strong>+${fmt(row.eloGain)}</strong></p>` : ''}<h3>Турніри</h3>${row.tournaments.map(t => button('open', `<span data-user-content>${esc(t.name)}</span><small>${t.winner ? 'Переможець · ' : ''}${fmt(t.wins)} перемог · ${fmt(t.draws)} нічиїх</small>${chevron}`, 'native-card stats-profile-tournament', `data-id="${esc(t.id)}"`)).join('')}</div>`;
}
