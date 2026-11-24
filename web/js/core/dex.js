/**
 * La Pokédex de cada jugador (función pura, sin DOM ni localStorage).
 *
 * Cada partida terminada deja una marca en la Pokédex:
 *  - "caught" (capturado): lo reconociste.
 *  - "seen" (visto): salió, pero se te escapó.
 * Capturar es para siempre: perder después contra el mismo Pokémon no lo
 * baja a "visto". Se guarda en el navegador (app/storage.js), como las rachas.
 *
 *   { version: 1, entries: { "025": { status, date, name, art } } }
 */

export const DEX_VERSION = 1;

/** Números de la Pokédex nacional de cada generación (I a IX). */
export const GENERATION_RANGES = [
  [1, 151],
  [152, 251],
  [252, 386],
  [387, 493],
  [494, 649],
  [650, 721],
  [722, 809],
  [810, 905],
  [906, 1025],
];

export const DEX_SIZE = GENERATION_RANGES.at(-1)[1];

/** @returns {{version: number, entries: Record<string, DexEntry>}} */
export function emptyDex() {
  return { version: DEX_VERSION, entries: {} };
}

/**
 * @typedef {Object} DexEntry
 * @property {"caught" | "seen"} status
 * @property {string} date  Primer día en que se capturó (o se vio, si no se ha capturado).
 * @property {string} name
 * @property {string} [art] Ruta del arte, relativa a data/.
 */

/** Id de la Pokédex nacional: "025", "151", "1025" (como en los datos). */
export function dexId(number) {
  return String(number).padStart(3, "0");
}

/**
 * Anota el resultado de una partida.
 * @param {ReturnType<typeof emptyDex>} dex
 * @param {{id: string, won: boolean, date: string, name: string, art?: string}} game
 */
export function recordInDex(dex, { id, won, date, name, art }) {
  const old = dex.entries[id];
  if (old?.status === "caught") return dex; // ya era tuyo
  if (old && !won) return dex; // ya estaba visto: se queda la primera fecha
  const entry = { status: won ? "caught" : "seen", date, name };
  if (art) entry.art = art;
  return { ...dex, entries: { ...dex.entries, [id]: entry } };
}

/** Cuántos capturados y vistos (sin capturar) hay, en total o en un rango. */
export function dexCounts(dex, [from, to] = [1, DEX_SIZE]) {
  let caught = 0;
  let seen = 0;
  for (const [id, entry] of Object.entries(dex.entries)) {
    const n = Number(id);
    if (n < from || n > to) continue;
    if (entry.status === "caught") caught += 1;
    else seen += 1;
  }
  return { caught, seen };
}

/**
 * Casillas de una generación (índice 0 = Gen I), en orden: las que no has visto
 * van con `entry: null`.
 * @returns {{number: number, id: string, entry: DexEntry | null}[]}
 */
export function dexSlots(dex, generation) {
  const [from, to] = GENERATION_RANGES[generation];
  const slots = [];
  for (let n = from; n <= to; n++) {
    const id = dexId(n);
    slots.push({ number: n, id, entry: dex.entries[id] ?? null });
  }
  return slots;
}

/** Generación (índice 0 = Gen I) de un número de la Pokédex. */
export function generationOf(number) {
  const i = GENERATION_RANGES.findIndex(([from, to]) => number >= from && number <= to);
  return Math.max(0, i);
}

/**
 * Últimos capturados, del más reciente al más antiguo.
 * @returns {(DexEntry & {id: string})[]}
 */
export function recentCatches(dex, n) {
  return Object.entries(dex.entries)
    .filter(([, entry]) => entry.status === "caught")
    .map(([id, entry]) => ({ id, ...entry }))
    .sort((a, b) => (a.date === b.date ? Number(b.id) - Number(a.id) : a.date < b.date ? 1 : -1))
    .slice(0, n);
}
