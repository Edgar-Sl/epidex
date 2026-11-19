/**
 * Texto para compartir el resultado (función pura, sin DOM).
 *
 * Es lo que hizo viral a Wordle: enseña *cómo* te ha ido sin desvelar la
 * respuesta, así que se puede publicar en un grupo sin hacer spoiler, y lleva
 * el enlace para que quien lo vea pueda jugar el mismo puzzle.
 *
 *   [NOMBRE] 🌍 #12 · 3/6
 *   🟥⬛🟩⬜⬜⬜
 *   Lo saqué con 8 círculos
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

/**
 * @param {Object} options
 * @param {string} options.gameName
 * @param {number} options.number Número del puzzle.
 * @param {string} options.emoji Emoji de la colección.
 * @param {boolean} options.won
 * @param {number} options.attemptsUsed
 * @param {number} options.maxAttempts
 * @param {("correct"|"wrong"|"skip"|"unused")[]} options.results
 * @param {number} [options.circles] Círculos con los que se acertó.
 * @param {string} [options.url] Enlace al juego.
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
  circles,
  url,
}) {
  const score = won ? `${attemptsUsed}/${maxAttempts}` : `X/${maxAttempts}`;
  const lines = [`${gameName} ${emoji} #${number} · ${score}`, results.map((r) => SQUARES[r]).join("")];
  if (won && circles) lines.push(`Lo saqué con ${circles} círculos`);
  if (url) lines.push(url);
  return lines.join("\n");
}
