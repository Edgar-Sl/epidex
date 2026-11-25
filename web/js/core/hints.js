/**
 * Pistas: datos del Pokémon que el jugador puede pedir (una por partida, al azar).
 *
 * Cada puzzle trae las suyas en `puzzle.hints` (las genera
 * pipeline/pokemon_collections.py): tipo, categoría de la Pokédex, fase
 * evolutiva, habilidad y color (que además pinta la silueta).
 * Aquí se decide el orden, cuál toca al pedirla (al azar) y cómo se lee cada una; los textos de la
 * interfaz se pasan desde fuera (app/i18n.js) para que esto siga siendo puro.
 */

/**
 * Pistas que pueden tocar (una al azar). Los puzzles antiguos traen otras
 * (tamaño, inicial...): se siguen sabiendo leer en `hintText` por las partidas
 * ya guardadas, pero ya no se dan.
 */
export const HINT_KINDS = ["type", "genus", "stage", "ability", "tint"];

/**
 * Pista del color: la silueta se rellena con el color del Pokémon (los 10 de
 * PokeAPI), en tonos que se distinguen sobre la pantalla verde.
 */
export const TINTS = {
  black: "#2d2d34",
  blue: "#3b74d6",
  brown: "#8a5a32",
  gray: "#8b8f96",
  green: "#3f9b46",
  pink: "#ef8fc0",
  purple: "#8d5cc4",
  red: "#d8413a",
  white: "#f7f7f2",
  yellow: "#f2c81e",
};

/** Generación -> [número romano, región en español, región en inglés]. */
const GENERATIONS = {
  1: ["I", "Kanto", "Kanto"],
  2: ["II", "Johto", "Johto"],
  3: ["III", "Hoenn", "Hoenn"],
  4: ["IV", "Sinnoh", "Sinnoh"],
  5: ["V", "Teselia", "Unova"],
  6: ["VI", "Kalos", "Kalos"],
  7: ["VII", "Alola", "Alola"],
  8: ["VIII", "Galar", "Galar"],
  9: ["IX", "Paldea", "Paldea"],
};

/**
 * Pistas que tiene este puzzle, en orden.
 * @param {{hints?: Record<string, unknown>}} puzzle
 * @returns {string[]}
 */
export function availableHints(puzzle) {
  const hints = puzzle?.hints ?? {};
  return HINT_KINDS.filter((kind) => hints[kind] !== undefined && hints[kind] !== null);
}

/**
 * Pista que toca al pedirla: una al azar entre las disponibles.
 *
 * El azar sale de `seed` (puzzle y fecha), así que es la misma para todo el
 * mundo ese día y no cambia al recargar la página.
 *
 * @param {string[]} kinds Pistas disponibles (`availableHints`).
 * @param {string} seed
 * @returns {string | null}
 */
export function pickHint(kinds, seed) {
  if (!kinds.length) return null;
  let hash = 2166136261; // FNV-1a de 32 bits
  for (const ch of seed) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return kinds[(hash >>> 0) % kinds.length];
}

/**
 * Texto de una pista, listo para enseñar.
 *
 * @param {string} kind
 * @param {Record<string, any>} hints `puzzle.hints`
 * @param {{lang: string, locale: string, stages: Record<string, string>, startsWith: string}} words
 *   Textos del idioma: nombres de las fases evolutivas y la plantilla de la inicial.
 * @returns {string}
 */
export function hintText(kind, hints, words) {
  const value = hints?.[kind];
  // Pista guardada que el puzzle ya no trae (p. ej. el tamaño, que se quitó): nada.
  if (value === undefined || value === null) return "";
  const pick = (v) => (typeof v === "object" ? (v[words.lang] ?? v.en ?? "") : String(v));
  switch (kind) {
    case "stage":
      return words.stages[value] ?? value;
    case "size": {
      const n = (x) => new Intl.NumberFormat(words.locale, { maximumFractionDigits: 1 }).format(x);
      return `${n(value.m)} m · ${n(value.kg)} kg`;
    }
    case "letter":
      return words.startsWith.replace("{letter}", value);
    case "generation": {
      const [roman, es, en] = GENERATIONS[value] ?? [String(value), "", ""];
      return `Gen ${roman} · ${words.lang === "es" ? es : en}`;
    }
    default:
      return pick(value);
  }
}
