/**
 * Preguntas extra: dos preguntas tipo test al acabar la partida (funciones puras).
 *
 * Las genera el pipeline (pipeline/bonus.py) y van dentro del puzzle:
 *   {"question": "¿Cuál de estos países hace frontera con España?",
 *    "options": ["Italia", "Portugal", "Marruecos", "Argelia"], "answer": 1}
 *
 * Las respuestas del jugador se guardan en el estado de la partida
 * (`state.bonus`, el índice elegido en cada pregunta). No cuentan para la
 * racha ni para las estadísticas: son un rato más de juego y una línea más en
 * el texto para compartir.
 */

/**
 * @typedef {{question: string, options: string[], answer: number}} BonusQuestion
 */

/**
 * Preguntas válidas del puzzle (las mal formadas se ignoran).
 *
 * El pipeline las genera en cada idioma, `{"en": [...], "es": [...]}`; los
 * puzzles antiguos traen una sola lista.
 *
 * @param {{bonus?: unknown}} puzzle
 * @param {string} [lang] Idioma de la página.
 * @returns {BonusQuestion[]}
 */
export function bonusQuestions(puzzle, lang = "es") {
  const raw = puzzle.bonus;
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? (raw[lang] ?? Object.values(raw)[0])
      : null;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (q) =>
      q &&
      typeof q.question === "string" &&
      Array.isArray(q.options) &&
      q.options.length >= 2 &&
      Number.isInteger(q.answer) &&
      q.answer >= 0 &&
      q.answer < q.options.length,
  );
}

/**
 * Índices elegidos hasta ahora.
 * @param {{bonus?: number[]}} state
 * @returns {number[]}
 */
export const bonusChoices = (state) => (Array.isArray(state.bonus) ? state.bonus : []);

/**
 * Responde la pregunta que toca. Solo con la partida acabada y si quedan preguntas.
 *
 * @template {{status: string, bonus?: number[]}} S
 * @param {S} state
 * @param {BonusQuestion[]} questions
 * @param {number} choice Índice de la opción elegida.
 * @returns {{state: S, correct: boolean} | null} null si no se puede responder.
 */
export function answerBonus(state, questions, choice) {
  const chosen = bonusChoices(state);
  const question = questions[chosen.length];
  if (state.status === "playing" || !question) return null;
  if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) return null;
  return {
    state: { ...state, bonus: [...chosen, choice] },
    correct: choice === question.answer,
  };
}

/**
 * Resultado de cada pregunta respondida.
 * @param {{bonus?: number[]}} state
 * @param {BonusQuestion[]} questions
 * @returns {("correct" | "wrong")[]}
 */
export function bonusResults(state, questions) {
  return bonusChoices(state)
    .slice(0, questions.length)
    .map((choice, i) => (choice === questions[i].answer ? "correct" : "wrong"));
}
