/**
 * Pasar el progreso entre navegadores y unirlo (funciones puras, sin DOM).
 *
 * El progreso son las claves guardadas en localStorage (ver app/storage.js):
 *   "<modo>:game"     partida del día de cada modo
 *   "<modo>:stats"    estadísticas de cada modo
 *   "pokedex:dex"     la Pokédex del jugador
 * Al importar no se sustituye nada: se *une* con lo que ya hay, de forma que
 * importar dos veces lo mismo, o en cualquier orden, da el mismo resultado.
 */

import { previousDate } from "./stats.js";

/** Formato de lo exportado. */
export const SYNC_VERSION = 1;

/** Lo que se puede pasar a otro navegador (las preferencias, como el idioma, no). */
export function isSyncedKey(key) {
  return /^[\w-]+:(game|stats|dex)$/.test(key);
}

// ---- Pokédex ---------------------------------------------------------------

/**
 * Une dos Pokédex: capturado gana a visto, y de cada estado se queda la primera
 * fecha (la de cuándo lo capturaste o lo viste por primera vez).
 */
export function mergeDex(a, b) {
  if (!b?.entries) return a;
  if (!a?.entries) return b;
  const entries = { ...a.entries };
  for (const [id, theirs] of Object.entries(b.entries)) {
    const mine = entries[id];
    if (!mine) entries[id] = theirs;
    else if (theirs.status !== mine.status) {
      if (theirs.status === "caught") entries[id] = theirs;
    } else if (theirs.date < mine.date) entries[id] = { ...mine, ...theirs };
  }
  return { ...a, entries };
}

// ---- Estadísticas ------------------------------------------------------------

/** Mejor de dos resultados del mismo día: acertar, y con menos intentos. */
function betterResult(x, y) {
  if (x === "fail") return y;
  if (y === "fail") return x;
  return Number(x) <= Number(y) ? x : y;
}

/** Racha de aciertos seguidos que acaba en `date`, según el historial. */
function streakEndingAt(history, date) {
  let n = 0;
  for (let d = date; history[d] !== undefined && history[d] !== "fail"; d = previousDate(d)) n += 1;
  return n;
}

/** Racha más larga del historial. */
function longestStreak(history) {
  let best = 0;
  for (const date of Object.keys(history)) {
    if (history[date] === "fail" || history[previousDate(date)] !== undefined) continue;
    // Empieza una racha: se cuenta hacia delante desde aquí.
    let n = 0;
    let d = date;
    while (history[d] !== undefined && history[d] !== "fail") {
      n += 1;
      const [y, m, day] = d.split("-").map(Number);
      d = new Date(Date.UTC(y, m - 1, day + 1)).toISOString().slice(0, 10);
    }
    best = Math.max(best, n);
  }
  return best;
}

/** Lo que unas estadísticas cuentan aparte de su historial (partidas de antes de tenerlo). */
function untracked(stats) {
  const history = stats.history ?? {};
  const distribution = { ...stats.distribution };
  let won = stats.won;
  for (const result of Object.values(history)) {
    distribution[result] = Math.max(0, (distribution[result] ?? 0) - 1);
    if (result !== "fail") won -= 1;
  }
  return {
    played: Math.max(0, stats.played - Object.keys(history).length),
    won: Math.max(0, won),
    distribution,
  };
}

const maxDate = (x, y) => (x && y ? (x > y ? x : y) : (x ?? y ?? null));

/**
 * Une las estadísticas de dos navegadores. Los días que están en el historial
 * de los dos cuentan una vez (con el mejor resultado); las partidas antiguas,
 * de antes de que hubiera historial, se suman tal cual.
 */
export function mergeStats(a, b) {
  if (!b) return a;
  if (!a) return b;
  const history = { ...(a.history ?? {}) };
  for (const [date, result] of Object.entries(b.history ?? {})) {
    history[date] = history[date] === undefined ? result : betterResult(history[date], result);
  }
  const oldA = untracked(a);
  const oldB = untracked(b);
  const distribution = {};
  for (const key of new Set([...Object.keys(a.distribution), ...Object.keys(b.distribution)])) {
    distribution[key] = (oldA.distribution[key] ?? 0) + (oldB.distribution[key] ?? 0);
  }
  for (const result of Object.values(history)) distribution[result] = (distribution[result] ?? 0) + 1;
  const results = Object.values(history);

  const lastPlayedDate = maxDate(a.lastPlayedDate, b.lastPlayedDate);
  const lastWonDate = maxDate(a.lastWonDate, b.lastWonDate);
  let currentStreak = 0;
  if (lastWonDate && !(lastPlayedDate > lastWonDate && history[lastPlayedDate] === "fail")) {
    // Con historial se recalcula; si no, la del navegador que ganó ese día.
    const own = [a, b].filter((s) => s.lastWonDate === lastWonDate).map((s) => s.currentStreak);
    currentStreak = Math.max(streakEndingAt(history, lastWonDate), ...own);
  }
  return {
    ...a,
    played: oldA.played + oldB.played + results.length,
    won: oldA.won + oldB.won + results.filter((r) => r !== "fail").length,
    distribution,
    currentStreak,
    maxStreak: Math.max(a.maxStreak, b.maxStreak, longestStreak(history), currentStreak),
    lastPlayedDate,
    lastWonDate,
    history,
  };
}

// ---- Partida del día -------------------------------------------------------------

/**
 * La partida que se queda: la del día más reciente; si son del mismo día, la
 * acabada antes que la que va a medias, y entre dos a medias, la más avanzada.
 */
export function mergeGame(a, b) {
  if (!b) return a;
  if (!a) return b;
  if (a.date !== b.date) return a.date > b.date ? a : b;
  const done = (g) => g.status !== "playing";
  if (done(a) !== done(b)) return done(a) ? a : b;
  if (done(a)) return a;
  return (b.attempts?.length ?? 0) > (a.attempts?.length ?? 0) ? b : a;
}

// ---- Todo junto -------------------------------------------------------------------

/**
 * Une el progreso de este navegador con el importado.
 * @param {Record<string, any>} local  clave -> valor
 * @param {Record<string, any>} incoming
 * @returns {Record<string, any>} Solo las claves que cambian.
 */
export function mergeProgress(local, incoming) {
  const changed = {};
  for (const [key, theirs] of Object.entries(incoming)) {
    if (!isSyncedKey(key)) continue;
    const mine = local[key];
    const kind = key.split(":").at(-1);
    const merged =
      kind === "dex" ? mergeDex(mine, theirs) : kind === "stats" ? mergeStats(mine, theirs) : mergeGame(mine, theirs);
    if (JSON.stringify(merged) !== JSON.stringify(mine)) changed[key] = merged;
  }
  return changed;
}
