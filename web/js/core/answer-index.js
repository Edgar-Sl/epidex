/**
 * Índice de respuestas para el autocompletado (búsqueda pura, sin DOM).
 *
 * La comparación ignora tildes, mayúsculas y espacios repetidos (ver text.js)
 * y busca tanto en el nombre como en los alias ("Holanda" -> Países Bajos).
 * El combobox que lo usa está en ui/autocomplete.js.
 */

import { normalize } from "./text.js";

/** @typedef {{id: string, name: string, aliases: string[]}} Answer */
/** @typedef {{answer: Answer, alias: string | null}} Suggestion */

// Puntuación de cada tipo de coincidencia: menor = mejor.
const SCORE = {
  exact: 0,
  namePrefix: 1,
  aliasPrefix: 2,
  wordPrefix: 3,
  substring: 4,
};

export class AnswerIndex {
  /** @param {Answer[]} answers */
  constructor(answers) {
    this.answers = answers;
    /** @type {{answer: Answer, text: string, norm: string, isAlias: boolean}[]} */
    this.keys = answers.flatMap((answer) => [
      { answer, text: answer.name, norm: normalize(answer.name), isAlias: false },
      ...answer.aliases.map((alias) => ({
        answer,
        text: alias,
        norm: normalize(alias),
        isAlias: true,
      })),
    ]);
    this.byNorm = new Map(this.keys.map((k) => [k.norm, k.answer]));
  }

  /**
   * Respuesta cuyo nombre o alias coincide exactamente (tras normalizar) con `text`.
   *
   * @param {string} text
   * @returns {Answer | null}
   */
  resolve(text) {
    return this.byNorm.get(normalize(text)) ?? null;
  }

  /**
   * Sugerencias para lo que ha escrito el jugador, mejores primero.
   *
   * @param {string} query
   * @param {{limit?: number, exclude?: Set<string>}} [options]
   *   exclude: ids que no se deben sugerir (p. ej. los ya probados).
   * @returns {Suggestion[]}
   */
  search(query, { limit = 8, exclude = new Set() } = {}) {
    const q = normalize(query);
    if (!q) return [];
    /** @type {Map<string, {answer: Answer, alias: string | null, score: number}>} */
    const best = new Map();
    for (const key of this.keys) {
      if (exclude.has(key.answer.id)) continue;
      const score = matchScore(key.norm, q, key.isAlias);
      if (score === null) continue;
      const current = best.get(key.answer.id);
      if (!current || score < current.score) {
        best.set(key.answer.id, { answer: key.answer, alias: key.isAlias ? key.text : null, score });
      }
    }
    return [...best.values()]
      .sort((a, b) => a.score - b.score || a.answer.name.localeCompare(b.answer.name, "es"))
      .slice(0, limit)
      .map(({ answer, alias }) => ({ answer, alias }));
  }
}

/**
 * @param {string} norm Texto normalizado del nombre o alias.
 * @param {string} q Consulta normalizada.
 * @param {boolean} isAlias
 * @returns {number | null} Puntuación, o null si no coincide.
 */
function matchScore(norm, q, isAlias) {
  if (norm === q) return SCORE.exact;
  if (norm.startsWith(q)) return isAlias ? SCORE.aliasPrefix : SCORE.namePrefix;
  if (` ${norm}`.includes(` ${q}`)) return SCORE.wordPrefix; // "bajos" -> "Países Bajos"
  if (norm.includes(q)) return SCORE.substring;
  return null;
}
