/**
 * Idioma de la página y textos de la interfaz que se generan desde JS.
 *
 * El idioma lo fija la página generada (<html lang>, ver pipeline/site.py): la
 * versión en inglés está en la raíz y la española en /es/. Los textos fijos del
 * HTML están en site/strings.json; aquí solo los que pinta el JavaScript.
 *
 * Uso: t("notIt", { name: "Francia" }) -> "No es Francia".
 */

export const LANGS = ["en", "es"];

/** Idioma de esta página ("en" o "es"). */
export const LANG = document.documentElement.lang?.startsWith("es") ? "es" : "en";

/** Configuración regional para Intl (números y fechas). */
export const LOCALE = LANG === "es" ? "es-ES" : "en-US";

const STRINGS = {
  en: {
    loadFailed: "Couldn't load {path} ({status})",
    firstPuzzle: "The first puzzle arrives on {date}.",
    noPuzzle: "There's no puzzle today.",
    tryOtherDay: "Meanwhile you can try another day with ?fecha={date}",
    alreadyTried: "You already tried {name}",
    notIt: "It's not {name}",
    nowCircles: "Now with {n} circles",
    copied: "Result copied. Paste it in the chat!",
    copyFailed: "Couldn't copy the result",
    bonusSummary: "Bonus questions: {right}/{total}",
    bonusStep: "Bonus question {n}/{total}",
    next: "Next",
    seeResult: "See result",
    fullDrawing: "full drawing",
    circles: "{n} circles",
    canvasFull: "Complete shape drawn with epicycles",
    canvasCircles: "Shape drawn with {n} circles",
    tileTitle: "{n} circles · {result}",
    correct: "Correct! {score}",
    lost: "It got away!",
    streakStart: "🔥 Streak started: 1 day",
    streak: "🔥 Streak: {n} days in a row",
    reload: "It's here! Reload",
    resultCorrect: "correct",
    resultWrong: "miss",
    resultSkip: "skipped",
    resultUnused: "unused",
    now: "now",
    played: "Played",
    wins: "Win %",
    currentStreak: "Streak",
    maxStreak: "Best streak",
    distribution: "Guess distribution",
    placeholder: "Who's that Pokémon?",
    subject: "Pokémon",
  },
  es: {
    loadFailed: "No se pudo cargar {path} ({status})",
    firstPuzzle: "El primer puzzle llega el {date}.",
    noPuzzle: "Hoy no hay puzzle.",
    tryOtherDay: "Mientras tanto puedes probar otro día con ?fecha={date}",
    alreadyTried: "Ya has probado {name}",
    notIt: "No es {name}",
    nowCircles: "Ahora con {n} círculos",
    copied: "Resultado copiado. ¡Pégalo en el chat!",
    copyFailed: "No se pudo copiar el resultado",
    bonusSummary: "Preguntas extra: {right}/{total}",
    bonusStep: "Pregunta extra {n}/{total}",
    next: "Siguiente",
    seeResult: "Ver resultado",
    fullDrawing: "dibujo completo",
    circles: "{n} círculos",
    canvasFull: "Figura completa dibujada con epiciclos",
    canvasCircles: "Figura dibujada con {n} círculos",
    tileTitle: "{n} círculos · {result}",
    correct: "¡Correcto! {score}",
    lost: "¡Otra vez será!",
    streakStart: "🔥 Empiezas racha: 1 día",
    streak: "🔥 Racha: {n} días seguidos",
    reload: "¡Ya está! Recarga",
    resultCorrect: "acierto",
    resultWrong: "fallo",
    resultSkip: "saltado",
    resultUnused: "sin usar",
    now: "ahora",
    played: "Jugadas",
    wins: "Victorias",
    currentStreak: "Racha",
    maxStreak: "Mejor racha",
    distribution: "Distribución de intentos",
    placeholder: "¿Quién es ese Pokémon?",
    subject: "Pokémon",
  },
};

/**
 * Texto traducido con sus huecos rellenos.
 * @param {string} key
 * @param {Record<string, string | number>} [values]
 * @param {string} [lang]
 */
export function t(key, values = {}, lang = LANG) {
  const text = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
}

const PREF_KEY = "epidex:lang";

/** Idioma elegido a mano por el jugador (con el selector), o null. */
export function savedLang() {
  try {
    const value = window.localStorage.getItem(PREF_KEY);
    return LANGS.includes(value) ? value : null;
  } catch {
    return null;
  }
}

/** @param {string} lang */
export function saveLang(lang) {
  try {
    window.localStorage.setItem(PREF_KEY, lang);
  } catch {
    // Sin almacenamiento: el idioma se elige por la URL igualmente.
  }
}

/**
 * Idioma que prefiere el navegador entre los disponibles, o null.
 * @param {readonly string[]} [languages] navigator.languages
 */
export function browserLang(languages = navigator.languages ?? [navigator.language]) {
  for (const tag of languages) {
    const lang = String(tag).slice(0, 2).toLowerCase();
    if (LANGS.includes(lang)) return lang;
  }
  return null;
}

/**
 * Selector de idioma y primera visita.
 *
 * - Pulsar el enlace de idioma guarda la elección.
 * - En la primera visita (sin elección guardada) a la página en inglés, si el
 *   navegador está en español, se pasa a la versión española. Solo se redirige
 *   desde la raíz en inglés: los buscadores indexan cada versión por su URL
 *   (hreflang) y un enlace a /es/ siempre abre en español.
 *
 * @returns {boolean} true si va a redirigir (no hace falta arrancar el juego).
 */
export function setupLanguage() {
  const links = /** @type {NodeListOf<HTMLAnchorElement>} */ (document.querySelectorAll("a[data-lang]"));
  for (const link of links) {
    link.addEventListener("click", () => saveLang(link.dataset.lang ?? ""));
    // Conserva ?fecha= al cambiar de idioma (pruebas de otro día).
    if (window.location.search) link.search = window.location.search;
  }
  const wanted = savedLang() ?? browserLang();
  if (wanted && wanted !== LANG && LANG === "en") {
    const target = [...links].find((a) => a.dataset.lang === wanted);
    if (target) {
      window.location.replace(target.href);
      return true;
    }
  }
  return false;
}
