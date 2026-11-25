/**
 * Texto para compartir el resultado (función pura, sin DOM).
 *
 * Es lo que hizo viral a Wordle: enseña *cómo* te ha ido sin desvelar la
 * respuesta, así que se puede publicar en un grupo sin hacer spoiler, y lleva
 * el enlace para que quien lo vea pueda jugar el mismo puzzle.
 *
 *   Epidex · Gen I #12
 *   🟥⬛🟩⬜⬜⬜
 *   ✅ ¡Capturado en 3/6!
 *   💡 Con pista: Tipo
 *   https://…
 *
 *   🟩 acierto · 🟥 fallo · ⬛ saltado · ⬜ sin usar
 */

const SQUARES = {
  correct: "🟩",
  wrong: "🟥",
  skip: "⬛",
  unused: "⬜",
};

/** Línea del resultado, por idioma. */
const RESULT_LINE = {
  es: { first: "🎯 ¡Capturado a la primera!", won: (s) => `✅ ¡Capturado en ${s}!`, lost: (s) => `💨 Se escapó (${s})` },
  en: { first: "🎯 Caught on the first try!", won: (s) => `✅ Caught in ${s}!`, lost: (s) => `💨 It got away (${s})` },
};

/** Línea de la pista usada (o de no haber usado ninguna), por idioma. */
const HINT_LINE = {
  es: (hint) => `💡 Con pista: ${hint}`,
  en: (hint) => `💡 With a clue: ${hint}`,
};
const NO_HINT = { es: "🧠 Sin pistas", en: "🧠 No clues" };

/**
 * @param {Object} options
 * @param {string} options.gameName
 * @param {number} options.number Número del puzzle.
 * @param {string} options.emoji Etiqueta de la colección ("Gen I") o su emoji.
 * @param {boolean} options.won
 * @param {number} options.attemptsUsed
 * @param {number} options.maxAttempts
 * @param {("correct"|"wrong"|"skip"|"unused")[]} options.results
 * @param {string} [options.url] Enlace al juego.
 * @param {string | null} [options.hint] Nombre de la pista usada; `null` si se jugó
 *   sin pistas; sin definir si el modo no tiene pistas.
 * @returns {string}
 */
export function buildShareText({
  gameName,
  number,
  emoji,
  won,
  attemptsUsed,
  maxAttempts,
  results,
  url,
  hint,
  lang = "es",
}) {
  const words = RESULT_LINE[lang] ?? RESULT_LINE.es;
  const score = `${won ? attemptsUsed : "X"}/${maxAttempts}`;
  const lines = [
    `${gameName} · ${emoji} #${number}`,
    results.map((r) => SQUARES[r]).join(""),
    won ? (attemptsUsed === 1 ? words.first : words.won(score)) : words.lost(score),
  ];
  if (hint) lines.push((HINT_LINE[lang] ?? HINT_LINE.es)(hint));
  else if (hint === null) lines.push(NO_HINT[lang] ?? NO_HINT.es);
  if (url) lines.push(url);
  return lines.join("\n");
}
