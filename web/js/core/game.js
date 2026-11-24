/**
 * Lógica del juego: estado, intentos, niveles y comprobación de respuestas.
 *
 * Todo son funciones puras sobre un objeto de estado inmutable (sin DOM ni
 * localStorage). Así es fácil de probar y de guardar: el estado es JSON plano.
 *
 * Reglas:
 *  - Hay tantos intentos como niveles (6). El intento i muestra levels[i] círculos.
 *  - Una respuesta incorrecta o "saltar" consume el intento y pasa al nivel siguiente.
 *  - Repetir una respuesta ya dada no consume intento.
 *  - Se gana al acertar; se pierde al agotar los intentos.
 *  - Se puede pedir una pista por partida, eligiendo cuál (ver core/hints.js).
 *    No gasta intento, pero queda anotada en el resultado.
 */

/** @typedef {"playing" | "won" | "lost"} Status */
/** @typedef {{type: "guess", id: string} | {type: "skip"}} Attempt */

/**
 * @typedef {Object} GameState
 * @property {number} version     Versión del formato (para migraciones en storage).
 * @property {string} puzzleId
 * @property {number} number      Número del puzzle del día (#12).
 * @property {string} date        "YYYY-MM-DD"
 * @property {string} answer      Id de la respuesta correcta.
 * @property {number[]} levels    Círculos de cada intento.
 * @property {Attempt[]} attempts
 * @property {Status} status
 * @property {string | null} [hint] Pista elegida (tipo, evolución...), si se pidió.
 */

export const STATE_VERSION = 1;

/**
 * Crea una partida nueva.
 *
 * @param {{id: string, answer: string, levels: number[]}} puzzle
 * @param {{number: number, date: string}} entry Entrada del calendario.
 * @returns {GameState}
 */
export function createGame(puzzle, entry) {
  return {
    version: STATE_VERSION,
    puzzleId: puzzle.id,
    number: entry.number,
    date: entry.date,
    answer: puzzle.answer,
    levels: [...puzzle.levels],
    attempts: [],
    status: "playing",
  };
}

/** @param {GameState} state */
export const maxAttempts = (state) => state.levels.length;

/** @param {GameState} state */
export const isOver = (state) => state.status !== "playing";

/**
 * Índice del nivel que se muestra ahora (0..levels.length-1).
 * Al acabar la partida se queda en el del último intento.
 *
 * @param {GameState} state
 */
export function levelIndex(state) {
  const used = state.attempts.length;
  if (state.status === "playing") return Math.min(used, state.levels.length - 1);
  return Math.max(0, used - 1);
}

/**
 * Círculos que hay que dibujar ahora. Al acabar se muestra el máximo.
 *
 * @param {GameState} state
 */
export function circlesToShow(state) {
  if (isOver(state)) return state.levels[state.levels.length - 1];
  return state.levels[levelIndex(state)];
}

/**
 * Ids que el jugador ya ha probado.
 *
 * @param {GameState} state
 * @returns {Set<string>}
 */
export function guessedIds(state) {
  return new Set(state.attempts.filter((a) => a.type === "guess").map((a) => a.id));
}

/**
 * @typedef {"correct" | "wrong" | "skip" | "duplicate" | "over"} Outcome
 * @typedef {{state: GameState, outcome: Outcome}} StepResult
 */

/**
 * Añade un intento si la partida sigue en curso.
 *
 * @param {GameState} state
 * @param {Attempt} attempt
 * @param {boolean} correct
 * @returns {GameState}
 */
function addAttempt(state, attempt, correct) {
  const attempts = [...state.attempts, attempt];
  let status = state.status;
  if (correct) status = "won";
  else if (attempts.length >= maxAttempts(state)) status = "lost";
  return { ...state, attempts, status };
}

/**
 * Intenta adivinar.
 *
 * @param {GameState} state
 * @param {string} answerId Id elegido en el autocompletado.
 * @returns {StepResult}
 */
export function guess(state, answerId) {
  if (isOver(state)) return { state, outcome: "over" };
  if (guessedIds(state).has(answerId)) return { state, outcome: "duplicate" };
  const correct = answerId === state.answer;
  return {
    state: addAttempt(state, { type: "guess", id: answerId }, correct),
    outcome: correct ? "correct" : "wrong",
  };
}

/**
 * Salta el intento actual (pasa al siguiente nivel).
 *
 * @param {GameState} state
 * @returns {StepResult}
 */
export function skip(state) {
  if (isOver(state)) return { state, outcome: "over" };
  return { state: addAttempt(state, { type: "skip" }, false), outcome: "skip" };
}

/**
 * Pide la pista ``kind``. Solo una por partida y solo mientras se juega.
 *
 * @param {GameState} state
 * @param {string} kind
 * @returns {GameState} El estado nuevo, o el mismo si no se puede.
 */
export function takeHint(state, kind) {
  if (isOver(state) || state.hint) return state;
  return { ...state, hint: kind };
}

/**
 * Resultado de cada casilla, para pintar el historial y compartir.
 * Devuelve siempre maxAttempts elementos: los no usados son "unused".
 *
 * @param {GameState} state
 * @returns {("correct" | "wrong" | "skip" | "unused")[]}
 */
export function attemptResults(state) {
  return state.levels.map((_, i) => {
    const a = state.attempts[i];
    if (!a) return "unused";
    if (a.type === "skip") return "skip";
    return a.id === state.answer ? "correct" : "wrong";
  });
}
