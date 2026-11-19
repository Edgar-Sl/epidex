/**
 * Normalización de texto para comparar respuestas.
 *
 * Debe dar exactamente el mismo resultado que `normalize()` en
 * pipeline/answers.py: sin tildes, minúsculas y espacios simples.
 *   "  Japón "         -> "japon"
 *   "REPÚBLICA  Checa" -> "republica checa"
 */

/**
 * @param {string} text
 * @returns {string}
 */
export function normalize(text) {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "") // marcas diacríticas (tildes, diéresis...)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
