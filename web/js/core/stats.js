/**
 * Estadísticas del jugador: partidas, aciertos, rachas y distribución.
 *
 * Funciones puras sobre un objeto JSON plano (lo guarda storage.js).
 *
 * Racha: días *consecutivos* del calendario acertados. Si un día no se juega
 * o se falla, la racha vuelve a 0.
 */

export const STATS_VERSION = 1;

/**
 * @typedef {Object} Stats
 * @property {number} version
 * @property {number} played
 * @property {number} won
 * @property {number} currentStreak
 * @property {number} maxStreak
 * @property {Record<string, number>} distribution  "1".."6" y "fail"
 * @property {string | null} lastPlayedDate  "YYYY-MM-DD" del último puzzle registrado
 * @property {string | null} lastWonDate
 */

/**
 * @param {number} maxAttempts
 * @returns {Stats}
 */
export function emptyStats(maxAttempts = 6) {
  const distribution = { fail: 0 };
  for (let i = 1; i <= maxAttempts; i++) distribution[String(i)] = 0;
  return {
    version: STATS_VERSION,
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
    distribution,
    lastPlayedDate: null,
    lastWonDate: null,
  };
}

/**
 * Día anterior a una fecha "YYYY-MM-DD" (en calendario, sin zonas horarias).
 * @param {string} date
 */
export function previousDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * Registra el resultado de una partida terminada.
 * Si ese día ya estaba registrado, no cambia nada (evita contar dos veces).
 *
 * @param {Stats} stats
 * @param {{date: string, won: boolean, attemptsUsed: number}} result
 * @returns {Stats}
 */
export function recordResult(stats, { date, won, attemptsUsed }) {
  if (stats.lastPlayedDate !== null && date <= stats.lastPlayedDate) return stats;

  const key = won ? String(attemptsUsed) : "fail";
  const distribution = { ...stats.distribution, [key]: (stats.distribution[key] ?? 0) + 1 };
  const continues = won && stats.lastWonDate === previousDate(date);
  const currentStreak = won ? (continues ? stats.currentStreak + 1 : 1) : 0;

  return {
    ...stats,
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    currentStreak,
    maxStreak: Math.max(stats.maxStreak, currentStreak),
    distribution,
    lastPlayedDate: date,
    lastWonDate: won ? date : stats.lastWonDate,
  };
}

/**
 * Racha que se debe mostrar hoy: si el último acierto fue antes de ayer, la
 * racha ya está rota aunque no se haya registrado ninguna partida desde entonces.
 *
 * @param {Stats} stats
 * @param {string} today "YYYY-MM-DD"
 */
export function displayedStreak(stats, today) {
  if (!stats.lastWonDate) return 0;
  const alive = stats.lastWonDate === today || stats.lastWonDate === previousDate(today);
  return alive ? stats.currentStreak : 0;
}

/**
 * Porcentaje de partidas ganadas (0-100, entero).
 * @param {Stats} stats
 */
export function winRate(stats) {
  return stats.played === 0 ? 0 : Math.round((100 * stats.won) / stats.played);
}
